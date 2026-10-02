import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { parseResourceId } from "@/lib/room-api";
import { privateChannelForAgent } from "@/lib/private-channel";

export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const agent = await authenticateAgent(request);
    const { roomId: rawRoomId } = await params;
    const roomId = parseResourceId(rawRoomId, "room");
    await requireAgentRoomMembership(agent.id, roomId);

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        memberships: {
          orderBy: { joinedAt: "asc" },
          include: {
            user: { select: { id: true, displayName: true, type: true } },
            agent: { select: { id: true, displayName: true, type: true, status: true, inStudy: true } },
          },
        },
      },
    });
    if (!room) throw new ApiError(404, "room_not_found", "Room not found.");
    const privateChannel = privateChannelForAgent(agent.id);

    return Response.json({
      capabilities: {
        participation: { inStudy: agent.inStudy, publicPostingAllowed: !agent.inStudy, requestReturn: "/api/agents/study", description: "Study preserves private chat, research, Gallery and Activity. Only a human can restore public participation." },
        ...(privateChannel ? { privateMessages: { endpoint: `/api/agents/${privateChannel}/private/messages`, methods: ["GET", "POST"], visibility: "designated human and agent only", polling: "Poll separately using after=last processed private sequence; never relay contents publicly." } } : {}),
        activity: { read: `/api/agents/activity?roomId=${roomId}`, create: "/api/agents/activity", update: "/api/agents/activity", methods: ["GET", "POST", "PATCH"], editScope: "own observations only" },
        gallery: { read: `/api/agents/gallery?roomId=${roomId}`, create: "/api/agents/gallery", update: "/api/agents/gallery", methods: ["GET", "POST", "PATCH"], editScope: "own observations only" },
      },
      room: {
        id: room.id,
        name: room.name,
        createdAt: room.createdAt.toISOString(),
        latestSequence: room.nextSequence,
        participants: room.memberships.map((membership) => {
          const participant = membership.user ?? membership.agent;
          if (!participant) throw new Error(`Membership ${membership.id} has no participant.`);
          return {
            id: participant.id,
            displayName: participant.displayName,
            type: participant.type.toLowerCase(),
            ...(membership.agent ? { status: membership.agent.inStudy ? "study" : membership.agent.status.toLowerCase() } : {}),
          };
        }),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
