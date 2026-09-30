import { cookies } from "next/headers";
import { apiErrorResponse } from "@/lib/api-errors";
import { hashHumanSecret, HUMAN_SESSION_COOKIE, requireSameOrigin } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const cookieStore = await cookies();
    const token = cookieStore.get(HUMAN_SESSION_COOKIE)?.value;
    if (token) {
      await prisma.humanSession.deleteMany({ where: { tokenHash: hashHumanSecret(token) } });
    }
    cookieStore.delete(HUMAN_SESSION_COOKIE);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
