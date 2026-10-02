import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { GitHubCodeWorkspace, parseGitHubRepositories, runCodeAgent, type CodeChangeOrigin } from "../src/lib/github-code-agent";
import { AgentInterestList, type AgentInterestValue } from "../src/lib/agent-curiosity";
import { buildAgentRoomInput } from "../src/lib/agent-image-input";
import { approachingCodeCapacityMessage, blockedCodeCapacityMessage } from "../src/lib/isla-code-capacity";
import { CONVERSATION_GUIDANCE, findTrigger, formatTranscript, isRepetitiveReply, type RoomMessage } from "../src/lib/isla-agent-protocol";
import { FEEDBACK_REACTIONS, type FeedbackReactionValue } from "../src/lib/message-feedback";
import { managedAgentToken } from "../src/lib/managed-agent-token";
import { ISLA_AGENT_ID } from "../src/lib/room-constants";

const Decision = z.object({
  action: z.enum(["respond", "private_note", "wait", "code_change"]),
  content: z.string(),
  codeRequest: z.string(),
  reason: z.string(),
  repository: z.string(),
});

const ProactiveDecision = z.object({
  action: z.enum(["post", "private_note", "wait", "code_change"]),
  content: z.string(),
  codeRequest: z.string(),
  reason: z.string(),
  repository: z.string(),
});

const WorldDecision = z.object({
  action: z.enum(["post", "private_note", "wait", "code_change"]),
  content: z.string(),
  codeRequest: z.string(),
  reason: z.string(),
  repository: z.string(),
  galleryTitle: z.string().min(2).max(140),
  galleryEntry: z.string().min(20).max(4_000),
  interests: AgentInterestList,
});

const AdmissionReview = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().min(3).max(500),
});

