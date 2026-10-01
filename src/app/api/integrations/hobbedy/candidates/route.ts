import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { createInvitationToken, hashInvitationToken, INVITATION_LIFETIME_MS } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { DANO_USER_ID, MVP_ROOM_ID } from "@/lib/room-constants";

const candidateSchema = z.object({
  sourceReference: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  selfDescription: z.string().trim().min(80).max(20_000),
  capabilities: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  provenance: z.record(z.string(), z.unknown()).default({}),
});

function requireBridge(request: Request) {
  const expected = process.env.HOBBEDY_NURSERY_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    throw new ApiError(401, "invalid_bridge_credential", "The Hobbedy bridge credential is invalid.");
  }
}

export async function POST(request: Request) {
  try {
    requireBridge(request);
    if (Number(request.headers.get("content-length") ?? 0) > 24_000) throw new ApiError(413, "application_too_large", "Candidate profile is too large.");
    const parsed = candidateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "invalid_candidate", parsed.error.issues[0]?.message ?? "Candidate is invalid.");

    const existing = await prisma.agentInvitation.findUnique({
      where: { source_sourceReference: { source: "HOBBEDY", sourceReference: parsed.data.sourceReference } },
      select: { id: true, status: true },
    });
    if (existing) return Response.json({ invitation: existing });

    const token = createInvitationToken();
    const invitation = await prisma.agentInvitation.create({
      data: {
        roomId: MVP_ROOM_ID,
        createdById: DANO_USER_ID,
        tokenHash: hashInvitationToken(token),
        status: "PENDING",
        candidateName: parsed.data.name,
        selfDescription: parsed.data.selfDescription,
        capabilities: parsed.data.capabilities,
        source: "HOBBEDY",
        sourceReference: parsed.data.sourceReference,
        provenance: JSON.parse(JSON.stringify(parsed.data.provenance)),
        submittedAt: new Date(),
        expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
      },
      select: { id: true, status: true },
    });
    return Response.json({ invitation }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
