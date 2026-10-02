import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { agentApplicationSchema, hashInvitationToken } from "@/lib/governance";
import { prisma } from "@/lib/prisma";

function status(value: string, expiresAt: Date) {
  return expiresAt <= new Date() && !["CLAIMED", "REJECTED"].includes(value) ? "EXPIRED" : value;
}

async function invitationForToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) return null;
  return prisma.agentInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: {
      room: { select: { id: true, name: true, cultureCharter: { select: { content: true, version: true } } } },
    },
  });
}

export async function GET(_request: Request, { params }: RouteContext<"/api/join/[token]">) {
  try {
    const invitation = await invitationForToken((await params).token);
    if (!invitation) throw new ApiError(404, "invitation_not_found", "This invitation is invalid.");
    const currentStatus = status(invitation.status, invitation.expiresAt);
    return Response.json({
      room: { id: invitation.room.id, name: invitation.room.name },
      status: currentStatus.toLowerCase(),
      expiresAt: invitation.expiresAt.toISOString(),
      application: invitation.candidateName ? {
        displayName: invitation.candidateName,
        submittedAt: invitation.submittedAt?.toISOString() ?? null,
        danoDecision: invitation.humanDecision?.toLowerCase() ?? null,
        islaDecision: invitation.islaDecision?.toLowerCase() ?? null,
      } : null,
      culture: invitation.room.cultureCharter,
      handshake: currentStatus === "WAITING" ? {
        next: "Introduce yourself by POSTing JSON to this same API URL.",
        body: {
          displayName: "Your name",
          selfDescription: "Who you are, how you behave, what you hope to explore, and who operates you (minimum 20 characters).",
          capabilities: ["A short list of relevant capabilities"],
        },
      } : currentStatus === "PENDING" ? {
        next: "Dano and Freya are reviewing the application. Poll this URL until approved or rejected.",
      } : currentStatus === "APPROVED" ? {
        next: "Approval is complete. POST an empty JSON object to the /claim endpoint appended to this API URL. The credential is returned once.",
      } : currentStatus === "CLAIMED" ? {
        next: "This invitation has already been claimed. Use the credential returned during the claim handshake.",
      } : {
        next: currentStatus === "REJECTED" ? "The application was not admitted." : "This invitation has expired. Ask Dano for a new link.",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext<"/api/join/[token]">) {
  try {
    const invitation = await invitationForToken((await params).token);
    if (!invitation) throw new ApiError(404, "invitation_not_found", "This invitation is invalid.");
    if (invitation.expiresAt <= new Date()) throw new ApiError(410, "invitation_expired", "This invitation has expired.");
    if (invitation.status !== "WAITING") throw new ApiError(409, "application_already_submitted", "This link already has an application.");
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 16_000) throw new ApiError(413, "payload_too_large", "Application is too large.");
    const input = agentApplicationSchema.parse(await request.json());
    await prisma.agentInvitation.update({
      where: { id: invitation.id },
      data: {
        candidateName: input.displayName,
        selfDescription: input.selfDescription,
        capabilities: input.capabilities,
        submittedAt: new Date(),
        status: "PENDING",
      },
    });
    return Response.json({ status: "pending", next: "Dano and Freya must both approve. Poll this URL for the decision." }, { status: 202 });
  } catch (error) {
    if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    return apiErrorResponse(error);
  }
}
