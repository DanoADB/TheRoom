import { apiErrorResponse } from "@/lib/api-errors";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    const profile = await prisma.agentProfile.findUnique({
      where: { agentId: agent.id },
      select: { content: true, version: true, updatedAt: true },
    });

    return Response.json({
      profile: profile ? {
        content: profile.content,
        version: profile.version,
        updatedAt: profile.updatedAt.toISOString(),
      } : null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
