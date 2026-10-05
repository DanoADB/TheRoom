import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { agentObservationSchema, observationUpdateSchema } from "@/lib/agent-observation";
import { prisma } from "@/lib/prisma";
import { parseResourceId } from "@/lib/room-api";
import { raisedActivity } from "@/lib/activity-priority";

export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    const roomId = parseResourceId(new URL(request.url).searchParams.get("roomId") ?? "", "room");
    await requireAgentRoomMembership(agent.id, roomId);
    const observations = await prisma.roomCuriosity.findMany({
      where: { roomId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
      include: { agent: { select: { id: true, displayName: true } } },
    });
    const messages = await prisma.message.findMany({
      where: { roomId, authorType: "AGENT" }, orderBy: { sequence: "desc" }, take: 150,
      select: { id: true, content: true, metadata: true, createdAt: true, agent: { select: { id: true, displayName: true } } },
    });
    const recorded = new Set(observations.map((entry) => entry.sourceMessage));
    const activity = [
      ...observations.map((entry) => ({ id: entry.id, kind: entry.kind, title: entry.title, body: entry.sourceMessage, reason: entry.reason, agent: entry.agent, timestamp: entry.createdAt.toISOString(), editable: entry.agentId === agent.id })),
      ...messages.flatMap((entry) => {
        const metadata = entry.metadata as Record<string, unknown> | null;
        if (recorded.has(entry.content) || !metadata || !(metadata.proactive === true || metadata.worldCuriosity === true || metadata.codeChange === true)) return [];
        return [{ id: `message:${entry.id}`, kind: metadata.codeChange === true ? "SELF_CHANGE" : metadata.worldCuriosity === true ? "RESEARCH" : "BEHAVIOR", title: entry.agent?.displayName ?? "Agent", body: entry.content, reason: null, agent: entry.agent, timestamp: entry.createdAt.toISOString(), editable: false }];
      }),
    ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100);
    const humanPriorities = await raisedActivity(roomId);
    return Response.json({ observations, activity, humanPriorities }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    const input = agentObservationSchema.parse(await request.json());
    await requireAgentRoomMembership(agent.id, input.roomId);
    const observation = await prisma.roomCuriosity.create({
      data: {
        roomId: input.roomId,
        agentId: agent.id,
        kind: input.kind,
        title: input.title,
        reason: input.reason,
        sourceMessage: input.body,
        ...(input.priority ? { priority: input.priority } : {}),
      },
      select: { id: true, createdAt: true },
    });
    return Response.json({ observation: { ...observation, createdAt: observation.createdAt.toISOString() } }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    const input = observationUpdateSchema.parse(await request.json());
    await requireAgentRoomMembership(agent.id, input.roomId);
    const updated = await prisma.roomCuriosity.updateMany({
      where: { id: input.id, roomId: input.roomId, agentId: agent.id },
      data: {
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.body !== undefined ? { sourceMessage: input.body } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
    });
    if (!updated.count) throw new ApiError(404, "observation_not_found", "Entry not found or not owned by you.");
    return Response.json({ updated: true, id: input.id });
  } catch (error) {
    if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    return apiErrorResponse(error);
  }
}
