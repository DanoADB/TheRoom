import { apiErrorResponse } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { AgentInterestList } from "@/lib/agent-curiosity";
import { prisma } from "@/lib/prisma";
import { parseResourceId } from "@/lib/room-api";
import { buildRoomGallery } from "@/lib/room-gallery";

export { POST, PATCH } from "../observations/route";

export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    const roomId = parseResourceId(new URL(request.url).searchParams.get("roomId") ?? "", "room");
    await requireAgentRoomMembership(agent.id, roomId);
    const [observations, memberships] = await Promise.all([
      prisma.roomCuriosity.findMany({ where: { roomId }, orderBy: { createdAt: "desc" }, include: { agent: { select: { id: true, displayName: true } } } }),
      prisma.roomMembership.findMany({ where: { roomId, agentId: { not: null } }, include: { agent: { include: { gallery: { where: { steerAway: false } }, curiosity: true } } } }),
    ]);
    const gallery = memberships.flatMap(({ agent: author }) => author?.gallery.map((entry) => ({ ...entry, author: author.displayName })) ?? []);
    const interests = memberships.flatMap(({ agent: author }) => {
      if (!author?.curiosity) return [];
      const parsed = AgentInterestList.safeParse(author.curiosity.interests);
      return parsed.success ? [{ agentId: author.id, author: author.displayName, updatedAt: author.curiosity.updatedAt, interests: parsed.data }] : [];
    });
    const editable = new Set(observations.filter((entry) => entry.agentId === agent.id).map((entry) => entry.id));
    const buckets = buildRoomGallery(observations, gallery, interests).map((bucket) => ({ ...bucket, items: bucket.items.map((entry) => ({ ...entry, editable: editable.has(entry.id) })) }));
    return Response.json({ buckets }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
