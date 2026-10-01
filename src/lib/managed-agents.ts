import { randomUUID } from "node:crypto";
import { hashAgentToken } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { managedAgentToken } from "@/lib/managed-agent-token";

export { managedAgentToken } from "@/lib/managed-agent-token";

export async function activateApprovedHobbedyInvitation(invitationId: string) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.agentInvitation.updateMany({
      where: { id: invitationId, source: "HOBBEDY", status: "APPROVED", claimedAgentId: null },
      data: { status: "CLAIMED" },
    });
    if (claimed.count === 0) return tx.agentInvitation.findUnique({ where: { id: invitationId } });

    const invitation = await tx.agentInvitation.findUniqueOrThrow({ where: { id: invitationId } });
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
      data: { claimedAgentId: agent.id, claimedAt: new Date() },
    });
    return { ...invitation, status: "CLAIMED" as const, claimedAgentId: agent.id, agent };
  });
}
