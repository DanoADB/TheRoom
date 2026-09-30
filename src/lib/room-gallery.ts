export type RoomGalleryViewItem = {
  id: string;
  kind: string;
  title: string;
  reason: string | null;
  sourceMessage: string | null;
  timestamp: string;
  author: string;
};

type RoomCuriosityRecord = {
  id: string;
  kind: string;
  title: string;
  reason: string | null;
  sourceMessage: string | null;
  createdAt: Date;
  agent: { displayName: string };
};

type AgentGalleryRecord = {
  id: string;
  kind: string;
  title: string;
  provenance: string;
  imageUrl: string | null;
  createdAt: Date;
  author: string;
};

export function buildRoomGallery(
  roomCuriosities: RoomCuriosityRecord[],
  agentGalleryItems: AgentGalleryRecord[],
) {
  return [
    ...roomCuriosities.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      reason: item.reason,
      sourceMessage: item.sourceMessage,
      timestamp: item.createdAt.toISOString(),
      author: item.agent.displayName,
    })),
    ...agentGalleryItems.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      reason: item.provenance,
      sourceMessage: item.imageUrl,
      timestamp: item.createdAt.toISOString(),
      author: item.author,
    })),
  ].sort((left, right) => right.timestamp.localeCompare(left.timestamp)) satisfies RoomGalleryViewItem[];
}
