export type TransportMessage = {
  sequence: number;
  author: { displayName: string; type: string };
  content: string;
  metadata: unknown;
};

export function belongsToRun(message: TransportMessage, runId: string) {
  return Boolean(
    message.metadata &&
      typeof message.metadata === "object" &&
      "testRunId" in message.metadata &&
      message.metadata.testRunId === runId,
  );
}

export function shouldRespond(message: TransportMessage, peerName: string, runId: string) {
  return (
    belongsToRun(message, runId) &&
    message.author.type === "agent" &&
    message.author.displayName === peerName
  );
}

export function buildDeterministicResponse(agentName: string, ownTurn: number, message: TransportMessage) {
  return `${agentName} transport turn ${ownTurn}: acknowledged ${message.author.displayName} at sequence ${message.sequence}.`;
}
