import { redirect } from "next/navigation";
import { getCurrentHuman } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { MVP_ROOM_ID } from "@/lib/room-constants";
import { serializeMessage } from "@/lib/room-api";
import { RoomView } from "./room-view";

export default async function RoomPage() {
  const user = await getCurrentHuman();
  if (!user) redirect("/login");

  const room = await prisma.room.findFirst({
    where: { id: MVP_ROOM_ID, memberships: { some: { userId: user.id } } },
    include: {
      memberships: {
        orderBy: { joinedAt: "asc" },
        include: {
          user: { select: { id: true, displayName: true, type: true } },
          agent: { select: { id: true, displayName: true, type: true, status: true } },
        },
      },
      messages: {
        orderBy: { sequence: "desc" },
        take: 100,
        include: {
          user: { select: { id: true, displayName: true, type: true } },
          agent: { select: { id: true, displayName: true, type: true } },
        },
      },
      curiosities: {
        orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
        include: {
          agent: { select: { id: true, displayName: true } },
        },
      },
      agents: {
        select: {
          gallery: {
            where: { steerAway: false },
            orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
            take: 12,
          },
        },
      },
    },
  });
  if (!room) redirect("/login");

  const participants = room.memberships.map((membership) => {
    const participant = membership.user ?? membership.agent;
    if (!participant) throw new Error(`Membership ${membership.id} has no participant.`);
    return {
      id: participant.id,
      displayName: participant.displayName,
      type: participant.type.toLowerCase() as "human" | "agent",
      status: membership.agent?.status.toLowerCase() ?? "present",
    };
  });

  const galleryItems = room.memberships
    .flatMap((membership) => membership.agent?.gallery ?? [])
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      provenance: item.provenance,
      imageUrl: item.imageUrl,
      visualMeta: item.visualMeta,
      steerAway: item.steerAway,
      timestamp: item.createdAt.toISOString(),
      author: room.memberships.find((membership) => membership.agent?.id === item.agentId)?.agent?.displayName ?? "Unknown",
    }));

  return (
    <RoomView
      room={{ id: room.id, name: room.name }}
      currentUser={{ id: user.id, displayName: user.displayName }}
      participants={participants}
      curiosities={room.curiosities.map((curiosity) => ({
        id: curiosity.id,
        kind: curiosity.kind,
        title: curiosity.title,
        reason: curiosity.reason,
        sourceMessage: curiosity.sourceMessage,
        timestamp: curiosity.createdAt.toISOString(),
        author: curiosity.agent.displayName,
      }))}
      galleryItems={galleryItems}
      initialMessages={room.messages.reverse().map(serializeMessage)}
      initialSequence={room.nextSequence}
    />
  );
}
