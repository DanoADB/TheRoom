import { z } from "zod";
import { prisma } from "./prisma";

export const activityPrioritySchema = z.object({
  roomId: z.uuid(),
  entryId: z.string().refine(value => {
    const [kind, id, extra] = value.split(":");
    return !extra && ["observation", "message"].includes(kind) && z.uuid().safeParse(id).success;
  }, "Invalid activity entry ID"),
  raised: z.boolean(),
}).strict();

export async function raisedActivity(roomId: string) {
  const priorities = await prisma.activityPriority.findMany({ where: { roomId }, orderBy: { raisedAt: "desc" } });
  const [observations, messages] = await Promise.all([
    prisma.roomCuriosity.findMany({ where: { roomId, id: { in: priorities.filter(p => p.entryId.startsWith("observation:")).map(p => p.entryId.slice(12)) } }, include: { agent: { select: { displayName: true } } } }),
    prisma.message.findMany({ where: { roomId, authorType: "AGENT", id: { in: priorities.filter(p => p.entryId.startsWith("message:")).map(p => p.entryId.slice(8)) } }, include: { agent: { select: { displayName: true } } } }),
  ]);
  return priorities.flatMap(priority => {
    const observation = observations.find(o => priority.entryId === `observation:${o.id}`);
    const message = messages.find(m => priority.entryId === `message:${m.id}`);
    if (!observation && !message) return [];
    return [{ entryId: priority.entryId, raisedBy: priority.raisedBy, raisedAt: priority.raisedAt.toISOString(),
      kind: observation?.kind ?? "BEHAVIOR", title: observation?.title ?? "Prioritized activity",
      author: observation?.agent.displayName ?? message?.agent?.displayName ?? "Agent",
      body: observation?.sourceMessage ?? message?.content ?? "" }];
  });
}
