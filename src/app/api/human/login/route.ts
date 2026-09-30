import { cookies } from "next/headers";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import {
  createHumanSession,
  HUMAN_SESSION_COOKIE,
  requireSameOrigin,
  secretsMatch,
} from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  userId: z.uuid(),
  accessCode: z.string().min(8).max(256),
}).strict();

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = loginSchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user?.accessCodeHash || !secretsMatch(input.accessCode, user.accessCodeHash)) {
      throw new ApiError(401, "invalid_login", "That access code is not valid.");
    }

    const session = await createHumanSession(user.id);
    (await cookies()).set(HUMAN_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
      priority: "high",
    });

    return Response.json({ user: { id: user.id, displayName: user.displayName, type: "human" } });
  } catch (error) {
    if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    return apiErrorResponse(error);
  }
}
