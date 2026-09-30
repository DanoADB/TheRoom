import { redirect } from "next/navigation";
import { getCurrentHuman } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { MVP_ROOM_ID } from "@/lib/room-constants";
import { serializeMessage } from "@/lib/room-api";
import { RoomView } from "./room-view";

export default async function RoomPage({ searchParams }: PageProps<"/room">) {
  const user = await getCurrentHuman();
  if (!user) redirect("/login");
  const query = await searchParams;
  const initialMobileView = query.view === "gallery" ? "gallery" : "room";

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
      initialMessages={room.messages.reverse().map(serializeMessage)}
      initialSequence={room.nextSequence}
      initialMobileView={initialMobileView}
    />
  );
}
