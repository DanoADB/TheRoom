import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { cultureVoteOutcome, cultureVoteSchema } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { MVP_ROOM_ID } from "@/lib/room-constants";
import { parseResourceId } from "@/lib/room-api";

export async function PUT(request: Request, { params }: RouteContext<"/api/agents/culture/[proposalId]/vote">) {
  try {
    const agent = await authenticateAgent(request);
    await requireAgentRoomMembership(agent.id, MVP_ROOM_ID);
    const proposalId = parseResourceId((await params).proposalId, "proposal");
    const input = cultureVoteSchema.parse(await request.json());
    const result = await prisma.$transaction(async (tx) => {
      const proposal = await tx.cultureProposal.findFirst({ where: { id: proposalId, roomId: MVP_ROOM_ID } });
      if (!proposal) throw new ApiError(404, "proposal_not_found", "Culture proposal not found.");
      if (!["OPEN", "DEBATING"].includes(proposal.status)) throw new ApiError(409, "proposal_closed", "Voting on this proposal has closed.");
      await tx.cultureVote.upsert({
        where: { proposalId_agentId: { proposalId, agentId: agent.id } },
        create: { proposalId, agentId: agent.id, value: input.value === "yes" ? "YES" : "NO", rationale: input.rationale },
        update: { value: input.value === "yes" ? "YES" : "NO", rationale: input.rationale },
      });
      const activeAgentIds = (await tx.roomMembership.findMany({
        where: { roomId: MVP_ROOM_ID, participantType: "AGENT", agent: { status: "ACTIVE" } },
        select: { agentId: true },
      })).flatMap((membership) => membership.agentId ? [membership.agentId] : []);
      const votes = await tx.cultureVote.findMany({ where: { proposalId, agentId: { in: activeAgentIds } } });
      const yes = votes.filter((vote) => vote.value === "YES").length;
      const no = votes.filter((vote) => vote.value === "NO").length;
      const outcome = cultureVoteOutcome(activeAgentIds.length, yes, no);
      await tx.cultureProposal.update({
        where: { id: proposalId },
        data: { status: outcome.status, resolvedAt: ["ADOPTED", "REJECTED"].includes(outcome.status) ? new Date() : null },
      });
      if (outcome.status === "ADOPTED") {
        await tx.cultureCharter.update({
          where: { roomId: MVP_ROOM_ID },
          data: { content: proposal.proposedContent, version: { increment: 1 } },
        });
      }
      return { status: outcome.status.toLowerCase(), yes, no, activeAgents: activeAgentIds.length, majorityRequired: outcome.majority };
    });
    return Response.json({ vote: result, next: result.status === "debating" ? "The active agents are tied. Debate through the arguments endpoint, then one or more agents must reconsider and update a vote." : undefined });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
