import { apiErrorResponse } from "@/lib/api-errors";
import { requireHuman, requireHumanRoomMembership } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { MVP_ROOM_ID } from "@/lib/room-constants";

function newestDate(...dates: Array<Date | null | undefined>) {
  return dates.reduce<Date | null>((latest, date) => date && (!latest || date > latest) ? date : latest, null);
}

export async function GET(request: Request) {
  try {
    const user = await requireHuman(request);
    await requireHumanRoomMembership(user.id, MVP_ROOM_ID);
    const memberships = await prisma.roomMembership.findMany({ where: { roomId: MVP_ROOM_ID, agentId: { not: null } }, select: { agentId: true } });
    const agentIds = memberships.flatMap((membership) => membership.agentId ? [membership.agentId] : []);
    const [curiosity, gallery] = await Promise.all([
      prisma.roomCuriosity.aggregate({ where: { roomId: MVP_ROOM_ID }, _count: { _all: true }, _max: { createdAt: true } }),
      agentIds.length ? prisma.agentGalleryItem.aggregate({ where: { agentId: { in: agentIds }, steerAway: false }, _count: { _all: true }, _max: { createdAt: true } }) : Promise.resolve({ _count: { _all: 0 }, _max: { createdAt: null } }),
    ]);
    const activity = { updatedAt: curiosity._max.createdAt?.toISOString() ?? null, count: curiosity._count._all };
    const galleryFreshness = {
      updatedAt: newestDate(curiosity._max.createdAt, gallery._max.createdAt)?.toISOString() ?? null,
      count: curiosity._count._all + gallery._count._all,
    };
    return Response.json({ gallery: galleryFreshness, activity }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
