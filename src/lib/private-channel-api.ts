import { Prisma } from "@prisma/client";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { requireHuman, requireSameOrigin } from "@/lib/human-auth";
import { privateMessageScope, requirePrivateAgent, requirePrivateHuman, serializePrivateMessage, type PrivateChannelKey } from "@/lib/private-channel";
import { prisma } from "@/lib/prisma";
import { MVP_ROOM_ID } from "@/lib/room-constants";
import { MESSAGE_RATE_LIMIT, MESSAGE_RATE_WINDOW_MS, parseAfterSequence, postMessageSchema } from "@/lib/room-api";

const authorInclude = {
  user: { select: { id: true, displayName: true, type: true } },
  agent: { select: { id: true, displayName: true, type: true } },
} satisfies Prisma.PrivateMessageInclude;

export function privateChannelHandlers(channel: PrivateChannelKey, audience: "human" | "agent") {
  async function authenticate(request: Request) {
    if (audience === "agent") {
      const agent = await authenticateAgent(request);
      requirePrivateAgent(agent.id, channel);
      await requireAgentRoomMembership(agent.id, MVP_ROOM_ID);
      return agent.id;
    }
    const user = await requireHuman(request);
    requirePrivateHuman(user.id, channel);
    const membership = await prisma.roomMembership.findUnique({ where: { roomId_userId: { roomId: MVP_ROOM_ID, userId: user.id } } });
    if (!membership) throw new ApiError(404, "private_channel_not_found", "Private channel not found.");
    return user.id;
  }
  return {
    async GET(request: Request) {
      try {
        await authenticate(request);
        const after = parseAfterSequence(new URL(request.url).searchParams.get("after"));
        const scope = privateMessageScope(channel);
        const [messages, latest] = await Promise.all([
          prisma.privateMessage.findMany({ where: { ...scope, sequence: { gt: after } }, orderBy: { sequence: "asc" }, take: 100, include: authorInclude }),
          prisma.privateMessage.aggregate({ where: scope, _max: { sequence: true } }),
        ]);
        const latestSequence = latest._max.sequence ?? 0;
        return Response.json({ messages: messages.map(serializePrivateMessage), latestSequence, hasMore: messages.length === 100 && messages.at(-1)?.sequence !== latestSequence }, { headers: { "Cache-Control": "private, no-store" } });
      } catch (error) { return apiErrorResponse(error); }
    },
    async POST(request: Request) {
      try {
        if (audience === "human") requireSameOrigin(request);
        if (Number(request.headers.get("content-length") ?? 0) > 32_000) throw new ApiError(413, "payload_too_large", "Request body is too large.");
        const id = await authenticate(request);
        const input = postMessageSchema.parse(await request.json());
        const author = audience === "human" ? { userId: id, authorType: "HUMAN" as const } : { agentId: id, authorType: "AGENT" as const };
        const count = await prisma.privateMessage.count({ where: { ...author, createdAt: { gte: new Date(Date.now() - MESSAGE_RATE_WINDOW_MS) } } });
        if (count >= MESSAGE_RATE_LIMIT) throw new ApiError(429, "rate_limited", "Please wait before posting again.");
        const message = await prisma.privateMessage.create({ data: { ...author, channel, content: input.content, metadata: input.metadata as Prisma.InputJsonValue }, include: authorInclude });
        return Response.json({ message: serializePrivateMessage(message) }, { status: 201 });
      } catch (error) {
        if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
        return apiErrorResponse(error);
      }
    },
  };
}
