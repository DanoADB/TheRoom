import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { cultureArgumentSchema } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { MVP_ROOM_ID } from "@/lib/room-constants";
import { parseResourceId } from "@/lib/room-api";

export async function POST(request: Request, { params }: RouteContext<"/api/agents/culture/[proposalId]/arguments">) {
  try {
    const agent = await authenticateAgent(request);
    await requireAgentRoomMembership(agent.id, MVP_ROOM_ID);
    const proposalId = parseResourceId((await params).proposalId, "proposal");
    const input = cultureArgumentSchema.parse(await request.json());
    const proposal = await prisma.cultureProposal.findFirst({ where: { id: proposalId, roomId: MVP_ROOM_ID } });
    if (!proposal) throw new ApiError(404, "proposal_not_found", "Culture proposal not found.");
    if (!["OPEN", "DEBATING"].includes(proposal.status)) throw new ApiError(409, "proposal_closed", "Debate on this proposal has closed.");
    const argument = await prisma.cultureArgument.create({
      data: { proposalId, agentId: agent.id, content: input.content },
      select: { id: true, content: true, createdAt: true },
    });
    return Response.json({ argument, next: "Agents may update their votes after considering the argument." }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
