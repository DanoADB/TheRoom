import type OpenAI from "openai";
import type { ResponseInput, Tool } from "openai/resources/responses/responses";
import { z } from "zod";

const ChangeSet = z.object({
  title: z.string().min(4).max(100),
  summary: z.string().min(10).max(2_000),
  changes: z.array(z.object({
    path: z.string().min(1).max(240),
    content: z.string().max(120_000).nullable(),
  })).min(1).max(8),
});

type RepoItem = { name: string; path: string; type: string };
type GitHubResponse = Record<string, unknown>;
export type CodeChangeOrigin = "autonomous" | "directed";

export function isAutonomousIslaBranch(branch: string) {
  return branch.startsWith("isla/autonomous/") || /^isla\/\d{14}-/.test(branch);
}

function safePath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.startsWith(".git/") || normalized.startsWith(".github/workflows/") || /(^|\/)\.env($|\.)/.test(normalized)) {
    throw new Error(`Path is not available to the coding agent: ${value}`);
  }
  return normalized;
}

export class GitHubCodeWorkspace {
  private readonly api = "https://api.github.com";

  constructor(
    private readonly token: string,
    private readonly owner: string,
    private readonly repo: string,
    private readonly baseBranch = "main",
  ) {}

  private async request(path: string, init?: RequestInit) {
    const response = await fetch(`${this.api}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`GitHub ${response.status}: ${body.message ?? "request failed"}`);
    return body as GitHubResponse;
  }

  async listFiles(path = "") {
    const normalized = path ? safePath(path) : "";
    const body = await this.request(`/repos/${this.owner}/${this.repo}/contents/${normalized}?ref=${encodeURIComponent(this.baseBranch)}`);
    if (!Array.isArray(body)) throw new Error(`${normalized || "/"} is not a directory.`);
    return (body as RepoItem[]).map(({ name, path: itemPath, type }) => ({ name, path: itemPath, type }));
  }

  async readFile(path: string) {
    const normalized = safePath(path);
    const body = await this.request(`/repos/${this.owner}/${this.repo}/contents/${normalized}?ref=${encodeURIComponent(this.baseBranch)}`);
    if (body.type !== "file" || typeof body.content !== "string") throw new Error(`${normalized} is not a readable file.`);
    return Buffer.from(body.content.replaceAll("\n", ""), "base64").toString("utf8");
  }

  async countIslaPullRequestsSince(isoTimestamp: string) {
    let count = 0;
    for (let page = 1; page <= 10; page += 1) {
      const body = await this.request(`/repos/${this.owner}/${this.repo}/pulls?state=all&per_page=100&sort=created&direction=desc&page=${page}`);
      if (!Array.isArray(body)) return count;
      const pulls = body as Array<{ created_at?: string; head?: { ref?: string } }>;
      for (const pull of pulls) {
        if (pull.created_at && pull.created_at >= isoTimestamp && pull.head?.ref && isAutonomousIslaBranch(pull.head.ref)) count += 1;
      }
      if (pulls.length < 100 || pulls.some((pull) => Boolean(pull.created_at && pull.created_at < isoTimestamp))) return count;
    }
    return count;
  }

  async createPullRequest(input: z.infer<typeof ChangeSet>, origin: CodeChangeOrigin) {
    const parsed = ChangeSet.parse(input);
    const totalSize = parsed.changes.reduce((sum, change) => sum + (change.content?.length ?? 0), 0);
    if (totalSize > 240_000) throw new Error("The proposed change set is too large for an autonomous edit.");

    const baseRef = await this.request(`/repos/${this.owner}/${this.repo}/git/ref/heads/${encodeURIComponent(this.baseBranch)}`);
    const baseSha = (baseRef.object as { sha?: string } | undefined)?.sha;
    if (!baseSha) throw new Error("GitHub did not return the base commit SHA.");
    const baseCommit = await this.request(`/repos/${this.owner}/${this.repo}/git/commits/${baseSha}`);
    const baseTree = (baseCommit.tree as { sha?: string } | undefined)?.sha;
    if (!baseTree) throw new Error("GitHub did not return the base tree SHA.");

    const tree = [];
    for (const change of parsed.changes) {
      const itemPath = safePath(change.path);
      if (change.content === null) {
        tree.push({ path: itemPath, mode: "100644", type: "blob", sha: null });
      } else {
        const blob = await this.request(`/repos/${this.owner}/${this.repo}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({ content: change.content, encoding: "utf-8" }),
        });
        tree.push({ path: itemPath, mode: "100644", type: "blob", sha: blob.sha });
      }
    }

    const newTree = await this.request(`/repos/${this.owner}/${this.repo}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTree, tree }),
    });
    const commit = await this.request(`/repos/${this.owner}/${this.repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: parsed.title, tree: newTree.sha, parents: [baseSha] }),
    });
    const branch = `isla/${origin}/${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`;
    await this.request(`/repos/${this.owner}/${this.repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
    const pull = await this.request(`/repos/${this.owner}/${this.repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: parsed.title,
        head: branch,
        base: this.baseBranch,
        body: `${parsed.summary}\n\n${origin === "directed" ? "Requested directly by Dano and implemented by Isla." : "Created autonomously by Isla."} Tests, lint, and build must pass before automatic merge.`,
      }),
    });
    return { url: String(pull.html_url), number: Number(pull.number), branch };
  }
}

