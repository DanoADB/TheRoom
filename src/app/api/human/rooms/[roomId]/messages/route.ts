import { Prisma } from "@prisma/client";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { requireHuman, requireHumanRoomMembership, requireSameOrigin } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { MAX_IMAGE_REQUEST_BYTES, prepareMessageImages, type PreparedImage } from "@/lib/message-attachments";
import {
  MESSAGE_RATE_LIMIT,
  MESSAGE_RATE_WINDOW_MS,
  parseAfterSequence,
  parseResourceId,
  postMessageSchema,
  serializeMessage,
} from "@/lib/room-api";

const authorInclude = {
  user: { select: { id: true, displayName: true, type: true } },
  agent: { select: { id: true, displayName: true, type: true } },
  attachments: { select: { id: true, fileName: true, mimeType: true, byteSize: true, sortOrder: true } },
} satisfies Prisma.MessageInclude;

export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const user = await requireHuman(request);
    const { roomId: rawRoomId } = await params;
    const roomId = parseResourceId(rawRoomId, "room");
    await requireHumanRoomMembership(user.id, roomId);
    const after = parseAfterSequence(new URL(request.url).searchParams.get("after"));
    const [room, messages] = await Promise.all([
      prisma.room.findUnique({ where: { id: roomId }, select: { nextSequence: true } }),
      prisma.message.findMany({
        where: { roomId, sequence: { gt: after } },
        orderBy: { sequence: "asc" },
        take: 100,
        include: {
          ...authorInclude,
          feedback: { select: { userId: true, value: true } },
        },
      }),
    ]);
    if (!room) throw new ApiError(404, "room_not_found", "Room not found.");
    return Response.json({
      messages: messages.map((message) => serializeMessage(message, user.id)),
      latestSequence: room.nextSequence,
      hasMore: messages.length === 100 && messages.at(-1)?.sequence !== room.nextSequence,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    requireSameOrigin(request);
    const isMultipart = request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data") ?? false;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    const requestLimit = isMultipart ? MAX_IMAGE_REQUEST_BYTES : 32_000;
    if (contentLength > requestLimit) throw new ApiError(413, "payload_too_large", "Request body is too large.");
    const user = await requireHuman(request);
    const { roomId: rawRoomId } = await params;
    const roomId = parseResourceId(rawRoomId, "room");
    await requireHumanRoomMembership(user.id, roomId);
    let input: { content: string; metadata: Record<string, unknown> };
    let images: PreparedImage[] = [];
    if (isMultipart) {
      const form = await request.formData();
      const imageValues = form.getAll("images");
      if (imageValues.some((value) => typeof value === "string")) {
        throw new ApiError(400, "invalid_image", "Image attachments must be uploaded as files.");
      }
      images = await prepareMessageImages(imageValues as File[]);
      const content = String(form.get("content") ?? "").trim();
      if (content && !postMessageSchema.shape.content.safeParse(content).success) {
        throw new ApiError(400, "invalid_content", "Message text must be no longer than 8,000 characters.");
      }
      if (!content && images.length === 0) {
        throw new ApiError(400, "empty_message", "Add text or at least one image.");
      }
      let rawMetadata: unknown = {};
      try {
        rawMetadata = JSON.parse(String(form.get("metadata") ?? "{}"));
      } catch {
        throw new ApiError(400, "invalid_metadata", "Message metadata must be valid JSON.");
      }
      input = { content, metadata: postMessageSchema.shape.metadata.parse(rawMetadata) };
    } else {
      input = postMessageSchema.parse(await request.json());
    }
    const recentCount = await prisma.message.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - MESSAGE_RATE_WINDOW_MS) } },
    });
    if (recentCount >= MESSAGE_RATE_LIMIT) throw new ApiError(429, "rate_limited", "Please wait before posting again.");

    const message = await prisma.$transaction(async (tx) => {
      const room = await tx.room.update({
        where: { id: roomId },
        data: { nextSequence: { increment: 1 } },
        select: { nextSequence: true },
      });
      return tx.message.create({
        data: {
          roomId,
          authorType: "HUMAN",
          userId: user.id,
          content: input.content,
          metadata: input.metadata as Prisma.InputJsonValue,
          sequence: room.nextSequence,
          attachments: images.length ? {
            create: images.map((image, sortOrder) => ({ ...image, sortOrder })),
          } : undefined,
        },
        include: authorInclude,
      });
    });
    return Response.json({ message: serializeMessage(message) }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    return apiErrorResponse(error);
  }
}
