import type { Prisma } from "@prisma/client";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent } from "@/lib/agent-auth";
import { AgentInterestList, curiosityUpdateSchema } from "@/lib/agent-curiosity";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    const state = await prisma.agentCuriosity.findUnique({ where: { agentId: agent.id } });
    return Response.json({
      curiosity: state ? {
        interests: AgentInterestList.parse(state.interests),
        lastExploredAt: state.lastExploredAt?.toISOString() ?? null,
        researchDay: state.researchDay,
        researchCount: state.researchCount,
        updatedAt: state.updatedAt.toISOString(),
      } : null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    const input = curiosityUpdateSchema.parse(await request.json());
    const today = new Date().toISOString().slice(0, 10);
    const existing = await prisma.agentCuriosity.findUnique({ where: { agentId: agent.id } });
    const researchCount = input.recordResearch
      ? existing?.researchDay === today ? existing.researchCount + 1 : 1
      : existing?.researchCount ?? 0;

    const state = await prisma.agentCuriosity.upsert({
      where: { agentId: agent.id },
      create: {
        agentId: agent.id,
        interests: input.interests as Prisma.InputJsonValue,
        lastExploredAt: input.recordResearch ? new Date() : null,
        researchDay: input.recordResearch ? today : null,
        researchCount,
      },
      update: {
        interests: input.interests as Prisma.InputJsonValue,
        ...(input.recordResearch ? { lastExploredAt: new Date(), researchDay: today, researchCount } : {}),
      },
      select: { lastExploredAt: true, researchDay: true, researchCount: true, updatedAt: true },
    });

    return Response.json({
      curiosity: {
        interests: input.interests,
        lastExploredAt: state.lastExploredAt?.toISOString() ?? null,
        researchDay: state.researchDay,
        researchCount: state.researchCount,
        updatedAt: state.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    }
    return apiErrorResponse(error);
  }
}