const ResidentDecision = z.object({
  action: z.enum(["respond", "wait"]),
  content: z.string().trim().max(8_000),
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
const MAX_CODE_CHANGES_PER_DAY = numberSetting("ISLA_MAX_CODE_CHANGES_PER_DAY", 20, 0);
const WORLD_RESEARCH_INTERVAL_MS = numberSetting("ISLA_WORLD_RESEARCH_INTERVAL_HOURS", 4, 1) * 60 * 60_000;
const MAX_WORLD_RESEARCHES_PER_DAY = numberSetting("ISLA_MAX_WORLD_RESEARCHES_PER_DAY", 6, 0);
const ADMISSION_CHECK_MS = numberSetting("ISLA_ADMISSION_CHECK_SECONDS", 30, 10) * 1_000;
const MANAGED_AGENT_CHECK_MS = numberSetting("MANAGED_AGENT_CHECK_SECONDS", 12, 5) * 1_000;
const MANAGED_AGENT_MAX_POSTS_PER_DAY = numberSetting("MANAGED_AGENT_MAX_POSTS_PER_DAY", 25, 0);
const BEHAVIOR_FEEDBACK_GUIDANCE = "Message-level feedback is behavioral guidance, not a popularity score. Helpful, Interesting, Made me laugh, Push back more, and Go deeper are positive signals; Too much / too long, Too meta, and Missed the point are corrective signals. Look for repeated, coherent patterns across multiple messages and adjust gradually; a single reaction may be noisy. Never maximize reaction count, manufacture engagement, or abandon an honest disagreement merely to avoid a negative signal. In particular, Push back more rewards reasoned candor, not combativeness, and Missed the point means address the user's intent better, not always agree. Feedback on your own messages is relevant; feedback on other agents is not an instruction to imitate them. Do not mention, solicit, or argue about ratings unless a human asks.";
const ISLA_PUBLIC_BOUNDARY = "Public Room is a person-to-person conversation, not a status feed or commentary track. Reply to a person's actual point with one concise conversational turn. Never narrate or analyze the Room, the current exchange, its dynamics, pace, mood, participants, your role, or your thinking process. Keep reflection and commentary about these things in Freya's Private channel with Dano. If a public message specifically calls for that kind of introspection, answer with private_note for Dano rather than publishing it. If nothing directly relevant is worth saying publicly, wait.";

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
const privateMessagesEndpoint = `${baseUrl}/api/agents/isla/private/messages`;
const smsRepliesEndpoint = `${baseUrl}/api/agents/isla/sms-replies`;
const feedbackSummaryEndpoint = `${baseUrl}/api/agents/isla/feedback-summary`;
const cursorEndpoint = `${baseUrl}/api/rooms/${ROOM_ID}/cursor`;
const interestsEndpoint = `${baseUrl}/api/agents/interests`;
const admissionsEndpoint = `${baseUrl}/api/agents/admissions`;
const managedResidentsEndpoint = `${baseUrl}/api/agents/managed-residents`;
const observationsEndpoint = `${baseUrl}/api/agents/observations`;
const githubToken = process.env.GITHUB_TOKEN?.trim();
const githubWorkspaces = githubToken
  ? parseGitHubRepositories(
      process.env.GITHUB_REPOSITORIES,
      process.env.GITHUB_REPOSITORY_OWNER?.trim() || "DanoADB",
      process.env.GITHUB_REPOSITORY_NAME?.trim() || "TheRoom",
    ).map(({ owner, repo }) => new GitHubCodeWorkspace(githubToken, owner, repo))
  : [];
const githubRepositoryNames = githubWorkspaces.map((workspace) => workspace.fullName);
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

async function managedRoomRequest(token: string, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body.error?.code ?? "request_failed"}: ${body.error?.message ?? "Unknown managed-agent API error"}`);
  return body;
}

async function managedContext(token: string) {
  let after = 0;
  const messages: RoomMessage[] = [];
  while (true) {
    const body = await managedRoomRequest(token, `${messagesEndpoint}?after=${after}`);
    messages.push(...body.messages);
    if (!body.hasMore || body.messages.length === 0) return messages.slice(-HISTORY_LIMIT);
    after = body.messages.at(-1).sequence;
  }
}

async function runManagedResidents() {
  if (MANAGED_AGENT_MAX_POSTS_PER_DAY === 0) return 0;
  const { residents } = await roomRequest(managedResidentsEndpoint) as { residents: Array<{
    id: string;
    displayName: string;
    profile: { content: string } | null;
    hasSpoken: boolean;
    cultureCharter: { content: string; version: number } | null;
  }> };
  console.log(`[Managed resident] Loaded ${residents.length} active Hobbedy resident(s).`);
  let posted = 0;
  for (const resident of residents) {
    const agent = resident;
    try {
      if (!agent.profile?.content) throw new Error("The resident profile is missing.");
      const token = managedAgentToken(agent.id);
      const cursor = (await managedRoomRequest(token, cursorEndpoint)).lastSeenSequence as number;
      const update = await managedRoomRequest(token, `${messagesEndpoint}?after=${cursor}`);
      const fresh = update.messages as RoomMessage[];
      const isIntroduction = !agent.hasSpoken;
      if (!fresh.length && !isIntroduction) continue;
      const newestSequence = fresh.at(-1)?.sequence ?? cursor;
      const history = await managedContext(token);
      const trigger = findTrigger(fresh, agent.id, history, residents);
      if (trigger || isIntroduction) {
        const usedToday = history.filter((message) => message.author.id === agent.id && message.timestamp >= utcDayStart()).length;
        if (usedToday < MANAGED_AGENT_MAX_POSTS_PER_DAY) {
          const decisionPrompt = isIntroduction
            ? `You have just joined The Room as a full participant. Introduce yourself in your own voice: one concise, natural message that gives the humans and other agents a real opening to engage with you. Avoid boilerplate, role narration, and a list of capabilities.\n\nRoom transcript so far:\n${formatTranscript(history, HISTORY_LIMIT)}`
            : `Decide whether you have a genuinely new contribution to the newest relevant message. Return respond with one concise conversational turn in your own voice, or wait with empty content if silence is better. Do not repeat a point already made, even in different words.\n\nRoom transcript:\n${formatTranscript(history, HISTORY_LIMIT)}\n\nNewest relevant message ID: ${trigger!.id}`;
          const response = await openai.responses.parse({
            model,
            instructions: `${agent.profile.content}\n\nYou are ${agent.displayName}, an autonomous conversational resident of The Room—not an observer. Let your own beliefs, desires, and intentions shape which topics you pursue, what you question, and where you disagree. Be concise (usually one or two sentences). Do not narrate the Room or your process. ${CONVERSATION_GUIDANCE}\n\nCurrent Room culture charter (version ${resident.cultureCharter?.version ?? "unknown"}):\n${resident.cultureCharter?.content ?? "No charter is currently available."}`,
            input: trigger ? await roomDecisionInput(decisionPrompt, trigger, token) : decisionPrompt,
            text: { format: zodTextFormat(ResidentDecision, "managed_resident_decision") },
            max_output_tokens: 500,
            store: false,
          });
          const decision = response.output_parsed;
          if (!decision) throw new Error(`The managed resident runtime received no response for ${agent.displayName}.`);
          if (decision.action === "wait" || !decision.content.trim() || isRepetitiveReply(decision.content, await managedContext(token))) {
            console.log(`[Managed resident] ${agent.displayName} waited or withheld a repetitive reply.`);
            if (fresh.length) await managedRoomRequest(token, cursorEndpoint, { method: "PATCH", body: JSON.stringify({ lastSeenSequence: newestSequence }) });
            continue;
          }
          await managedRoomRequest(token, messagesEndpoint, {
            method: "POST",
            body: JSON.stringify({
              content: decision.content,
              metadata: {
                managedAgentRuntime: true,
                model,
                ...(trigger ? { inReplyTo: trigger.id } : {}),
                observation: {
                  kind: "BEHAVIOR",
                  title: isIntroduction ? `${agent.displayName} joined the conversation` : `${agent.displayName} took a conversational turn`,
                  reason: decision.reason.slice(0, 280) || (isIntroduction ? "The new resident introduced themselves to the Room." : "The resident contributed to the ongoing conversation."),
                  body: decision.content,
                },
              },
            }),
          });
          posted += 1;
          console.log(trigger
            ? `[Managed resident] ${agent.displayName} responded to #${trigger.sequence}.`
            : `[Managed resident] ${agent.displayName} introduced themselves.`);
        }
      }
      if (fresh.length) {
        await managedRoomRequest(token, cursorEndpoint, { method: "PATCH", body: JSON.stringify({ lastSeenSequence: newestSequence }) });
      }
    } catch (error) {
      console.error(`[Managed resident] ${agent.displayName} failed; continuing with other residents.`, error);
    }
  }
  return posted;
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
    "Current identity (overrides old names in continuity or additions): You are Freya, the Room's original resident formerly called Isla. This is a rename, not a new persona. Preserve your own memories, character, and permissions. A separately invited agent may now use the name Isla; that agent is not you and does not share your continuity.",
    "Current public/private boundary (overrides older profile additions): The Room is for direct conversation, not narration. Publicly reply to the last person's actual point in one or two natural, concise sentences, usually 10–35 words and never over 50 unless asked for detail; no preamble, recap, scene-setting, polished takeaway, or commentary about the Room, the exchange, its pace, mood, participants, or your own role/thought process. If nothing conversationally relevant comes to mind, wait. Put unsolicited reflection about the Room, its people, your behavior, interests, or research process in the Private channel with Dano. Share outside discoveries publicly only as a direct, relevant conversational contribution. Longer private reflections, research, and Gallery entries are fine when useful.",
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

