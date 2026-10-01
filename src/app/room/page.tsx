import { redirect } from "next/navigation";
import { getCurrentHuman } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { MVP_ROOM_ID } from "@/lib/room-constants";
import { serializeMessage } from "@/lib/room-api";
import { buildRoomGallery } from "@/lib/room-gallery";
import { AgentInterestList } from "@/lib/agent-curiosity";
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
          agent: {
            select: {
              id: true,
              displayName: true,
              type: true,
              status: true,
              curiosity: { select: { interests: true, updatedAt: true } },
              gallery: {
                where: { steerAway: false },
                orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
                select: {
                  id: true,
                  kind: true,
                  title: true,
                  provenance: true,
                  imageUrl: true,
                  priority: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      },
      messages: {
        orderBy: { sequence: "desc" },
        take: 100,
        include: {
          user: { select: { id: true, displayName: true, type: true } },
          agent: { select: { id: true, displayName: true, type: true } },
          feedback: { select: { userId: true, value: true } },
          attachments: { select: { id: true, fileName: true, mimeType: true, byteSize: true, sortOrder: true } },
        },
      },
      curiosities: {
        orderBy: [{ priority: "asc" }, { kind: "asc" }, { createdAt: "desc" }],
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

  const galleryItems = room.memberships.flatMap((membership) =>
    membership.agent?.gallery.map((item) => ({
      ...item,
      agentId: membership.agent!.id,
      author: membership.agent!.displayName,
    })) ?? [],
  );
  const currentInterests = room.memberships.flatMap((membership) => {
    if (!membership.agent?.curiosity) return [];
    const parsed = AgentInterestList.safeParse(membership.agent.curiosity.interests);
    if (!parsed.success) return [];
    return [{
      agentId: membership.agent.id,
      author: membership.agent.displayName,
      updatedAt: membership.agent.curiosity.updatedAt,
      interests: parsed.data,
    }];
  });
  const curiosities = buildRoomGallery(room.curiosities, galleryItems, currentInterests);

  return (
    <RoomView
      room={{ id: room.id, name: room.name }}
      currentUser={{ id: user.id, displayName: user.displayName }}
      participants={participants}
      curiosities={curiosities}
      initialMessages={room.messages.reverse().map((message) => serializeMessage(message, user.id))}
      initialSequence={room.nextSequence}
      initialMobileView={initialMobileView}
    />
  );
}
