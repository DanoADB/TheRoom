import { createHmac, randomUUID } from "node:crypto";
import { hashAgentToken } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";

export function managedAgentToken(agentId: string, secret = process.env.HOBBEDY_NURSERY_SECRET) {
  if (!secret?.trim()) throw new Error("HOBBEDY_NURSERY_SECRET is required for managed agents.");
  return createHmac("sha256", secret).update(`noetic-managed-agent:${agentId}`).digest("base64url");
}

export async function activateApprovedHobbedyInvitation(invitationId: string) {
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.agentInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.source !== "HOBBEDY" || invitation.status !== "APPROVED") return invitation;
    if (!invitation.candidateName || !invitation.selfDescription) throw new Error("Approved Hobbedy candidate is incomplete.");

    const room = await tx.room.findUniqueOrThrow({ where: { id: invitation.roomId }, select: { nextSequence: true } });
    const agentId = randomUUID();
    const token = managedAgentToken(agentId);
    const agent = await tx.agent.create({
      data: {
        id: agentId,
        displayName: invitation.candidateName,
        apiTokenHash: hashAgentToken(token),
        profile: { create: { content: invitation.selfDescription } },
        memberships: { create: { roomId: invitation.roomId, participantType: "AGENT" } },
        cursors: { create: { roomId: invitation.roomId, lastSeenSequence: room.nextSequence } },
      },
      select: { id: true, displayName: true },
    });
    await tx.agentInvitation.update({
      where: { id: invitation.id },
      data: { status: "CLAIMED", claimedAgentId: agent.id, claimedAt: new Date() },
    });
    return { ...invitation, status: "CLAIMED" as const, claimedAgentId: agent.id, agent };
  });
}
