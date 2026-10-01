import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { admissionDecisionSchema, resolveInvitationStatus } from "@/lib/governance";
import { requireHuman, requireSameOrigin } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { activateApprovedHobbedyInvitation } from "@/lib/managed-agents";
import { DANO_USER_ID, MVP_ROOM_ID } from "@/lib/room-constants";
import { parseResourceId } from "@/lib/room-api";

export async function POST(request: Request, { params }: RouteContext<"/api/human/invitations/[invitationId]/decision">) {
  try {
    requireSameOrigin(request);
    const user = await requireHuman(request);
    if (user.id !== DANO_USER_ID) throw new ApiError(403, "owner_required", "Only Dano can decide agent invitations.");
    const invitationId = parseResourceId((await params).invitationId, "invitation");
    const input = admissionDecisionSchema.parse(await request.json());
    const current = await prisma.agentInvitation.findFirst({ where: { id: invitationId, roomId: MVP_ROOM_ID } });
    if (!current) throw new ApiError(404, "invitation_not_found", "Invitation not found.");
    if (!["PENDING", "WAITING"].includes(current.status)) throw new ApiError(409, "invitation_closed", "This invitation is already closed.");
    if (current.status === "WAITING") throw new ApiError(409, "application_missing", "The prospective agent has not introduced itself yet.");
    const humanDecision = input.decision === "approve" ? "APPROVE" : "REJECT";
    const status = resolveInvitationStatus(humanDecision, current.islaDecision);
    const invitation = await prisma.agentInvitation.update({
      where: { id: invitationId },
      data: {
        humanDecision,
        humanDecisionById: user.id,
        humanDecisionReason: input.reason,
        humanDecidedAt: new Date(),
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
