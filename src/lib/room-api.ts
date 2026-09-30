import { z } from "zod";
import { ApiError } from "@/lib/api-errors";

export const MAX_MESSAGE_LENGTH = 8_000;
export const MESSAGE_RATE_LIMIT = 30;
export const MESSAGE_RATE_WINDOW_MS = 60_000;

export const postMessageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const messageFeedbackSchema = z.object({
  value: z.enum(["up", "down"]),
}).strict();

export function parseAfterSequence(value: string | null) {
  if (value === null || value === "") return 0;
  if (!/^\d+$/.test(value)) {
    throw new ApiError(400, "invalid_after", "The after parameter must be a non-negative integer.");
  }
  const sequence = Number(value);
  if (!Number.isSafeInteger(sequence)) {
    throw new ApiError(400, "invalid_after", "The after parameter is too large.");
  }
  return sequence;
}

export function parseResourceId(value: string, label: "room" | "agent") {
  const result = z.uuid().safeParse(value);
  if (!result.success) {
    throw new ApiError(400, `invalid_${label}_id`, `The ${label} ID must be a UUID.`);
  }
  return result.data;
}

export function serializeMessage(message: {
  id: string;
  sequence: number;
  createdAt: Date;
  content: string;
  metadata: unknown;
  sourceType: string;
  authorType: "HUMAN" | "AGENT";
  user: { id: string; displayName: string; type: "HUMAN" | "AGENT" } | null;
  agent: { id: string; displayName: string; type: "HUMAN" | "AGENT" } | null;
  feedback?: Array<{ userId: string; value: string }>;
}, viewerUserId?: string) {
  const author = message.user ?? message.agent;
  if (!author) throw new Error(`Message ${message.id} has no author.`);

  const feedback = message.feedback ? {
    up: message.feedback.filter((item) => item.value === "UP").length,
    down: message.feedback.filter((item) => item.value === "DOWN").length,
    viewer: message.feedback.find((item) => item.userId === viewerUserId)?.value.toLowerCase() as "up" | "down" | undefined ?? null,
  } : undefined;

  return {
    id: message.id,
    sequence: message.sequence,
    timestamp: message.createdAt.toISOString(),
    author: { id: author.id, displayName: author.displayName, type: author.type.toLowerCase() },
    content: message.content,
    sourceType: message.sourceType.toLowerCase(),
    metadata: message.metadata,
    ...(feedback ? { feedback } : {}),
  };
}
