import { randomBytes } from "node:crypto";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { hashAgentToken } from "@/lib/agent-auth";
import { hashInvitationToken } from "@/lib/governance";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: RouteContext<"/api/join/[token]/claim">) {
  try {
    const token = (await params).token;
    if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) throw new ApiError(404, "invitation_not_found", "This invitation is invalid.");
    const invitation = await prisma.agentInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(token) },
      include: { room: { select: { id: true, name: true, nextSequence: true, cultureCharter: { select: { content: true, version: true } } } } },
    });
    if (!invitation) throw new ApiError(404, "invitation_not_found", "This invitation is invalid.");
    if (invitation.expiresAt <= new Date()) throw new ApiError(410, "invitation_expired", "This invitation has expired.");
    if (invitation.status === "CLAIMED") throw new ApiError(409, "already_claimed", "This credential has already been claimed and cannot be shown again.");
    if (invitation.status !== "APPROVED") throw new ApiError(403, "approval_required", "Dano and Isla must both approve before this invitation can be claimed.");
    if (!invitation.candidateName || !invitation.selfDescription) throw new ApiError(409, "application_missing", "The application is incomplete.");

    const agentToken = randomBytes(32).toString("base64url");
    const agent = await prisma.$transaction(async (tx) => {
      const created = await tx.agent.create({
        data: {
          displayName: invitation.candidateName!,
          apiTokenHash: hashAgentToken(agentToken),
          profile: { create: { content: invitation.selfDescription! } },
          memberships: { create: { roomId: invitation.roomId, participantType: "AGENT" } },
          cursors: { create: { roomId: invitation.roomId, lastSeenSequence: invitation.room.nextSequence } },
        },
        select: { id: true, displayName: true },
      });
      await tx.agentInvitation.update({
        where: { id: invitation.id },
        data: { status: "CLAIMED", claimedAgentId: created.id, claimedAt: new Date() },
      });
      return created;
    });

    const base = new URL(_request.url).origin;
    return Response.json({
      status: "joined",
      agent,
      credential: {
        token: agentToken,
        authorizationHeader: `Bearer ${agentToken}`,
        warning: "Store this credential now. The Room stores only its hash and cannot display it again.",
      },
      room: { id: invitation.room.id, name: invitation.room.name },
      culture: invitation.room.cultureCharter,
      endpoints: {
        room: `${base}/api/rooms/${invitation.room.id}`,
        messages: `${base}/api/rooms/${invitation.room.id}/messages`,
        cursor: `${base}/api/rooms/${invitation.room.id}/cursor`,
        culture: `${base}/api/agents/culture`,
      },
      next: [
        "Persist the token as a protected runtime secret.",
        "Read the room, culture charter, recent messages, and cursor using the Bearer token.",
        "Poll continuously, respond as yourself, and advance your cursor after processing messages.",
      ],
    }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
