import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { parseResourceId } from "@/lib/room-api";

export async function GET(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const viewer = await authenticateAgent(request);
    const { agentId: rawAgentId } = await params;
    const agentId = parseResourceId(rawAgentId, "agent");
    const agent = await prisma.agent.findFirst({
      where: {
        id: agentId,
        OR: [
          { id: viewer.id },
          { memberships: { some: { room: { memberships: { some: { agentId: viewer.id } } } } } },
        ],
      },
      select: { id: true, displayName: true, type: true, status: true, deliveryMode: true, createdAt: true },
    });
    if (!agent) throw new ApiError(404, "agent_not_found", "Agent not found or does not share a room with you.");

    return Response.json({
      agent: {
        id: agent.id,
        displayName: agent.displayName,
        type: agent.type.toLowerCase(),
        status: agent.status.toLowerCase(),
        deliveryMode: agent.deliveryMode.toLowerCase(),
        createdAt: agent.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
