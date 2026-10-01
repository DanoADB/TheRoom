import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { createInvitationToken, hashInvitationToken, INVITATION_LIFETIME_MS } from "@/lib/governance";
import { requireHuman, requireHumanRoomMembership, requireSameOrigin } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { DANO_USER_ID, MVP_ROOM_ID } from "@/lib/room-constants";

function requireDano(userId: string) {
  if (userId !== DANO_USER_ID) throw new ApiError(403, "owner_required", "Only Dano can create or decide agent invitations.");
}

function publicOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? request.headers.get("host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

export async function GET(request: Request) {
  try {
    const user = await requireHuman(request);
    requireDano(user.id);
    await requireHumanRoomMembership(user.id, MVP_ROOM_ID);
    const invitations = await prisma.agentInvitation.findMany({
      where: { roomId: MVP_ROOM_ID },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        candidateName: true,
        selfDescription: true,
        capabilities: true,
        humanDecision: true,
        humanDecisionReason: true,
        islaDecision: true,
        islaDecisionReason: true,
        expiresAt: true,
        createdAt: true,
        source: true,
      },
    });
    return Response.json({ invitations });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireHuman(request);
    requireDano(user.id);
    await requireHumanRoomMembership(user.id, MVP_ROOM_ID);
    const token = createInvitationToken();
    const invitation = await prisma.agentInvitation.create({
      data: {
        roomId: MVP_ROOM_ID,
        createdById: user.id,
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
      },
      select: { id: true, expiresAt: true },
    });
    return Response.json({
      invitation: {
        ...invitation,
        link: `${publicOrigin(request)}/join/${token}`,
      },
    }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
