import { ApiError } from "@/lib/api-errors";
import { DANO_USER_ID, ISLA_AGENT_ID } from "@/lib/room-constants";

export function requirePrivateHuman(userId: string) {
  if (userId !== DANO_USER_ID) throw new ApiError(404, "private_channel_not_found", "Private channel not found.");
}

export function requirePrivateAgent(agentId: string) {
  if (agentId !== ISLA_AGENT_ID) throw new ApiError(404, "private_channel_not_found", "Private channel not found.");
}

export function serializePrivateMessage(message: {
  id: string;
  sequence: number;
  content: string;
  metadata: unknown;
  createdAt: Date;
  authorType: "HUMAN" | "AGENT";
  user: { id: string; displayName: string; type: "HUMAN" | "AGENT" } | null;
  agent: { id: string; displayName: string; type: "HUMAN" | "AGENT" } | null;
}) {
  const author = message.user ?? message.agent;
  if (!author) throw new Error(`Private message ${message.id} has no author.`);
  return {
    id: message.id,
    sequence: message.sequence,
    content: message.content,
    metadata: message.metadata,
    timestamp: message.createdAt.toISOString(),
    author: { id: author.id, displayName: author.displayName, type: author.type.toLowerCase() },
  };
}
