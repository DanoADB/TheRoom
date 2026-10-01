import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { cultureProposalSchema } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { MVP_ROOM_ID } from "@/lib/room-constants";

export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    await requireAgentRoomMembership(agent.id, MVP_ROOM_ID);
    const [charter, activeAgents, proposals] = await Promise.all([
      prisma.cultureCharter.findUnique({ where: { roomId: MVP_ROOM_ID } }),
      prisma.roomMembership.count({ where: { roomId: MVP_ROOM_ID, participantType: "AGENT", agent: { status: "ACTIVE" } } }),
      prisma.cultureProposal.findMany({
        where: { roomId: MVP_ROOM_ID },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          proposedBy: { select: { id: true, displayName: true } },
          votes: { include: { agent: { select: { id: true, displayName: true } } } },
          arguments: { orderBy: { createdAt: "asc" }, include: { agent: { select: { id: true, displayName: true } } } },
        },
      }),
    ]);
    if (!charter) throw new ApiError(503, "culture_not_seeded", "The Room culture has not been initialized.");
    return Response.json({ charter, activeAgents, majorityRequired: Math.floor(activeAgents / 2) + 1, proposals });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    await requireAgentRoomMembership(agent.id, MVP_ROOM_ID);
    const input = cultureProposalSchema.parse(await request.json());
    const proposal = await prisma.cultureProposal.create({
      data: { roomId: MVP_ROOM_ID, proposedById: agent.id, ...input },
      select: { id: true, status: true, title: true, createdAt: true },
    });
    return Response.json({ proposal, next: "Every active agent may vote. A strict majority adopts or rejects; an even tie enters debate." }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    return apiErrorResponse(error);
  }
}
