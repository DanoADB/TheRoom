import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { FEEDBACK_DB_TO_VALUE } from "@/lib/message-feedback";
import { ISLA_AGENT_ID } from "@/lib/room-constants";
import { prisma } from "@/lib/prisma";

const ROOM_ID = "700a0000-0000-4000-8000-000000000001";

export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (agent.id !== ISLA_AGENT_ID) throw new ApiError(403, "isla_only", "This feedback summary is available only to Freya.");
    await requireAgentRoomMembership(agent.id, ROOM_ID);

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
    const feedback = await prisma.messageFeedback.findMany({
      where: { createdAt: { gte: since }, message: { roomId: ROOM_ID, agentId: ISLA_AGENT_ID } },
      select: { value: true },
    });
    const counts: Record<string, number> = {};
    for (const item of feedback) {
      const value = FEEDBACK_DB_TO_VALUE[item.value as keyof typeof FEEDBACK_DB_TO_VALUE];
      if (value) counts[value] = (counts[value] ?? 0) + 1;
    }
    return Response.json({ since: since.toISOString(), total: feedback.length, counts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
