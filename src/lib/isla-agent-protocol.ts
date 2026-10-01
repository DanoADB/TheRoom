import { formatFeedbackCounts, type FeedbackCounts } from "@/lib/message-feedback";

export type RoomMessage = {
  id: string;
  sequence: number;
  timestamp: string;
  author: { id: string; displayName: string; type: string };
  content: string;
  metadata: unknown;
  attachments?: Array<{ id: string; fileName: string; mimeType: string; byteSize: number; url: string }>;
  feedback?: { counts: FeedbackCounts; viewer?: string | null };
};

export function isFakeTransportMessage(message: RoomMessage) {
  return Boolean(message.metadata && typeof message.metadata === "object" && "testRunId" in message.metadata);
}

export function findTrigger(messages: RoomMessage[], ownAgentId: string) {
  return [...messages].reverse().find((message) => message.author.id !== ownAgentId && !isFakeTransportMessage(message));
}

export function formatTranscript(messages: RoomMessage[], limit = 40) {
  return messages.slice(-limit).map((message) =>
    `[${message.sequence}] ${message.author.displayName} (${message.author.type}): ${message.content}${message.attachments?.length ? ` [attached images: ${message.attachments.map((attachment) => attachment.fileName).join(", ")}]` : ""}${message.feedback && Object.keys(message.feedback.counts).length ? ` [human feedback: ${formatFeedbackCounts(message.feedback.counts)}]` : ""}`,
  ).join("\n");
}
