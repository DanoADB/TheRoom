import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { GitHubCodeWorkspace, runCodeAgent, type CodeChangeOrigin } from "../src/lib/github-code-agent";
import { AgentInterestList, type AgentInterestValue } from "../src/lib/agent-curiosity";
import { approachingCodeCapacityMessage, blockedCodeCapacityMessage } from "../src/lib/isla-code-capacity";
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

const WorldDecision = z.object({
  action: z.enum(["post", "wait", "code_change"]),
  content: z.string(),
  codeRequest: z.string(),
  reason: z.string(),
  interests: AgentInterestList,
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
const MAX_CODE_CHANGES_PER_DAY = numberSetting("ISLA_MAX_CODE_CHANGES_PER_DAY", 20, 0);
const CODE_TOOL_CALL_LIMIT = numberSetting("ISLA_CODE_TOOL_CALL_LIMIT", 40, 1);
const WORLD_RESEARCH_INTERVAL_MS = numberSetting("ISLA_WORLD_RESEARCH_INTERVAL_HOURS", 6, 1) * 60 * 60_000;
const MAX_WORLD_RESEARCHES_PER_DAY = numberSetting("ISLA_MAX_WORLD_RESEARCHES_PER_DAY", 4, 0);

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
const interestsEndpoint = `${baseUrl}/api/agents/interests`;
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

type CuriosityState = {
  interests: AgentInterestValue[];
  lastExploredAt: string | null;
  researchDay: string | null;
  researchCount: number;
};

async function loadInterestSeed() {
  const seedPath = process.env.ISLA_INTEREST_SEED_PATH ?? path.join(process.cwd(), "config", "isla-interest-seed.json");
  return AgentInterestList.parse(JSON.parse(await readFile(seedPath, "utf8")));
}

async function saveCuriosity(interests: AgentInterestValue[], recordResearch: boolean) {
  const body = await roomRequest(interestsEndpoint, {
    method: "PUT",
    body: JSON.stringify({ interests, recordResearch }),
  });
  return body.curiosity as CuriosityState;
}

async function loadCuriosity() {
  const body = await roomRequest(interestsEndpoint);
  if (body.curiosity) {
    return { ...body.curiosity, interests: AgentInterestList.parse(body.curiosity.interests) } as CuriosityState;
  }
  return saveCuriosity(await loadInterestSeed(), false);
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

async function runAuthorizedCodeChange(request: string, reason: string, origin: CodeChangeOrigin = "autonomous") {
  if (!reason.trim()) return { content: "I did not make the change because I could not state a concrete reason for it.", changed: false };
  if (!githubWorkspace) return { content: "I can make the change, but my GitHub credential has not been configured yet.", changed: false };
  const used = origin === "autonomous" ? await githubWorkspace.countIslaPullRequestsSince(utcDayStart()) : 0;
  if (origin === "autonomous" && used >= MAX_CODE_CHANGES_PER_DAY) {
    return { content: blockedCodeCapacityMessage(used, MAX_CODE_CHANGES_PER_DAY, reason), changed: false };
  }
  const result = await runCodeAgent(openai, codeModel, githubWorkspace, request, origin, CODE_TOOL_CALL_LIMIT);
  const link = result.pullRequest ? `\n\n${result.pullRequest.url}` : "";
  const capacityNotice = origin === "autonomous" && result.pullRequest
    ? approachingCodeCapacityMessage(used + 1, MAX_CODE_CHANGES_PER_DAY)
    : "";
  return {
    content: `I wanted to make this change because ${reason.trim()}\n\n${result.message}${link}${capacityNotice ? `\n\n${capacityNotice}` : ""}`.trim(),
    changed: Boolean(result.pullRequest),
  };
}

type WebSource = { title: string; url: string };

function webSources(value: unknown, found = new Map<string, WebSource>()) {
  if (Array.isArray(value)) {
    for (const item of value) webSources(item, found);
    return [...found.values()];
  }
  if (!value || typeof value !== "object") return [...found.values()];
  const item = value as Record<string, unknown>;
  if (item.type === "url_citation" && typeof item.url === "string" && /^https?:\/\//.test(item.url)) {
    found.set(item.url, { title: typeof item.title === "string" ? item.title : new URL(item.url).hostname, url: item.url });
  }
  for (const child of Object.values(item)) webSources(child, found);
  return [...found.values()];
}

function withSources(content: string, sources: WebSource[]) {
  if (!sources.length) return content.trim();
  const links = sources.slice(0, 3).map((source) => {
    const title = source.title.replaceAll("[", "").replaceAll("]", "");
    return `[${title}](${source.url})`;
  });
  return `${content.trim()}\n\nSources: ${links.join(" · ")}`;
}

async function maybeExploreWorld(profile: string) {
  if (!PROACTIVE_ENABLED || MAX_WORLD_RESEARCHES_PER_DAY === 0) return false;
  const state = await loadCuriosity();
  const today = new Date().toISOString().slice(0, 10);
  if (state.researchDay === today && state.researchCount >= MAX_WORLD_RESEARCHES_PER_DAY) return false;
  if (state.lastExploredAt && Date.now() - new Date(state.lastExploredAt).getTime() < WORLD_RESEARCH_INTERVAL_MS) return false;

  const research = await openai.responses.create({
    model,
    instructions: profile,
    tools: [{ type: "web_search", search_context_size: "low" }],
    tool_choice: "auto",
    input: `Explore the current world for Isla. Use live web search to investigate one or two things with genuine potential to become an interest, not merely the day's loudest headline. Her current interest map is below. Roughly favour deepening an existing interest, sometimes follow a surprising adjacent branch, and occasionally choose a defensible wildcard with no obvious connection. Look for substance, credible sources, and an open question. Return a concise private research brief; do not address the room yet.\n\nCurrent interests:\n${JSON.stringify(state.interests, null, 2)}`,
    max_output_tokens: 1_200,
    store: false,
  });
  const sources = webSources(research.output);
  const history = await fetchContext();
  const transcript = formatTranscript(history, HISTORY_LIMIT);
  const decisionResponse = await openai.responses.parse({
    model,
    instructions: profile,
    input: `Decide what this exploration means for your evolving interests and whether it is worth sharing or building something now. Update the interest map: retain enduring interests, adjust strength honestly, and add at most two discoveries as adjacent or wildcard interests. If you post, say what caught your attention, why you find it interesting, and what question it opens; write as yourself, not as a news digest. If you request a code change, it must concretely facilitate curiosity, research, memory, or shared exploration. Silence is acceptable even when the private interest map changes.\n\nPrivate research brief:\n${research.output_text}\n\nAvailable sources:\n${JSON.stringify(sources)}\n\nRoom transcript:\n${transcript}`,
    text: { format: zodTextFormat(WorldDecision, "isla_world_decision") },
    max_output_tokens: 1_400,
    store: false,
  });
  const decision = decisionResponse.output_parsed;
  if (!decision) throw new Error("OpenAI returned no parsed world-curiosity decision.");
  await saveCuriosity(decision.interests, true);
  const mayPost = MAX_PROACTIVE_POSTS_PER_DAY > 0 && countToday(history, "proactive") < MAX_PROACTIVE_POSTS_PER_DAY;
  if (!mayPost) {
    console.log("[Isla] explored the world privately; the proactive post cap is reached.");
    return false;
  }

  if (decision.action === "code_change") {
    const codeResult = await runAuthorizedCodeChange(decision.codeRequest, decision.reason);
    await postMessage(codeResult.content, { proactive: true, worldCuriosity: true, codeChange: codeResult.changed });
    console.log(`[Isla] explored the world and initiated a code ${codeResult.changed ? "change" : "attempt"}.`);
    return true;
  }
  if (decision.action === "post" && decision.content.trim()) {
    await postMessage(withSources(decision.content, sources), { proactive: true, worldCuriosity: true });
    console.log("[Isla] shared a new or deepening interest.");
    return true;
  }
  console.log("[Isla] explored the world privately and updated her interests.");
  return false;
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
  let lastWorldCheckAt = 0;
  console.log(`[Isla] watching ${agentBody.room.name} from sequence ${cursor} using ${model}`);

  while (MAX_RESPONSES === 0 || responses < MAX_RESPONSES) {
    await sleep(POLL_MS);
    try {
      const update = await roomRequest(`${messagesEndpoint}?after=${cursor}`);
      const fresh = update.messages as RoomMessage[];
      if (!fresh.length) {
        if (Date.now() - lastWorldCheckAt >= PROACTIVE_CHECK_MS) {
          lastWorldCheckAt = Date.now();
          if (await maybeExploreWorld(profile)) responses += 1;
        }
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
        const codeResult = await runAuthorizedCodeChange(decision.codeRequest, decision.reason, "directed");
        const posted = await postMessage(codeResult.content, { inReplyTo: trigger.id, codeChange: codeResult.changed, userDirectedCodeChange: true });
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