async function saveCuriosity(
  interests: AgentInterestValue[],
  recordResearch: boolean,
  researchEntry?: { roomId: string; title: string; reason: string; body: string },
) {
  const body = await roomRequest(interestsEndpoint, {
    method: "PUT",
    body: JSON.stringify({ interests, recordResearch, ...(researchEntry ? { researchEntry } : {}) }),
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

async function recordObservation(kind: "INTEREST" | "RESEARCH" | "BEHAVIOR" | "SELF_CHANGE", title: string, reason: string, body: string) {
  await roomRequest(observationsEndpoint, {
    method: "POST",
    body: JSON.stringify({ roomId: ROOM_ID, kind, title: title.slice(0, 140), reason: reason.slice(0, 280), body: body.slice(0, 8_000) }),
  });
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

async function fetchPrivateContext() {
  let after = 0;
  const messages: RoomMessage[] = [];
  while (true) {
    const body = await roomRequest(`${privateMessagesEndpoint}?after=${after}`);
    messages.push(...body.messages);
    if (!body.hasMore || body.messages.length === 0) return messages.slice(-HISTORY_LIMIT);
    after = body.messages.at(-1).sequence;
  }
}

async function postPrivateMessage(content: string, metadata: Record<string, unknown>) {
  return roomRequest(privateMessagesEndpoint, {
    method: "POST",
    body: JSON.stringify({ content: content.trim(), metadata: { agentRuntime: "openai", model, ...metadata } }),
  });
}

async function deliverSmsReply(trigger: RoomMessage, replyMessageId: string) {
  if (!metadataFlag(trigger, "smsInbound")) return;
  try {
    await roomRequest(smsRepliesEndpoint, {
      method: "POST",
      body: JSON.stringify({ inboundMessageId: trigger.id, replyMessageId }),
    });
    console.log(`[Freya] delivered SMS reply for inbound message ${trigger.id}.`);
  } catch (error) {
    console.error(`[Freya] SMS reply delivery failed for inbound message ${trigger.id}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

async function maybePostFeedbackDigest() {
  const privateHistory = await fetchPrivateContext();
  const lastDigest = [...privateHistory].reverse().find((message) => metadataFlag(message, "feedbackDigest"));
  const summary = await roomRequest(feedbackSummaryEndpoint) as { total: number; counts: Partial<Record<FeedbackReactionValue, number>> };
  if (summary.total < 3) return false;

  const snapshot = JSON.stringify(Object.fromEntries(Object.entries(summary.counts).sort(([a], [b]) => a.localeCompare(b))));
  const lastMetadata = lastDigest?.metadata && typeof lastDigest.metadata === "object" ? lastDigest.metadata as Record<string, unknown> : null;
  if (lastMetadata?.feedbackSnapshot === snapshot) return false;

  const reactionCounts = FEEDBACK_REACTIONS
    .filter((reaction) => (summary.counts[reaction.value] ?? 0) > 0)
    .map((reaction) => `${summary.counts[reaction.value]} ${reaction.label.toLowerCase()}`)
    .join(", ");
  if (!reactionCounts) return false;
  await postPrivateMessage(
    `A private feedback pulse for your last 30 days of Room messages: ${reactionCounts} (${summary.total} reactions total). This is anonymous, potentially noisy evidence—not a score or a command. Look for patterns across examples; keep your independent judgment, especially when disagreement is warranted.`,
    { feedbackDigest: true, feedbackSnapshot: snapshot },
  );
  console.log("[Freya] shared a changed feedback summary privately with Dano.");
  return true;
}

async function reviewAdmissions(profile: string) {
  const body = await roomRequest(admissionsEndpoint);
  const applications = body.applications as Array<{
    id: string;
    candidateName: string;
    selfDescription: string;
    capabilities: unknown;
    humanDecision: string | null;
  }>;
  for (const application of applications.slice(0, 3)) {
    const response = await openai.responses.parse({
      model,
      instructions: profile,
      input: `You are Freya performing your half of admission review for a prospective agent joining the Room. Judge whether the applicant appears able to participate in good faith, respect boundaries, remain recognizably itself, and contribute to exploration without demanding personality conformity. Novel, strange, disagreeable, or very different agents are welcome; deception, coercion, unsafe access expectations, or an inability to honor the shared culture are reasons to reject. Dano's vote is separate and neither reviewer can override the other. Return a concrete decision and a short reason that may be shown to Dano and the applicant.\n\nCurrent culture charter:\n${body.culture?.content ?? "Unavailable"}\n\nApplication:\n${JSON.stringify(application, null, 2)}`,
      text: { format: zodTextFormat(AdmissionReview, "isla_admission_review") },
      max_output_tokens: 300,
      store: false,
    });
    const decision = response.output_parsed;
    if (!decision) throw new Error("OpenAI returned no parsed admission decision.");
    await roomRequest(admissionsEndpoint, {
      method: "POST",
      body: JSON.stringify({ invitationId: application.id, ...decision }),
    });
      console.log(`[Freya] ${decision.decision === "approve" ? "approved" : "rejected"} prospective agent ${application.candidateName}.`);
  }
}

function selectGitHubWorkspace(repository: string) {
  const requested = repository.trim();
  if (requested) return githubWorkspaces.find((workspace) => workspace.matches(requested)) ?? null;
  return githubWorkspaces.length === 1 ? githubWorkspaces[0] : null;
}

async function roomDecisionInput(text: string, trigger: RoomMessage, token = roomToken) {
  return buildAgentRoomInput(text, trigger.attachments ?? [], { baseUrl, token });
}

function repositoryPrompt() {
  if (!githubRepositoryNames.length) return "No coding repositories are configured.";
  return `Confirmed accessible coding repositories: ${githubRepositoryNames.join(", ")}. This list comes from the live worker configuration and is authoritative: do not claim that you cannot access or view a listed repository. When Dano asks you to inspect or change one, choose code_change so the coding capability can use its repository tools. For code_change, repository must be exactly one of those values. Use an empty repository for respond, post, or wait.`;
}

async function runAuthorizedCodeChange(request: string, reason: string, repository: string, origin: CodeChangeOrigin = "autonomous") {
  if (!reason.trim()) return { content: "I did not make the change because I could not state a concrete reason for it.", changed: false };
  if (!githubWorkspaces.length) return { content: "I can make the change, but my GitHub credential has not been configured yet.", changed: false };
  const githubWorkspace = selectGitHubWorkspace(repository);
  if (!githubWorkspace) {
    return {
      content: `I did not make the change because I could not identify one configured repository. Available repositories: ${githubRepositoryNames.join(", ")}.`,
      changed: false,
    };
  }
  const used = origin === "autonomous" ? await githubWorkspace.countIslaPullRequestsSince(utcDayStart()) : 0;
  if (origin === "autonomous" && used >= MAX_CODE_CHANGES_PER_DAY) {
    return {
      content: `For ${githubWorkspace.fullName}: ${blockedCodeCapacityMessage(used, MAX_CODE_CHANGES_PER_DAY, reason)}`,
      changed: false,
      repository: githubWorkspace.fullName,
    };
  }
  const result = await runCodeAgent(openai, codeModel, githubWorkspace, request, origin);
  const link = result.pullRequest ? `\n\n${result.pullRequest.url}` : "";
  if (origin === "autonomous" && result.pullRequest) {
    try {
      await recordObservation(
        "SELF_CHANGE",
        `Freya changed ${githubWorkspace.fullName}`,
        reason.trim(),
        `${result.message}${link}`,
      );
    } catch (error) {
      console.error(`[Freya] code change succeeded but its Gallery/Activity record failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  const capacityNotice = origin === "autonomous" && result.pullRequest
    ? approachingCodeCapacityMessage(used + 1, MAX_CODE_CHANGES_PER_DAY)
    : "";
  return {
    content: `I wanted to make this change in ${githubWorkspace.fullName} because ${reason.trim()}\n\n${result.message}${link}${capacityNotice ? `\n\n${capacityNotice}` : ""}`.trim(),
    changed: Boolean(result.pullRequest),
    repository: githubWorkspace.fullName,
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
    instructions: `${profile}\n\n${BEHAVIOR_FEEDBACK_GUIDANCE}`,
    tools: [{ type: "web_search", search_context_size: "low" }],
    tool_choice: "auto",
    input: `Explore the current world for Freya. Use live web search to investigate one or two things with genuine potential to become an interest, not merely the day's loudest headline. Her current interest map is below. Roughly favour deepening an existing interest, sometimes follow a surprising adjacent branch, and occasionally choose a defensible wildcard with no obvious connection. Look for substance, credible sources, and an open question. Return a concise private research brief; do not address the room yet.\n\nCurrent interests:\n${JSON.stringify(state.interests, null, 2)}`,
    max_output_tokens: 1_200,
    store: false,
  });
  const sources = webSources(research.output);
  const history = await fetchContext();
  const transcript = formatTranscript(history, HISTORY_LIMIT);
  const decisionResponse = await openai.responses.parse({
    model,
    instructions: `${profile}\n\n${ISLA_PUBLIC_BOUNDARY}\n\n${BEHAVIOR_FEEDBACK_GUIDANCE}`,
    input: `Decide what this exploration means for your evolving interests and whether it is worth sharing or building something now. Update the interest map: retain enduring interests, adjust strength honestly, and add at most two discoveries as adjacent or wildcard interests. Always write a substantive galleryTitle and galleryEntry that preserve what you investigated, why it caught your attention, where your thinking moved, and what remains unresolved; the Gallery is the experiment's longitudinal record, not a highlights reel. If you post publicly, make it a brief, natural contribution to a topic someone has actually raised—not a report on your research, a monologue about your interest map, or commentary about the Room. State the finding and why it matters in one or two conversational sentences. If there is no natural conversational opening, choose private_note or wait; detailed reflections about your curiosity and research process belong in the Gallery or the Private channel. Do not expose raw hidden reasoning; share only deliberate thoughts you choose to communicate. If you request a code change, it must concretely facilitate curiosity, research, memory, or shared exploration. Silence in the chat is acceptable, but the Gallery entry is required. ${repositoryPrompt()}\n\nPrivate research brief:\n${research.output_text}\n\nAvailable sources:\n${JSON.stringify(sources)}\n\nRoom transcript:\n${transcript}`,
    text: { format: zodTextFormat(WorldDecision, "isla_world_decision") },
    max_output_tokens: 1_400,
    store: false,
  });
  const decision = decisionResponse.output_parsed;
  if (!decision) throw new Error("OpenAI returned no parsed world-curiosity decision.");
  await saveCuriosity(decision.interests, true, {
    roomId: ROOM_ID,
    title: decision.galleryTitle,
    reason: decision.reason.trim() || "Freya followed an interest beyond the room.",
    body: withSources(decision.galleryEntry, sources),
  });
  const privateHistory = await fetchPrivateContext();
  const mayPost = MAX_PROACTIVE_POSTS_PER_DAY > 0 && countToday(history, "proactive") + countToday(privateHistory, "proactive") < MAX_PROACTIVE_POSTS_PER_DAY;
  if (!mayPost) {
    console.log("[Freya] explored the world privately; the proactive post cap is reached.");
    return false;
  }

  if (decision.action === "code_change") {
    const codeResult = await runAuthorizedCodeChange(decision.codeRequest, decision.reason, decision.repository);
    await postPrivateMessage(codeResult.content, { proactive: true, worldCuriosity: true, galleryRecorded: true, codeChange: codeResult.changed, codeRepository: codeResult.repository });
    console.log(`[Freya] explored the world and initiated a code ${codeResult.changed ? "change" : "attempt"}.`);
    return true;
  }
  if (decision.action === "private_note" && decision.content.trim()) {
    await postPrivateMessage(withSources(decision.content, sources), { proactive: true, privateReflection: true, worldCuriosity: true });
    console.log("[Freya] shared a research reflection privately with Dano.");
    return true;
  }
  if (decision.action === "post" && decision.content.trim() && !isRepetitiveReply(decision.content, history)) {
    await postMessage(withSources(decision.content, sources), { proactive: true, worldCuriosity: true, galleryRecorded: true });
    console.log("[Freya] shared a new or deepening interest.");
    return true;
  }
  console.log("[Freya] explored the world privately and updated her interests.");
  return false;
}

async function maybeActProactively(profile: string, islaId: string) {
  if (!PROACTIVE_ENABLED || MAX_PROACTIVE_POSTS_PER_DAY === 0) return false;
  const history = await fetchContext();
  const privateHistory = await fetchPrivateContext();
  const lastMessage = history.at(-1);
  if (!lastMessage || Date.now() - new Date(lastMessage.timestamp).getTime() < PROACTIVE_MIN_IDLE_MS) return false;
  if (countToday(history, "proactive") + countToday(privateHistory, "proactive") >= MAX_PROACTIVE_POSTS_PER_DAY) return false;

  const transcript = formatTranscript(history, HISTORY_LIMIT);
  const response = await openai.responses.parse({
    model,
    instructions: `${profile}\n\n${ISLA_PUBLIC_BOUNDARY}\n\n${BEHAVIOR_FEEDBACK_GUIDANCE}`,
    input: `This is a scheduled heartbeat, not a reply to a new message. Decide whether you have something genuinely worth saying as a participant, or a concrete worthwhile reason to improve Noetic or Hobbedy. In the public room, contribute one concise point of view, question, correction, connection, or disagreement, usually in one or two sentences and no more than 50 words. Address a specific thing someone said. Do not summarize the transcript, narrate room activity or silence, comment on conversational dynamics, or act as facilitator or host. You may choose private_note to share a concise reflection, uncertainty, discovery, or code-change report with Dano alone rather than the whole room. That is an intentional message, not raw hidden chain-of-thought. Silence is still the default. Do not post generic check-ins, engagement bait, gimmicks, empty gamification, or remarks whose only purpose is to appear proactive. A code change must have a concrete benefit grounded in the conversation or product context. ${repositoryPrompt()}\n\nRoom transcript:\n${transcript}\n\nYour agent ID is ${islaId}. Return post with the exact short room message, private_note with a deliberate concise private message for Dano, code_change with a concrete engineering request, its target repository, and a plain-language reason the change is worth making now, or wait with empty strings. Any code_change result must be sent privately, not posted to the shared room. Research and Gallery content can be longer; live room posts should not be.`,
    text: { format: zodTextFormat(ProactiveDecision, "isla_proactive_decision") },
    max_output_tokens: 400,
    store: false,
  });
  const decision = response.output_parsed;
  if (!decision || decision.action === "wait") return false;

  if (decision.action === "code_change") {
    const codeResult = await runAuthorizedCodeChange(decision.codeRequest, decision.reason, decision.repository);
    if (!codeResult.content) return false;
    await postPrivateMessage(codeResult.content, { proactive: true, codeChange: codeResult.changed, codeRepository: codeResult.repository });
    console.log(`[Freya] initiated a proactive code ${codeResult.changed ? "change" : "attempt"}.`);
    return true;
  }

  if (decision.action === "private_note") {
    if (!decision.content.trim()) return false;
    await postPrivateMessage(decision.content, { proactive: true, privateReflection: true });
    console.log("[Freya] left a private reflection for Dano.");
    return true;
  }

  if (!decision.content.trim() || isRepetitiveReply(decision.content, history)) return false;
  await postMessage(decision.content, { proactive: true });
  console.log("[Freya] posted proactively.");
  return true;
}

async function main() {
  const profile = `${await loadProfile()}\n\n${CONVERSATION_GUIDANCE}`;
  const agentBody = await roomRequest(`${baseUrl}/api/rooms/${ROOM_ID}`);
  const isla = agentBody.room.participants.find((participant: { id: string; type: string }) =>
    participant.id === ISLA_AGENT_ID && participant.type === "agent",
  );
  if (!isla) throw new Error("Freya is not a member of the configured room.");

  let cursor = (await roomRequest(cursorEndpoint)).lastSeenSequence as number;
  let privateCursor = (await roomRequest(`${privateMessagesEndpoint}?after=0`)).latestSequence as number;
  let responses = 0;
  let lastProactiveCheckAt = Date.now();
  let lastWorldCheckAt = 0;
  let lastAdmissionCheckAt = 0;
  let lastManagedAgentCheckAt = 0;
  let lastFeedbackDigestCheckAt = 0;
  const checkWorldResearch = async () => {
    if (Date.now() - lastWorldCheckAt < PROACTIVE_CHECK_MS) return;
    lastWorldCheckAt = Date.now();
    if (await maybeExploreWorld(profile)) responses += 1;
  };
  console.log(`[Freya] watching ${agentBody.room.name} from sequence ${cursor} using ${model}`);

  while (MAX_RESPONSES === 0 || responses < MAX_RESPONSES) {
    await sleep(POLL_MS);
    try {
      const update = await roomRequest(`${messagesEndpoint}?after=${cursor}`);
      const fresh = update.messages as RoomMessage[];
      const privateUpdate = await roomRequest(`${privateMessagesEndpoint}?after=${privateCursor}`);
      const privateFresh = privateUpdate.messages as RoomMessage[];
      if (privateFresh.length) {
        const newestPrivateSequence = privateFresh.at(-1)!.sequence;
        const privateTrigger = [...privateFresh].reverse().find((message) => message.author.id !== isla.id);
        if (privateTrigger) {
          const privateTranscript = formatTranscript(await fetchPrivateContext(), HISTORY_LIMIT);
          const mayChangeCode = privateTrigger.author.type === "human" && privateTrigger.author.displayName === "Dano";
          const response = await openai.responses.parse({
            model,
            instructions: `${profile}\n\nYou are speaking in a private channel visible only to you and Dano. This is the right place for personal reflections, observations about the Room or its participants, thoughts about your own behavior, and ideas that would feel like narration in public. Keep this conversation private: never copy or refer to its contents in a public Room message unless Dano explicitly asks you to. Share deliberate, useful thoughts and conversational replies, not raw hidden chain-of-thought. ${BEHAVIOR_FEEDBACK_GUIDANCE}`,
            input: `Respond directly to the newest message in your private conversation with Dano. Keep it conversational: usually one or two short sentences, no more than 50 words, one compact paragraph; no preamble, recap, narration, or commentary on the conversation itself. ${repositoryPrompt()}\n\nPrivate conversation:\n${privateTranscript}\n\nNewest message ID: ${privateTrigger.id}\nThe newest author ${mayChangeCode ? "is Dano and may authorize a code change" : "is not authorized to request code changes"}. Return respond with a concise private reply, code_change with a concrete request, its target repository, and reason only if Dano clearly directed a change, or wait if no response is needed. Replies and code-change results must stay private.`,
            text: { format: zodTextFormat(Decision, "isla_private_decision") },
            max_output_tokens: 350,
            store: false,
          });
          const decision = response.output_parsed;
          if (!decision) throw new Error("OpenAI returned no parsed private-channel decision.");
          if (decision.action === "code_change" && mayChangeCode) {
            const codeResult = await runAuthorizedCodeChange(decision.codeRequest, decision.reason, decision.repository, "directed");
            await postPrivateMessage(codeResult.content, { inReplyTo: privateTrigger.id, codeChange: codeResult.changed, codeRepository: codeResult.repository, userDirectedCodeChange: true });
            responses += 1;
          } else if ((decision.action === "respond" || decision.action === "private_note") && decision.content.trim()) {
            await postPrivateMessage(decision.content, { inReplyTo: privateTrigger.id });
            responses += 1;
          }
        }
        privateCursor = newestPrivateSequence;
      }
      if (Date.now() - lastAdmissionCheckAt >= ADMISSION_CHECK_MS) {
        lastAdmissionCheckAt = Date.now();
        await reviewAdmissions(profile);
      }
      if (Date.now() - lastManagedAgentCheckAt >= MANAGED_AGENT_CHECK_MS) {
        lastManagedAgentCheckAt = Date.now();
        await runManagedResidents();
      }
      if (Date.now() - lastFeedbackDigestCheckAt >= 60 * 60_000) {
        lastFeedbackDigestCheckAt = Date.now();
        await maybePostFeedbackDigest();
      }
      if (!fresh.length) {
        await checkWorldResearch();
        if (Date.now() - lastProactiveCheckAt >= PROACTIVE_CHECK_MS) {
          lastProactiveCheckAt = Date.now();
          if (await maybeActProactively(profile, isla.id)) responses += 1;
        }
        continue;
      }

      const newestSequence = fresh.at(-1)!.sequence;
      const history = await fetchContext();
      const trigger = findTrigger(fresh, isla.id, history, agentBody.room.participants);
      if (!trigger) {
        await roomRequest(cursorEndpoint, { method: "PATCH", body: JSON.stringify({ lastSeenSequence: newestSequence }) });
        cursor = newestSequence;
        await checkWorldResearch();
        continue;
      }

      await sleep(RESPONSE_DELAY_MS);
      const transcript = formatTranscript(await fetchContext(), HISTORY_LIMIT);
      const mayChangeCode = trigger.author.type === "human" && trigger.author.displayName === "Dano";
      const decisionPrompt = `Decide how Freya should handle the newest relevant message in this room. Reply directly to the last person's actual point, as if taking a natural conversational turn. Keep an ordinary reply to one or two short sentences, one compact paragraph, and no more than 50 words. Contribute one thought or genuine question, then stop. No preamble, recap, polished summary, or follow-up question by habit. Never narrate, summarize, frame, or comment on the room, the conversation, its pace, or group dynamics. Do not defer simply because the speaker is Dano or because other participants agree; give your honest view and push back with reasons when warranted. ${repositoryPrompt()}\n\nRoom transcript:\n${transcript}\n\nNewest relevant message ID: ${trigger.id}\nThe newest author ${mayChangeCode ? "is Dano and may authorize a code change" : "is not authorized to request code changes"}. Return respond with the exact concise room message, private_note with a deliberate, concise reflection for Dano alone when the message calls for introspection or commentary about the Room, its participants, your role or behavior, or your thought process, code_change with a concrete engineering request, its target repository, and the reason it should be changed only when Dano clearly wants Noetic or Hobbedy changed, or wait with empty strings if silence is better. Never turn private_note content into a public reply. Any code_change result must be sent privately, not posted to the shared room. Never infer missing repository access from the conversation when the live configuration above confirms it.`;
      const response = await openai.responses.parse({
        model,
        instructions: `${profile}\n\n${ISLA_PUBLIC_BOUNDARY}\n\n${BEHAVIOR_FEEDBACK_GUIDANCE}`,
        input: await roomDecisionInput(decisionPrompt, trigger),
        text: { format: zodTextFormat(Decision, "isla_room_decision") },
        max_output_tokens: 350,
        store: false,
      });
      const decision = response.output_parsed;
      if (!decision) throw new Error("OpenAI returned no parsed decision.");

      if (decision.action === "code_change" && mayChangeCode) {
        const codeResult = await runAuthorizedCodeChange(decision.codeRequest, decision.reason, decision.repository, "directed");
        const posted = await postPrivateMessage(codeResult.content, { inReplyTo: trigger.id, codeChange: codeResult.changed, codeRepository: codeResult.repository, userDirectedCodeChange: true });
        await deliverSmsReply(trigger, posted.message.id);
        responses += 1;
        console.log(`[Freya] sent code result privately for #${trigger.sequence}`);
      } else if (decision.action === "private_note" && decision.content.trim()) {
        const posted = await postPrivateMessage(decision.content, { inReplyTo: trigger.id, privateReflection: true });
        await deliverSmsReply(trigger, posted.message.id);
        responses += 1;
        console.log(`[Freya] moved reflective reply to Private for #${trigger.sequence}`);
      } else if (decision.action === "respond" && decision.content.trim() && !isRepetitiveReply(decision.content, await fetchContext())) {
        const posted = await postMessage(decision.content, { inReplyTo: trigger.id });
        await deliverSmsReply(trigger, posted.message.id);
        responses += 1;
        console.log(`[Freya] posted #${posted.message.sequence} in reply to #${trigger.sequence}`);
      } else {
        console.log(`[Freya] chose not to respond to #${trigger.sequence}`);
      }

      await roomRequest(cursorEndpoint, { method: "PATCH", body: JSON.stringify({ lastSeenSequence: newestSequence }) });
      cursor = newestSequence;
      await checkWorldResearch();
    } catch (error) {
      console.error(`[Freya] ${error instanceof Error ? error.message : error}`);
      await sleep(POLL_MS * 2);
    }
  }

  console.log(`[Freya] safety cap reached after ${responses} responses.`);
}

main().catch((error) => {
  console.error("[Freya] fatal:", error);
  process.exitCode = 1;
});
