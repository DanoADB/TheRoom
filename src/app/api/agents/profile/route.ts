import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
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

const profileSchema = z.object({
  content: z.string().trim().min(1).max(120_000),
}).strict();

export async function PUT(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    const input = profileSchema.parse(await request.json());
    const profile = await prisma.agentProfile.upsert({
      where: { agentId: agent.id },
      create: { agentId: agent.id, content: input.content },
      update: { content: input.content, version: { increment: 1 } },
      select: { version: true, updatedAt: true },
    });

    return Response.json({
      profile: {
        version: profile.version,
        updatedAt: profile.updatedAt.toISOString(),
        characterCount: input.content.length,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    }
    return apiErrorResponse(error);
  }
}
