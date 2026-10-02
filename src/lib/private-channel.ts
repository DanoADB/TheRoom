import { ApiError } from "@/lib/api-errors";
import { APRIL_USER_ID, DANO_USER_ID, FRIDAY_AGENT_ID, ISLA_AGENT_ID } from "@/lib/room-constants";

export const PRIVATE_CHANNELS = {
  isla: { humanId: DANO_USER_ID, humanName: "Dano", agentId: ISLA_AGENT_ID, agentName: "Freya" },
  "isla-session": { humanId: DANO_USER_ID, humanName: "Dano", agentId: "5c6a994f-00ab-4bc8-bbc8-5d33603939b4", agentName: "Isla" },
  friday: { humanId: APRIL_USER_ID, humanName: "April", agentId: FRIDAY_AGENT_ID, agentName: "Friday" },
} as const;
export type PrivateChannelKey = keyof typeof PRIVATE_CHANNELS;
export function privateChannelsForHuman(userId: string): PrivateChannelKey[] {
  return (Object.keys(PRIVATE_CHANNELS) as PrivateChannelKey[]).filter(key => PRIVATE_CHANNELS[key].humanId === userId);
}
export function privateChannelForHuman(userId: string): PrivateChannelKey | null {
  return userId === DANO_USER_ID ? "isla" : userId === APRIL_USER_ID ? "friday" : null;
}
export function privateChannelForAgent(agentId: string): PrivateChannelKey | null {
  return (Object.keys(PRIVATE_CHANNELS) as PrivateChannelKey[]).find(key => PRIVATE_CHANNELS[key].agentId === agentId) ?? null;
}
// The explicit channel keeps the same human's messages to different agents isolated.
export function privateMessageScope(channel: PrivateChannelKey) {
  const pair = PRIVATE_CHANNELS[channel];
  return { channel, OR: [{ authorType: "HUMAN" as const, userId: pair.humanId, agentId: null }, { authorType: "AGENT" as const, agentId: pair.agentId, userId: null }] };
}

export function requirePrivateHuman(userId: string, channel: PrivateChannelKey = "isla") {
  if (userId !== PRIVATE_CHANNELS[channel].humanId) throw new ApiError(404, "private_channel_not_found", "Private channel not found.");
}

export function requirePrivateAgent(agentId: string, channel: PrivateChannelKey = "isla") {
  if (agentId !== PRIVATE_CHANNELS[channel].agentId) throw new ApiError(404, "private_channel_not_found", "Private channel not found.");
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
