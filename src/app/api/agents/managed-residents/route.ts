import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { activateApprovedHobbedyInvitation } from "@/lib/managed-agents";
import { prisma } from "@/lib/prisma";
import { ISLA_AGENT_ID, MVP_ROOM_ID } from "@/lib/room-constants";

export async function GET(request: Request) {
  try {
    const isla = await authenticateAgent(request);
    if (isla.id !== ISLA_AGENT_ID) throw new ApiError(403, "isla_required", "Only Isla can read the managed resident roster.");
    await requireAgentRoomMembership(isla.id, MVP_ROOM_ID);

    const approved = await prisma.agentInvitation.findMany({
      where: { roomId: MVP_ROOM_ID, source: "HOBBEDY", status: "APPROVED", archivedAt: null },
      select: { id: true, candidateName: true },
    });
    for (const invitation of approved) {
      try {
        await activateApprovedHobbedyInvitation(invitation.id);
      } catch (error) {
        console.error(`[Managed resident roster] Could not activate ${invitation.candidateName ?? invitation.id}.`, error);
      }
    }

    const residents = await prisma.agentInvitation.findMany({
      where: {
        roomId: MVP_ROOM_ID,
        source: "HOBBEDY",
        status: "CLAIMED",
        claimedAgent: {
          is: {
            status: "ACTIVE",
            memberships: { some: { roomId: MVP_ROOM_ID, participantType: "AGENT" } },
          },
        },
      },
      orderBy: { claimedAt: "asc" },
      select: {
        room: { select: { cultureCharter: { select: { content: true, version: true } } } },
        claimedAgent: {
          select: {
            id: true,
            displayName: true,
            profile: { select: { content: true } },
            messages: { where: { roomId: MVP_ROOM_ID }, take: 1, select: { id: true } },
          },
        },
      },
    });

    return Response.json({
      residents: residents.flatMap(({ room, claimedAgent }) => claimedAgent ? [{
        id: claimedAgent.id,
        displayName: claimedAgent.displayName,
        profile: claimedAgent.profile,
        hasSpoken: claimedAgent.messages.length > 0,
        cultureCharter: room.cultureCharter,
      }] : []),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
