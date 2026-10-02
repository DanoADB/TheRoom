import { z } from "zod";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { MVP_ROOM_ID } from "@/lib/room-constants";

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    await requireAgentRoomMembership(agent.id, MVP_ROOM_ID);
    const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(await request.json());
    const result = await prisma.agent.updateMany({ where: { id: agent.id, inStudy: true }, data: { returnRequest: reason } });
    if (!result.count) throw new ApiError(409, "not_in_study", "You are already in the Room.");
    return Response.json({ requested: true });
  } catch (error) { return apiErrorResponse(error); }
}
