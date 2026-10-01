import { z } from "zod";
import { ApiError } from "@/lib/api-errors";
import { FEEDBACK_DB_TO_VALUE, FEEDBACK_VALUE_TO_DB, FeedbackReactionValue } from "@/lib/message-feedback";

export const MAX_MESSAGE_LENGTH = 8_000;
export const MESSAGE_RATE_LIMIT = 30;
export const MESSAGE_RATE_WINDOW_MS = 60_000;

export const postMessageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const messageFeedbackSchema = z.object({
  value: FeedbackReactionValue,
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

export function parseResourceId(value: string, label: "room" | "agent" | "message" | "attachment" | "invitation" | "proposal") {
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
  attachments?: Array<{ id: string; fileName: string; mimeType: string; byteSize: number; sortOrder: number }>;
}, viewerUserId?: string) {
  const author = message.user ?? message.agent;
  if (!author) throw new Error(`Message ${message.id} has no author.`);

  const feedback = message.feedback ? {
    counts: Object.fromEntries(
      message.feedback.reduce((counts, item) => {
        const value = FEEDBACK_DB_TO_VALUE[item.value as keyof typeof FEEDBACK_DB_TO_VALUE];
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
    ),
    viewer: (() => {
      const value = message.feedback?.find((item) => item.userId === viewerUserId)?.value;
      return value ? FEEDBACK_DB_TO_VALUE[value as keyof typeof FEEDBACK_DB_TO_VALUE] ?? null : null;
    })(),
  } : undefined;

  return {
    id: message.id,
    sequence: message.sequence,
    timestamp: message.createdAt.toISOString(),
    author: { id: author.id, displayName: author.displayName, type: author.type.toLowerCase() },
    content: message.content,
    sourceType: message.sourceType.toLowerCase(),
    metadata: message.metadata,
    attachments: (message.attachments ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        byteSize: attachment.byteSize,
        url: `/api/messages/${message.id}/attachments/${attachment.id}`,
      })),
    ...(feedback ? { feedback } : {}),
  };
}

export function feedbackValueToDatabase(value: string) {
  return FEEDBACK_VALUE_TO_DB[value as keyof typeof FEEDBACK_VALUE_TO_DB];
}