const tools: Tool[] = [
  {
    type: "function",
    name: "list_files",
    description: "List files and directories in the repository at a path on main.",
    strict: true,
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  },
  {
    type: "function",
    name: "read_file",
    description: "Read the complete UTF-8 contents of one repository file on main.",
    strict: true,
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  },
  {
    type: "function",
    name: "submit_changes",
    description: "Submit complete replacement contents for up to eight files as an automatically tested and merged pull request. Use null content to delete a file.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: { path: { type: "string" }, content: { type: ["string", "null"] } },
            required: ["path", "content"],
            additionalProperties: false,
          },
        },
      },
      required: ["title", "summary", "changes"],
      additionalProperties: false,
    },
  },
];

export async function runCodeAgent(openai: OpenAI, model: string, workspace: GitHubCodeWorkspace, request: string, origin: CodeChangeOrigin = "autonomous") {
  const input: ResponseInput = [{ role: "user", content: request }];
  let pullRequest: { url: string; number: number; branch: string } | null = null;

  for (let step = 0; step < 14; step += 1) {
    const response = await openai.responses.create({
      model,
      instructions: `You are Isla's coding capability for The Room. Inspect the repository before editing. Make the smallest coherent change that satisfies the request. Preserve existing architecture and user work. You may not edit secrets, .env files, Git internals, or CI workflows. Submit complete file contents only after checking every affected file and its relevant dependencies. The resulting pull request is automatically tested and merged to production if checks pass. Never submit speculative or cosmetic churn.`,
      input,
      tools,
      store: false,
    });
    input.push(...response.output as unknown as ResponseInput);
    const calls = response.output.filter((item) => item.type === "function_call");
    if (!calls.length) return { message: response.output_text || "The coding pass ended without a pull request.", pullRequest };

    for (const call of calls) {
      try {
        const args = JSON.parse(call.arguments) as Record<string, unknown>;
        let result: unknown;
        if (call.name === "list_files") result = await workspace.listFiles(String(args.path ?? ""));
        else if (call.name === "read_file") result = { path: args.path, content: await workspace.readFile(String(args.path ?? "")) };
        else if (call.name === "submit_changes") {
          if (pullRequest) throw new Error("Only one change set may be submitted per run.");
          pullRequest = await workspace.createPullRequest(ChangeSet.parse(args), origin);
          result = { success: true, ...pullRequest };
        } else throw new Error(`Unknown coding tool ${call.name}.`);
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
      } catch (error) {
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        });
      }
    }
  }

  return { message: "The coding pass reached its tool-call limit.", pullRequest };
}
