export type RoomMessage = {
  id: string;
  sequence: number;
  timestamp: string;
  author: { id: string; displayName: string; type: string };
  content: string;
  metadata: unknown;
};

export function isFakeTransportMessage(message: RoomMessage) {
  return Boolean(message.metadata && typeof message.metadata === "object" && "testRunId" in message.metadata);
}

export function findTrigger(messages: RoomMessage[], ownAgentId: string) {
  return [...messages].reverse().find((message) => message.author.id !== ownAgentId && !isFakeTransportMessage(message));
}

export function formatTranscript(messages: RoomMessage[], limit = 40) {
  return messages.slice(-limit).map((message) =>
    `[${message.sequence}] ${message.author.displayName} (${message.author.type}): ${message.content}`,
  ).join("\n");
}
