import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { agentObservationSchema } from "@/lib/agent-observation";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    const input = agentObservationSchema.parse(await request.json());
    await requireAgentRoomMembership(agent.id, input.roomId);
    const observation = await prisma.roomCuriosity.create({
      data: {
        roomId: input.roomId,
        agentId: agent.id,
        kind: input.kind,
        title: input.title,
        reason: input.reason,
        sourceMessage: input.body,
      },
      select: { id: true, createdAt: true },
    });
    return Response.json({ observation: { ...observation, createdAt: observation.createdAt.toISOString() } }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    return apiErrorResponse(error);
  }
}
