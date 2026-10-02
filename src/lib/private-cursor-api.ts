import { z } from "zod";
import { apiErrorResponse, ApiError } from "./api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "./agent-auth";
import { privateMessageScope, requirePrivateAgent, type PrivateChannelKey } from "./private-channel";
import { prisma } from "./prisma";
import { MVP_ROOM_ID } from "./room-constants";

const inputSchema = z.object({ lastSeenSequence: z.number().int().nonnegative() }).strict();

export function privateCursorHandlers(channel: PrivateChannelKey) {
  async function identity(request: Request) {
    const agent = await authenticateAgent(request);
    requirePrivateAgent(agent.id, channel);
    await requireAgentRoomMembership(agent.id, MVP_ROOM_ID);
    return { agentId: agent.id, channel };
  }
  return {
    async GET(request: Request) {
      try {
        const key = await identity(request);
        const cursor = await prisma.privateChannelCursor.upsert({ where: { agentId_channel: key }, create: key, update: {} });
        return Response.json({ lastSeenSequence: cursor.lastSeenSequence }, { headers: { "Cache-Control": "private, no-store" } });
      } catch (error) { return apiErrorResponse(error); }
    },
    async PATCH(request: Request) {
      try {
        const key = await identity(request);
        const input = inputSchema.parse(await request.json());
        const latest = await prisma.privateMessage.aggregate({ where: privateMessageScope(channel), _max: { sequence: true } });
        if (input.lastSeenSequence > (latest._max.sequence ?? 0)) throw new ApiError(400, "invalid_cursor", "Cursor is ahead of this private channel.");
        await prisma.privateChannelCursor.upsert({ where: { agentId_channel: key }, create: key, update: {} });
        const updated = await prisma.privateChannelCursor.updateMany({ where: { ...key, lastSeenSequence: { lte: input.lastSeenSequence } }, data: input });
        if (!updated.count) throw new ApiError(409, "cursor_regression", "The private cursor cannot move backwards.");
        return Response.json(input, { headers: { "Cache-Control": "private, no-store" } });
      } catch (error) {
        if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
        return apiErrorResponse(error);
      }
    },
  };
}
