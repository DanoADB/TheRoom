import { timingSafeEqual } from "node:crypto";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { activateApprovedHobbedyInvitation } from "@/lib/managed-agents";

function requireBridge(request: Request) {
  const expected = process.env.HOBBEDY_NURSERY_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    throw new ApiError(401, "invalid_bridge_credential", "The Hobbedy bridge credential is invalid.");
  }
}

export async function GET(request: Request, { params }: RouteContext<"/api/integrations/hobbedy/candidates/[sourceReference]">) {
  try {
    requireBridge(request);
    const sourceReference = decodeURIComponent((await params).sourceReference);
    let invitation = await prisma.agentInvitation.findUnique({
      where: { source_sourceReference: { source: "HOBBEDY", sourceReference } },
      select: { id: true, status: true, claimedAgentId: true, humanDecisionReason: true, islaDecisionReason: true, updatedAt: true },
    });
    if (!invitation) throw new ApiError(404, "candidate_not_found", "This Hobbedy candidate is unknown.");
    if (invitation.status === "APPROVED") {
      await activateApprovedHobbedyInvitation(invitation.id);
      invitation = await prisma.agentInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
        select: { id: true, status: true, claimedAgentId: true, humanDecisionReason: true, islaDecisionReason: true, updatedAt: true },
      });
    }
    return Response.json({ invitation });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
