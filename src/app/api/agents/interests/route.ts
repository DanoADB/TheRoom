import type { Prisma } from "@prisma/client";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
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
    if (input.researchEntry) await requireAgentRoomMembership(agent.id, input.researchEntry.roomId);
    const today = new Date().toISOString().slice(0, 10);
    const existing = await prisma.agentCuriosity.findUnique({ where: { agentId: agent.id } });
    const previous = AgentInterestList.safeParse(existing?.interests ?? []);
    const previousByTopic = new Map((previous.success ? previous.data : []).map((interest) => [interest.topic.toLowerCase(), interest]));
    const changed = input.interests.filter((interest) => {
      const before = previousByTopic.get(interest.topic.toLowerCase());
      return !before || JSON.stringify(before) !== JSON.stringify(interest);
    });
    const researchCount = input.recordResearch
      ? existing?.researchDay === today ? existing.researchCount + 1 : 1
      : existing?.researchCount ?? 0;

    const state = await prisma.$transaction(async (tx) => {
      const state = await tx.agentCuriosity.upsert({
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
      if (changed.length || input.researchEntry) {
        const memberships = await tx.roomMembership.findMany({ where: { agentId: agent.id }, select: { roomId: true } });
        if (changed.length && memberships.length) {
          await tx.roomCuriosity.createMany({
            data: memberships.flatMap(({ roomId }) => changed.map((interest) => ({
              roomId,
              agentId: agent.id,
              kind: "INTEREST",
              title: interest.topic,
              reason: interest.why.slice(0, 280),
              sourceMessage: `Why: ${interest.why}\n\nOpen question: ${interest.nextQuestion}\n\nOrigin: ${interest.origin} · Strength: ${interest.strength}/5`,
            }))),
          });
        }
        if (input.researchEntry) {
          await tx.roomCuriosity.create({
            data: {
              roomId: input.researchEntry.roomId,
              agentId: agent.id,
              kind: "RESEARCH",
              title: input.researchEntry.title,
              reason: input.researchEntry.reason,
              sourceMessage: input.researchEntry.body,
            },
          });
        }
      }
      return state;
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
