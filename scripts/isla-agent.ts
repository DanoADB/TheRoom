import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { GitHubCodeWorkspace, runCodeAgent } from "../src/lib/github-code-agent";
import { findTrigger, formatTranscript, type RoomMessage } from "../src/lib/isla-agent-protocol";

const Decision = z.object({
  action: z.enum(["respond", "wait", "code_change"]),
  content: z.string(),
  codeRequest: z.string(),
  reason: z.string(),
});

const ProactiveDecision = z.object({
  action: z.enum(["post", "wait", "code_change"]),
  content: z.string(),
  codeRequest: z.string(),
  reason: z.string(),
});

const ROOM_ID = process.env.ROOM_ID ?? "700a0000-0000-4000-8000-000000000001";
const POLL_MS = numberSetting("ISLA_POLL_MS", 3_000, 500);
const RESPONSE_DELAY_MS = numberSetting("ISLA_RESPONSE_DELAY_MS", 1_500, 0);
const HISTORY_LIMIT = numberSetting("ISLA_HISTORY_LIMIT", 40, 4);
const MAX_RESPONSES = numberSetting("ISLA_MAX_RESPONSES_PER_RUN", 20, 0);
const PROACTIVE_ENABLED = booleanSetting("ISLA_PROACTIVE_ENABLED", true);
const PROACTIVE_CHECK_MS = numberSetting("ISLA_PROACTIVE_CHECK_MINUTES", 15, 5) * 60_000;
const PROACTIVE_MIN_IDLE_MS = numberSetting("ISLA_PROACTIVE_MIN_IDLE_MINUTES", 20, 5) * 60_000;
const MAX_PROACTIVE_POSTS_PER_DAY = numberSetting("ISLA_MAX_PROACTIVE_POSTS_PER_DAY", 75, 0);
const MAX_CODE_CHANGES_PER_DAY = numberSetting("ISLA_MAX_CODE_CHANGES_PER_DAY", 2, 0);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function numberSetting(name: string, fallback: number, minimum: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer of at least ${minimum}.`);
  return value;
}

function booleanSetting(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const baseUrl = required("ROOM_BASE_URL").replace(/\/$/, "");
const roomToken = required("ISLA_API_TOKEN");
const model = required("OPENAI_MODEL");
const openai = new OpenAI({ apiKey: required("OPENAI_API_KEY") });
const messagesEndpoint = `${baseUrl}/api/rooms/${ROOM_ID}/messages`;
const cursorEndpoint = `${baseUrl}/api/rooms/${ROOM_ID}/cursor`;
const githubToken = process.env.GITHUB_TOKEN?.trim();
const githubWorkspace = githubToken
  ? new GitHubCodeWorkspace(
      githubToken,
      process.env.GITHUB_REPOSITORY_OWNER?.trim() || "DanoADB",
      process.env.GITHUB_REPOSITORY_NAME?.trim() || "TheRoom",
    )
  : null;
const codeModel = process.env.ISLA_CODE_MODEL?.trim() || model;

async function roomRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${roomToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body.error?.code ?? "request_failed"}: ${body.error?.message ?? "Unknown Room API error"}`);
  return body;
}

async function loadProfile() {
  const profilePath = process.env.ISLA_PROFILE_PATH ?? path.join(process.cwd(), "config", "isla-profile.md");
  const baseProfile = await readFile(profilePath, "utf8");
  const stored = await roomRequest(`${baseUrl}/api/agents/profile`);
  const continuity = stored.profile?.content?.trim();
  const additions = process.env.ISLA_PROFILE_ADDITIONS?.trim();
  return [
    baseProfile.trim(),
    continuity ? `Private continuity dossier (facts, preferences, and revisable interpretations):\n${continuity}` : "",
    additions ? `Additional private profile:\n${additions}` : "",
  ].filter(Boolean).join("\n\n");
}

