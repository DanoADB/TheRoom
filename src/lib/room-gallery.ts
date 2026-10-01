export type RoomGalleryPriority =
  | "gallery-worthy"
  | "needs-implementation"
  | "interesting-but-not-yet-worth-changing";

export type RoomGalleryBucket = {
  priority: RoomGalleryPriority;
  label: string;
  description: string;
  items: RoomGalleryViewItem[];
};

export type RoomGalleryViewItem = {
  id: string;
  kind: string;
  title: string;
  reason: string | null;
  sourceMessage: string | null;
  timestamp: string;
  agentId: string;
  author: string;
  priority: RoomGalleryPriority;
};

type RoomCuriosityRecord = {
  id: string;
  kind: string;
  title: string;
  reason: string | null;
  sourceMessage: string | null;
  priority: "GALLERY_WORTHY" | "NEEDS_IMPLEMENTATION" | "INTERESTING_BUT_NOT_YET_WORTH_CHANGING";
  createdAt: Date;
  agent: { id: string; displayName: string };
};

type AgentGalleryRecord = {
  id: string;
  kind: string;
  title: string;
  provenance: string;
  imageUrl: string | null;
  priority: "GALLERY_WORTHY" | "NEEDS_IMPLEMENTATION" | "INTERESTING_BUT_NOT_YET_WORTH_CHANGING";
  createdAt: Date;
  agentId: string;
  author: string;
};

const priorityLabels: Record<RoomGalleryPriority, { label: string; description: string }> = {
  "gallery-worthy": {
    label: "Gallery-worthy",
    description: "Keep visible, legible, and easy to browse first.",
  },
  "needs-implementation": {
    label: "Needs implementation",
    description: "Promising ideas that should become concrete work.",
  },
  "interesting-but-not-yet-worth-changing": {
    label: "Interesting, but not yet worth changing",
    description: "Worth remembering without reshaping the room yet.",
  },
};

const priorityOrder: RoomGalleryPriority[] = [
  "gallery-worthy",
  "needs-implementation",
  "interesting-but-not-yet-worth-changing",
];

function toPriority(value: RoomCuriosityRecord["priority"] | AgentGalleryRecord["priority"]): RoomGalleryPriority {
  switch (value) {
    case "GALLERY_WORTHY": return "gallery-worthy";
    case "NEEDS_IMPLEMENTATION": return "needs-implementation";
    case "INTERESTING_BUT_NOT_YET_WORTH_CHANGING": return "interesting-but-not-yet-worth-changing";
  }
}

type CurrentInterestRecord = {
  agentId: string;
  author: string;
  updatedAt: Date;
  interests: Array<{
    topic: string;
    why: string;
    nextQuestion: string;
    origin: string;
    strength: number;
  }>;
};
export function buildRoomGallery(
  roomCuriosities: RoomCuriosityRecord[],
  agentGalleryItems: AgentGalleryRecord[],
  currentInterests: CurrentInterestRecord[] = [],
) {
  const items = [
    ...roomCuriosities.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      reason: item.reason,
      sourceMessage: item.sourceMessage,
      timestamp: item.createdAt.toISOString(),
      agentId: item.agent.id,
      author: item.agent.displayName,
      priority: toPriority(item.priority),
    })),
    ...agentGalleryItems.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      reason: item.provenance,
      sourceMessage: item.imageUrl,
      timestamp: item.createdAt.toISOString(),
      agentId: item.agentId,
      author: item.author,
      priority: toPriority(item.priority),
    })),
    ...currentInterests.flatMap((record) => record.interests.map((interest) => ({
      id: `current-interest:${record.agentId}:${interest.topic}`,
      kind: "CURRENT INTEREST",
      title: interest.topic,
      reason: interest.why,
      sourceMessage: `Open question: ${interest.nextQuestion}\n\nOrigin: ${interest.origin} · Strength: ${interest.strength}/5`,
      timestamp: record.updatedAt.toISOString(),
      agentId: record.agentId,
      author: record.author,
      priority: "gallery-worthy" as const,
    }))),
  ].sort((left, right) => {
    const priorityDelta = priorityOrder.indexOf(left.priority) - priorityOrder.indexOf(right.priority);
    if (priorityDelta !== 0) return priorityDelta;
    return right.timestamp.localeCompare(left.timestamp);
  }) satisfies RoomGalleryViewItem[];

  return priorityOrder.map((priority) => ({
    ...priorityLabels[priority],
    priority,
    items: items.filter((item) => item.priority === priority),
  })) satisfies RoomGalleryBucket[];
}
