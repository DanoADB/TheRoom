import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { requireHuman, requireHumanRoomMembership, requireSameOrigin } from "@/lib/human-auth";
import { MVP_ROOM_ID, DANO_USER_ID, APRIL_USER_ID } from "@/lib/room-constants";

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireHuman(request);
    await requireHumanRoomMembership(user.id, MVP_ROOM_ID);
    if (![DANO_USER_ID, APRIL_USER_ID].includes(user.id)) throw new ApiError(403, "forbidden", "Only Dano or April can change participation.");
    const input = z.object({ agentId: z.uuid(), inStudy: z.boolean() }).parse(await request.json());
    return await prisma.$transaction(async (tx) => {
      // Same lock as public posting: a completed move cannot be followed by a stale public turn.
      await tx.room.update({ where: { id: MVP_ROOM_ID }, data: { nextSequence: { increment: 0 } } });
      const membership = await tx.roomMembership.findUnique({ where: { roomId_agentId: { roomId: MVP_ROOM_ID, agentId: input.agentId } } });
      if (!membership) throw new ApiError(404, "agent_not_found", "Agent is not in this Room.");
      await tx.agent.update({ where: { id: input.agentId }, data: { inStudy: input.inStudy, returnRequest: null } });
      return Response.json({ inStudy: input.inStudy });
    });
  } catch (error) { return apiErrorResponse(error); }
}
