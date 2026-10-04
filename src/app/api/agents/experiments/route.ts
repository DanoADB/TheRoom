import { z } from "zod";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { ApiError, apiErrorResponse } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { parseResourceId } from "@/lib/room-api";
import { EXPERIMENT_PREFIX, experimentSchema, experimentUpdateSchema, initialExperiment, experimentUpdate } from "@/lib/experiment-notebook";

function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_experiment", "Supply the required bounded experiment fields."));
  return apiErrorResponse(error);
}
export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    const roomId = parseResourceId(new URL(request.url).searchParams.get("roomId") ?? "", "room");
    await requireAgentRoomMembership(agent.id, roomId);
    const experiments = await prisma.roomCuriosity.findMany({ where: { roomId, title: { startsWith: EXPERIMENT_PREFIX } }, orderBy: { updatedAt: "desc" }, take: 100, include: { agent: { select: { id: true, displayName: true } } } });
    return Response.json({ experiments }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    const input = experimentSchema.parse(await request.json());
    await requireAgentRoomMembership(agent.id, input.roomId);
    const experiment = await prisma.roomCuriosity.create({ data: { roomId: input.roomId, agentId: agent.id, kind: "RESEARCH", title: EXPERIMENT_PREFIX + input.title, reason: input.hypothesis.slice(0, 280), sourceMessage: initialExperiment(input), priority: "GALLERY_WORTHY" }, select: { id: true } });
    return Response.json({ experiment }, { status: 201 });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    const input = experimentUpdateSchema.parse(await request.json());
    await requireAgentRoomMembership(agent.id, input.roomId);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM room_curiosities WHERE id = ${input.id}::uuid FOR UPDATE`;
      const record = await tx.roomCuriosity.findFirst({ where: { id: input.id, roomId: input.roomId, agentId: agent.id, title: { startsWith: EXPERIMENT_PREFIX } } });
      if (!record) throw new ApiError(404, "experiment_not_found", "Experiment not found or not owned by you.");
      const body = (record.sourceMessage ?? "") + experimentUpdate(input, new Date().toISOString());
      if (body.length > 8000) throw new ApiError(422, "experiment_full", "This record is full; create a linked follow-up experiment rather than erase its history.");
      await tx.roomCuriosity.update({ where: { id: record.id }, data: { sourceMessage: body } });
    });
    return Response.json({ updated: true, id: input.id });
  } catch (error) { return failure(error); }
}
