import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { requireHuman, requireHumanRoomMembership, requireSameOrigin } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { messageFeedbackSchema } from "@/lib/room-api";

function parseMessageId(value: string) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new ApiError(400, "invalid_message_id", "The message ID must be a UUID.");
  return parsed.data;
}

async function requireFeedbackTarget(messageId: string, userId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { roomId: true, agentId: true },
  });
  if (!message) throw new ApiError(404, "message_not_found", "Message not found.");
  await requireHumanRoomMembership(userId, message.roomId);
  if (!message.agentId) throw new ApiError(400, "feedback_not_available", "Feedback is only available for agent responses.");
  return message;
}

export async function PUT(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requireHuman(request);
    const messageId = parseMessageId((await params).messageId);
    await requireFeedbackTarget(messageId, user.id);
    const input = messageFeedbackSchema.parse(await request.json());
    const value = input.value === "up" ? "UP" : "DOWN";
    const feedback = await prisma.messageFeedback.upsert({
      where: { messageId_userId: { messageId, userId: user.id } },
      create: { messageId, userId: user.id, value },
      update: { value },
      select: { value: true, updatedAt: true },
    });
    return Response.json({ feedback: { value: feedback.value.toLowerCase(), updatedAt: feedback.updatedAt.toISOString() } });
  } catch (error) {
    if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requireHuman(request);
    const messageId = parseMessageId((await params).messageId);
    await requireFeedbackTarget(messageId, user.id);
    await prisma.messageFeedback.deleteMany({ where: { messageId, userId: user.id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
