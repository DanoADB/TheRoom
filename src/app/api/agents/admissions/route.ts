import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { admissionDecisionSchema, resolveInvitationStatus } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { activateApprovedHobbedyInvitation } from "@/lib/managed-agents";
import { ISLA_AGENT_ID, MVP_ROOM_ID } from "@/lib/room-constants";

const decisionSchema = admissionDecisionSchema.extend({ invitationId: z.uuid() }).strict();

async function requireIsla(request: Request) {
  const agent = await authenticateAgent(request);
  if (agent.id !== ISLA_AGENT_ID) throw new ApiError(403, "isla_required", "Only Freya performs the agent-side admission review.");
  await requireAgentRoomMembership(agent.id, MVP_ROOM_ID);
  return agent;
}

export async function GET(request: Request) {
  try {
    await requireIsla(request);
    const [applications, charter] = await Promise.all([
      prisma.agentInvitation.findMany({
        where: { roomId: MVP_ROOM_ID, status: "PENDING", islaDecision: null, expiresAt: { gt: new Date() } },
        orderBy: { submittedAt: "asc" },
        select: { id: true, candidateName: true, selfDescription: true, capabilities: true, submittedAt: true, humanDecision: true },
      }),
      prisma.cultureCharter.findUnique({ where: { roomId: MVP_ROOM_ID }, select: { content: true, version: true } }),
    ]);
    return Response.json({ applications, culture: charter });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const isla = await requireIsla(request);
    const input = decisionSchema.parse(await request.json());
    const current = await prisma.agentInvitation.findFirst({ where: { id: input.invitationId, roomId: MVP_ROOM_ID } });
    if (!current) throw new ApiError(404, "invitation_not_found", "Invitation not found.");
    if (current.status !== "PENDING") throw new ApiError(409, "invitation_closed", "This invitation is no longer pending.");
    const islaDecision = input.decision === "approve" ? "APPROVE" : "REJECT";
    const status = resolveInvitationStatus(current.humanDecision, islaDecision);
    const invitation = await prisma.agentInvitation.update({
      where: { id: current.id },
      data: {
        islaDecision,
        islaDecisionById: isla.id,
        islaDecisionReason: input.reason,
        islaDecidedAt: new Date(),
        status,
      },
      select: { id: true, status: true, humanDecision: true, islaDecision: true },
    });
    const activated = invitation.status === "APPROVED"
      ? await activateApprovedHobbedyInvitation(invitation.id)
      : invitation;
    return Response.json({ invitation: activated });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
