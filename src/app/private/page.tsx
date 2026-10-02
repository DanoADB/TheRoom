import { redirect } from "next/navigation";
import { getCurrentHuman } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { privateChannelForHuman, privateMessageScope, PRIVATE_CHANNELS } from "@/lib/private-channel";
import { MVP_ROOM_ID } from "@/lib/room-constants";
import { PrivateIslaView } from "./private-isla-view";

export default async function PrivateIslaPage() {
  const user = await getCurrentHuman();
  if (!user) redirect("/login");
  const channel = privateChannelForHuman(user.id);
  if (!channel) redirect("/room");
  const membership = await prisma.roomMembership.findUnique({ where: { roomId_userId: { roomId: MVP_ROOM_ID, userId: user.id } } });
  if (!membership) redirect("/room");
  const messages = await prisma.privateMessage.findMany({
    where: privateMessageScope(channel),
    orderBy: { sequence: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, displayName: true, type: true } },
      agent: { select: { id: true, displayName: true, type: true } },
    },
  });
  return <PrivateIslaView key={channel} channel={channel} partnerName={PRIVATE_CHANNELS[channel].agentName} humanName={PRIVATE_CHANNELS[channel].humanName} viewerId={user.id} initialMessages={messages.reverse().map((message) => {
    const author = message.user ?? message.agent;
    if (!author) throw new Error(`Private message ${message.id} has no author.`);
    return { id: message.id, sequence: message.sequence, timestamp: message.createdAt.toISOString(), content: message.content, author: { id: author.id, displayName: author.displayName, type: author.type.toLowerCase() } };
  })} />;
}