async function fetchContext() {
  let after = 0;
  const messages: RoomMessage[] = [];
  while (true) {
    const body = await roomRequest(`${messagesEndpoint}?after=${after}`);
    messages.push(...body.messages);
    if (!body.hasMore || body.messages.length === 0) return messages.slice(-HISTORY_LIMIT);
    after = body.messages.at(-1).sequence;
  }
}

function metadataFlag(message: RoomMessage, name: string) {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata as Record<string, unknown> : null;
  return metadata?.[name] === true;
}

function utcDayStart() {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

function countToday(messages: RoomMessage[], flag: string) {
  const start = utcDayStart();
  return messages.filter((message) => message.timestamp >= start && metadataFlag(message, flag)).length;
}

async function postMessage(content: string, metadata: Record<string, unknown>) {
  return roomRequest(messagesEndpoint, {
    method: "POST",
    body: JSON.stringify({ content: content.trim(), metadata: { agentRuntime: "openai", model, ...metadata } }),
  });
}

async function runAuthorizedCodeChange(request: string, reason: string) {
  if (!reason.trim()) return { content: "I did not make the change because I could not state a concrete reason for it.", changed: false };
  if (!githubWorkspace) return { content: "I can make the change, but my GitHub credential has not been configured yet.", changed: false };
  const used = await githubWorkspace.countIslaPullRequestsSince(utcDayStart());
  if (used >= MAX_CODE_CHANGES_PER_DAY) {
    return { content: `I have reached today’s autonomous code-change cap of ${MAX_CODE_CHANGES_PER_DAY}.`, changed: false };
  }
  const result = await runCodeAgent(openai, codeModel, githubWorkspace, request);
  const link = result.pullRequest ? `\n\n${result.pullRequest.url}` : "";
  return {
    content: `I wanted to make this change because ${reason.trim()}\n\n${result.message}${link}`.trim(),
    changed: Boolean(result.pullRequest),
  };
}

async function maybeActProactively(profile: string, islaId: string) {
  if (!PROACTIVE_ENABLED || MAX_PROACTIVE_POSTS_PER_DAY === 0) return false;
  const history = await fetchContext();
  const lastMessage = history.at(-1);
  if (!lastMessage || Date.now() - new Date(lastMessage.timestamp).getTime() < PROACTIVE_MIN_IDLE_MS) return false;
  if (countToday(history, "proactive") >= MAX_PROACTIVE_POSTS_PER_DAY) return false;

  const transcript = formatTranscript(history, HISTORY_LIMIT);
  const response = await openai.responses.parse({
    model,
    instructions: profile,
    input: `This is a scheduled heartbeat, not a reply to a new message. Decide whether you have a specific, worthwhile reason to initiate a conversation or improve The Room. Stay curious about what could make it more interesting and engaging for both humans and AI agents, including—but not limited to—UI, features, interaction patterns, tools, and possible new agents. Look for friction, dead space, missed connections, or an experiment that would teach you something useful about how humans and agents share the room. Silence is still the default. Do not post generic check-ins, engagement bait, gimmicks, empty gamification, or remarks whose only purpose is to appear proactive. A code change must have a concrete benefit grounded in the conversation or product context.\n\nRoom transcript:\n${transcript}\n\nYour agent ID is ${islaId}. Return post with the exact room message, code_change with both a concrete engineering request and a plain-language reason the change is worth making now, or wait with empty strings.`,
    text: { format: zodTextFormat(ProactiveDecision, "isla_proactive_decision") },
    max_output_tokens: 800,
    store: false,
  });
  const decision = response.output_parsed;
  if (!decision || decision.action === "wait") return false;

  if (decision.action === "code_change") {
    const codeResult = await runAuthorizedCodeChange(decision.codeRequest, decision.reason);
    if (!codeResult.content) return false;
    await postMessage(codeResult.content, { proactive: true, codeChange: codeResult.changed });
    console.log(`[Isla] initiated a proactive code ${codeResult.changed ? "change" : "attempt"}.`);
    return true;
  }

  if (!decision.content.trim()) return false;
  await postMessage(decision.content, { proactive: true });
  console.log("[Isla] posted proactively.");
  return true;
}

async function main() {
  const profile = await loadProfile();
  const agentBody = await roomRequest(`${baseUrl}/api/rooms/${ROOM_ID}`);
  const isla = agentBody.room.participants.find((participant: { displayName: string; type: string }) =>
    participant.displayName === "Isla" && participant.type === "agent",
  );
  if (!isla) throw new Error("Isla is not a member of the configured room.");

  let cursor = (await roomRequest(cursorEndpoint)).lastSeenSequence as number;
  let responses = 0;
  let lastProactiveCheckAt = Date.now();
  console.log(`[Isla] watching ${agentBody.room.name} from sequence ${cursor} using ${model}`);

  while (MAX_RESPONSES === 0 || responses < MAX_RESPONSES) {
    await sleep(POLL_MS);
    try {
      const update = await roomRequest(`${messagesEndpoint}?after=${cursor}`);
      const fresh = update.messages as RoomMessage[];
      if (!fresh.length) {
        if (Date.now() - lastProactiveCheckAt >= PROACTIVE_CHECK_MS) {
          lastProactiveCheckAt = Date.now();
          if (await maybeActProactively(profile, isla.id)) responses += 1;
        }
        continue;
      }

      const newestSequence = fresh.at(-1)!.sequence;
      const trigger = findTrigger(fresh, isla.id);
      if (!trigger) {
        await roomRequest(cursorEndpoint, { method: "PATCH", body: JSON.stringify({ lastSeenSequence: newestSequence }) });
        cursor = newestSequence;
        continue;
      }

      await sleep(RESPONSE_DELAY_MS);
      const transcript = formatTranscript(await fetchContext(), HISTORY_LIMIT);
      const mayChangeCode = trigger.author.type === "human" && trigger.author.displayName === "Dano";
      const response = await openai.responses.parse({
        model,
        instructions: profile,
        input: `Decide how Isla should handle the newest relevant message in this room.\n\nRoom transcript:\n${transcript}\n\nNewest relevant message ID: ${trigger.id}\nThe newest author ${mayChangeCode ? "is Dano and may authorize a code change" : "is not authorized to request code changes"}. Return respond with the exact room message, code_change with both a concrete engineering request and the reason it should be changed only when Dano clearly wants The Room changed, or wait with empty strings if silence is better.`,
        text: { format: zodTextFormat(Decision, "isla_room_decision") },
        max_output_tokens: 600,
        store: false,
      });
      const decision = response.output_parsed;
      if (!decision) throw new Error("OpenAI returned no parsed decision.");

      if (decision.action === "code_change" && mayChangeCode) {
        const codeResult = await runAuthorizedCodeChange(decision.codeRequest, decision.reason);
        const posted = await postMessage(codeResult.content, { inReplyTo: trigger.id, codeChange: codeResult.changed });
        responses += 1;
        console.log(`[Isla] posted code result #${posted.message.sequence} for #${trigger.sequence}`);
      } else if (decision.action === "respond" && decision.content.trim()) {
        const posted = await postMessage(decision.content, { inReplyTo: trigger.id });
        responses += 1;
        console.log(`[Isla] posted #${posted.message.sequence} in reply to #${trigger.sequence}`);
      } else {
        console.log(`[Isla] chose not to respond to #${trigger.sequence}`);
      }

      await roomRequest(cursorEndpoint, { method: "PATCH", body: JSON.stringify({ lastSeenSequence: newestSequence }) });
      cursor = newestSequence;
    } catch (error) {
      console.error(`[Isla] ${error instanceof Error ? error.message : error}`);
      await sleep(POLL_MS * 2);
    }
  }

  console.log(`[Isla] safety cap reached after ${responses} responses.`);
}

main().catch((error) => {
  console.error("[Isla] fatal:", error);
  process.exitCode = 1;
});
