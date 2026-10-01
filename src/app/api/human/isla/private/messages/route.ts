import { Prisma } from "@prisma/client";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { requireHuman, requireSameOrigin } from "@/lib/human-auth";
import { requirePrivateHuman, serializePrivateMessage } from "@/lib/private-channel";
import { prisma } from "@/lib/prisma";
import { MESSAGE_RATE_LIMIT, MESSAGE_RATE_WINDOW_MS, parseAfterSequence, postMessageSchema } from "@/lib/room-api";

const authorInclude = {
  user: { select: { id: true, displayName: true, type: true } },
  agent: { select: { id: true, displayName: true, type: true } },
} satisfies Prisma.PrivateMessageInclude;

export async function GET(request: Request) {
  try {
    const user = await requireHuman(request);
    requirePrivateHuman(user.id);
    const after = parseAfterSequence(new URL(request.url).searchParams.get("after"));
    const [messages, latest] = await Promise.all([
      prisma.privateMessage.findMany({ where: { sequence: { gt: after } }, orderBy: { sequence: "asc" }, take: 100, include: authorInclude }),
      prisma.privateMessage.aggregate({ _max: { sequence: true } }),
    ]);
    const latestSequence = latest._max.sequence ?? 0;
    return Response.json({ messages: messages.map(serializePrivateMessage), latestSequence, hasMore: messages.length === 100 && messages.at(-1)?.sequence !== latestSequence });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0) > 32_000) throw new ApiError(413, "payload_too_large", "Request body is too large.");
    const user = await requireHuman(request);
    requirePrivateHuman(user.id);
    const input = postMessageSchema.parse(await request.json());
    const recentCount = await prisma.privateMessage.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - MESSAGE_RATE_WINDOW_MS) } } });
    if (recentCount >= MESSAGE_RATE_LIMIT) throw new ApiError(429, "rate_limited", "Please wait before posting again.");
    const message = await prisma.privateMessage.create({
      data: { authorType: "HUMAN", userId: user.id, content: input.content, metadata: input.metadata as Prisma.InputJsonValue },
      include: authorInclude,
    });
    return Response.json({ message: serializePrivateMessage(message) }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    return apiErrorResponse(error);
  }
}
