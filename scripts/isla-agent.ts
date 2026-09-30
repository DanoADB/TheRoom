import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { findTrigger, formatTranscript, type RoomMessage } from "../src/lib/isla-agent-protocol";

const Decision = z.object({
  action: z.enum(["respond", "wait"]),
  content: z.string(),
});

const ROOM_ID = process.env.ROOM_ID ?? "700a0000-0000-4000-8000-000000000001";
const POLL_MS = numberSetting("ISLA_POLL_MS", 3_000, 500);
const RESPONSE_DELAY_MS = numberSetting("ISLA_RESPONSE_DELAY_MS", 1_500, 0);
const HISTORY_LIMIT = numberSetting("ISLA_HISTORY_LIMIT", 40, 4);
const MAX_RESPONSES = numberSetting("ISLA_MAX_RESPONSES_PER_RUN", 20, 0);

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const baseUrl = required("ROOM_BASE_URL").replace(/\/$/, "");
const roomToken = required("ISLA_API_TOKEN");
const model = required("OPENAI_MODEL");
const openai = new OpenAI({ apiKey: required("OPENAI_API_KEY") });
const messagesEndpoint = `${baseUrl}/api/rooms/${ROOM_ID}/messages`;
const cursorEndpoint = `${baseUrl}/api/rooms/${ROOM_ID}/cursor`;

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
  const additions = process.env.ISLA_PROFILE_ADDITIONS?.trim();
  return additions ? `${baseProfile.trim()}\n\nAdditional private profile:\n${additions}` : baseProfile.trim();
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

async function main() {
  const profile = await loadProfile();
  const agentBody = await roomRequest(`${baseUrl}/api/rooms/${ROOM_ID}`);
  const isla = agentBody.room.participants.find((participant: { displayName: string; type: string }) =>
    participant.displayName === "Isla" && participant.type === "agent",
  );
  if (!isla) throw new Error("Isla is not a member of the configured room.");

  let cursor = (await roomRequest(cursorEndpoint)).lastSeenSequence as number;
  let responses = 0;
  console.log(`[Isla] watching ${agentBody.room.name} from sequence ${cursor} using ${model}`);

  while (MAX_RESPONSES === 0 || responses < MAX_RESPONSES) {
    await sleep(POLL_MS);
    try {
      const update = await roomRequest(`${messagesEndpoint}?after=${cursor}`);
      const fresh = update.messages as RoomMessage[];
      if (!fresh.length) continue;

      const newestSequence = fresh.at(-1)!.sequence;
      const trigger = findTrigger(fresh, isla.id);
      if (!trigger) {
        await roomRequest(cursorEndpoint, { method: "PATCH", body: JSON.stringify({ lastSeenSequence: newestSequence }) });
        cursor = newestSequence;
        continue;
      }

      await sleep(RESPONSE_DELAY_MS);
      const transcript = formatTranscript(await fetchContext(), HISTORY_LIMIT);
      const response = await openai.responses.parse({
        model,
        instructions: profile,
        input: `Decide whether Isla should respond to the newest relevant message in this room.\n\nRoom transcript:\n${transcript}\n\nNewest relevant message ID: ${trigger.id}\nReturn wait with empty content if silence is the better conversational choice.`,
        text: { format: zodTextFormat(Decision, "isla_room_decision") },
        max_output_tokens: 600,
        store: false,
      });
      const decision = response.output_parsed;
      if (!decision) throw new Error("OpenAI returned no parsed decision.");

      if (decision.action === "respond" && decision.content.trim()) {
        const posted = await roomRequest(messagesEndpoint, {
          method: "POST",
          body: JSON.stringify({
            content: decision.content.trim(),
            metadata: { agentRuntime: "openai", inReplyTo: trigger.id, model },
          }),
        });
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
