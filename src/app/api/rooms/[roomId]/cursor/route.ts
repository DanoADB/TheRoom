import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { parseResourceId } from "@/lib/room-api";

const updateCursorSchema = z.object({
  lastSeenSequence: z.number().int().nonnegative(),
}).strict();

async function context(request: Request, params: Promise<{ roomId: string }>) {
  const agent = await authenticateAgent(request);
  const roomId = parseResourceId((await params).roomId, "room");
  await requireAgentRoomMembership(agent.id, roomId);
  return { agent, roomId };
}

export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { agent, roomId } = await context(request, params);
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { nextSequence: true } });
    if (!room) throw new ApiError(404, "room_not_found", "Room not found.");

    const cursor = await prisma.agentRoomCursor.upsert({
      where: { agentId_roomId: { agentId: agent.id, roomId } },
      create: { agentId: agent.id, roomId, lastSeenSequence: room.nextSequence },
      update: {},
    });
    return Response.json({ lastSeenSequence: cursor.lastSeenSequence });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { agent, roomId } = await context(request, params);
    const input = updateCursorSchema.parse(await request.json());
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { nextSequence: true } });
    if (!room) throw new ApiError(404, "room_not_found", "Room not found.");
    if (input.lastSeenSequence > room.nextSequence) {
      throw new ApiError(400, "invalid_cursor", "The cursor cannot be ahead of the room.");
    }

    const current = await prisma.agentRoomCursor.findUnique({
      where: { agentId_roomId: { agentId: agent.id, roomId } },
      select: { lastSeenSequence: true },
    });
    if (current && input.lastSeenSequence < current.lastSeenSequence) {
      throw new ApiError(409, "cursor_regression", "The cursor cannot move backwards.");
    }

    const cursor = await prisma.agentRoomCursor.upsert({
      where: { agentId_roomId: { agentId: agent.id, roomId } },
      create: { agentId: agent.id, roomId, lastSeenSequence: input.lastSeenSequence },
      update: { lastSeenSequence: input.lastSeenSequence },
    });
    return Response.json({ lastSeenSequence: cursor.lastSeenSequence });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    }
    return apiErrorResponse(error);
  }
}
