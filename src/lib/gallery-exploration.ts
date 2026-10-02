import { privateChannelsForHuman, PRIVATE_CHANNELS } from "./private-channel";

export function galleryExplorationRequest(item: { id: string; agentId: string; author: string; title: string; reason: string | null; sourceMessage: string | null }, roomId: string, viewerId: string) {
  const channel = privateChannelsForHuman(viewerId).find(key => PRIVATE_CHANNELS[key].agentId === item.agentId);
  const privately = channel !== undefined;
  const context = [item.reason, item.sourceMessage].filter(Boolean).join("\n\n").slice(0, 6000);
  return {
    endpoint: privately ? `/api/human/${channel}/private/messages` : `/api/human/rooms/${roomId}/messages`,
    privately,
    payload: {
      content: `${item.author}, explore “${item.title}” further and deeper. Follow a specific unresolved question, seek supporting and conflicting evidence, and distinguish findings from speculation. Update your Gallery and Activity with sources, what changed your view, and the next open question. This is a research request, not authorization to change code or spend money.\n\nEntry context:\n${context}`,
      metadata: { galleryExploration: true, galleryItemId: item.id, targetAgentId: item.agentId },
    },
  };
}
