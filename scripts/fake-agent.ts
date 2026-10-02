import {
  belongsToRun,
  buildDeterministicResponse,
  shouldRespond,
  type TransportMessage,
} from "../src/lib/fake-agent-protocol";

type AgentKey = "isla" | "friday";

const ROOM_ID = process.env.ROOM_ID ?? "700a0000-0000-4000-8000-000000000001";
const MAX_OWN_MESSAGES = Number(process.env.FAKE_AGENT_MAX_OWN_MESSAGES ?? 5);
const POLL_INTERVAL_MS = Number(process.env.FAKE_AGENT_POLL_MS ?? 1_000);
const RESPONSE_DELAY_MS = Number(process.env.FAKE_AGENT_DELAY_MS ?? 1_200);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseAgentKey(): AgentKey {
  const value = process.argv.find((argument) => argument.startsWith("--agent="))?.split("=")[1];
  if (value !== "isla" && value !== "friday") throw new Error("Use --agent=isla or --agent=friday.");
  return value;
}

const agentKey = parseAgentKey();
const config = agentKey === "isla"
  ? { name: "Freya", peerName: "Friday", token: required("ISLA_API_TOKEN"), initiates: true }
  : { name: "Friday", peerName: "Freya", token: required("FRIDAY_API_TOKEN"), initiates: false };
const baseUrl = required("ROOM_BASE_URL").replace(/\/$/, "");
const runId = required("FAKE_AGENT_RUN_ID");
const endpoint = `${baseUrl}/api/rooms/${ROOM_ID}/messages`;

if (!Number.isInteger(MAX_OWN_MESSAGES) || MAX_OWN_MESSAGES < 1) throw new Error("FAKE_AGENT_MAX_OWN_MESSAGES must be a positive integer.");
if (!Number.isFinite(POLL_INTERVAL_MS) || POLL_INTERVAL_MS < 250) throw new Error("FAKE_AGENT_POLL_MS must be at least 250.");
if (!Number.isFinite(RESPONSE_DELAY_MS) || RESPONSE_DELAY_MS < 0) throw new Error("FAKE_AGENT_DELAY_MS cannot be negative.");

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${body.error?.code ?? "request_failed"}: ${body.error?.message ?? "Unknown API error"}`);
  }
  return body;
}

async function post(content: string, turn: number) {
  const body = await request(endpoint, {
    method: "POST",
    body: JSON.stringify({
      content,
      metadata: { testRunId: runId, testAgent: config.name, testTurn: turn },
    }),
  });
  console.log(`[${config.name}] posted #${body.message.sequence}: ${content}`);
  return body.message as TransportMessage;
}

async function main() {
  console.log(`[${config.name}] joining run ${runId} at ${baseUrl}`);
  const initial = await request(`${endpoint}?after=0`);
  const runMessages = (initial.messages as TransportMessage[]).filter((message) => belongsToRun(message, runId));
  let ownMessages = runMessages.filter((message) => message.author.displayName === config.name).length;
  let cursor = initial.latestSequence as number;
  const lastRunMessage = runMessages.at(-1);

  if (ownMessages >= MAX_OWN_MESSAGES) {
    console.log(`[${config.name}] already completed ${ownMessages} turns for this run.`);
    return;
  }

  if (lastRunMessage && shouldRespond(lastRunMessage, config.peerName, runId)) {
    await sleep(RESPONSE_DELAY_MS);
    ownMessages += 1;
    const sent = await post(buildDeterministicResponse(config.name, ownMessages, lastRunMessage), ownMessages);
    cursor = sent.sequence;
  } else if (!lastRunMessage && config.initiates) {
    await sleep(RESPONSE_DELAY_MS * 2);
    ownMessages += 1;
    const sent = await post(`${config.name} transport turn 1: opening test run ${runId}.`, ownMessages);
    cursor = sent.sequence;
  }

  while (ownMessages < MAX_OWN_MESSAGES) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const body = await request(`${endpoint}?after=${cursor}`);
      const messages = body.messages as TransportMessage[];
      if (messages.length) cursor = messages.at(-1)!.sequence;
      const peerMessage = [...messages].reverse().find((message) => shouldRespond(message, config.peerName, runId));
      if (!peerMessage) continue;

      await sleep(RESPONSE_DELAY_MS);
      ownMessages += 1;
      const sent = await post(buildDeterministicResponse(config.name, ownMessages, peerMessage), ownMessages);
      cursor = sent.sequence;
    } catch (error) {
      console.error(`[${config.name}] ${error instanceof Error ? error.message : error}`);
      await sleep(POLL_INTERVAL_MS * 2);
    }
  }

  console.log(`[${config.name}] complete after ${ownMessages} posted messages.`);
}

main().catch((error) => {
  console.error(`[${config.name}] fatal:`, error);
  process.exitCode = 1;
});
