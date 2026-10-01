import { redirect } from "next/navigation";
import { getCurrentHuman } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { DANO_USER_ID } from "@/lib/room-constants";
import { PrivateIslaView } from "./private-isla-view";

export default async function PrivateIslaPage() {
  const user = await getCurrentHuman();
  if (!user || user.id !== DANO_USER_ID) redirect("/room");
  const messages = await prisma.privateMessage.findMany({
    orderBy: { sequence: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, displayName: true, type: true } },
      agent: { select: { id: true, displayName: true, type: true } },
    },
  });
  return <PrivateIslaView viewerId={user.id} initialMessages={messages.reverse().map((message) => {
    const author = message.user ?? message.agent;
    if (!author) throw new Error(`Private message ${message.id} has no author.`);
    return { id: message.id, sequence: message.sequence, timestamp: message.createdAt.toISOString(), content: message.content, author: { id: author.id, displayName: author.displayName, type: author.type.toLowerCase() } };
  })} />;
}
