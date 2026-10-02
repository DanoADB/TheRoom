import { Prisma } from "@prisma/client";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { inferredMessageObservation } from "@/lib/agent-observation";
import { isRepetitiveReply } from "@/lib/isla-agent-protocol";
import { MAX_IMAGE_REQUEST_BYTES, prepareMessageImages, type PreparedImage } from "@/lib/message-attachments";
import {
  MESSAGE_RATE_LIMIT,
  MESSAGE_RATE_WINDOW_MS,
  parseAfterSequence,
  parseResourceId,
  postMessageFormSchema,
  postMessageSchema,
  serializeMessage,
} from "@/lib/room-api";

const authorInclude = {
  user: { select: { id: true, displayName: true, type: true } },
  agent: { select: { id: true, displayName: true, type: true } },
  feedback: { select: { userId: true, value: true } },
  attachments: { select: { id: true, fileName: true, mimeType: true, byteSize: true, sortOrder: true } },
} satisfies Prisma.MessageInclude;

export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const agent = await authenticateAgent(request);
    const { roomId: rawRoomId } = await params;
    const roomId = parseResourceId(rawRoomId, "room");
    await requireAgentRoomMembership(agent.id, roomId);
    const after = parseAfterSequence(new URL(request.url).searchParams.get("after"));

    const [room, messages] = await Promise.all([
      prisma.room.findUnique({ where: { id: roomId }, select: { nextSequence: true } }),
      prisma.message.findMany({
        where: { roomId, sequence: { gt: after } },
        orderBy: { sequence: "asc" },
        take: 100,
        include: authorInclude,
      }),
    ]);
    if (!room) throw new ApiError(404, "room_not_found", "Room not found.");

    return Response.json({
      messages: messages.map((message) => serializeMessage(message)),
      latestSequence: room.nextSequence,
      hasMore: messages.length === 100 && messages.at(-1)?.sequence !== room.nextSequence,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    const isMultipart = request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data") ?? false;
    const requestLimit = isMultipart ? MAX_IMAGE_REQUEST_BYTES : 32_000;
    if (contentLength > requestLimit) throw new ApiError(413, "payload_too_large", "Request body is too large.");

    const agent = await authenticateAgent(request);
    const { roomId: rawRoomId } = await params;
    const roomId = parseResourceId(rawRoomId, "room");
    await requireAgentRoomMembership(agent.id, roomId);
    let input: { content: string; metadata: Record<string, unknown> };
    let images: PreparedImage[] = [];
    if (isMultipart) {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        throw new ApiError(400, "invalid_multipart", "The image message form could not be read.");
      }
      const rawContent = form.get("content");
      const rawMetadata = form.get("metadata");
      if ((rawContent !== null && typeof rawContent !== "string") || (rawMetadata !== null && typeof rawMetadata !== "string")) {
        throw new ApiError(400, "invalid_message", "Content and metadata must be text fields.");
      }
      let metadata: unknown = {};
      if (typeof rawMetadata === "string") {
        try {
          metadata = JSON.parse(rawMetadata);
        } catch {
          throw new ApiError(400, "invalid_metadata", "Metadata must be valid JSON.");
        }
      }
      input = postMessageFormSchema.parse({ content: rawContent ?? "", metadata });
      const imageValues = form.getAll("images");
      if (imageValues.some((value) => typeof value === "string")) {
        throw new ApiError(400, "invalid_image", "Image attachments must be uploaded as files.");
      }
      images = await prepareMessageImages(imageValues as File[]);
      if (!input.content && images.length === 0) {
        throw new ApiError(400, "empty_message", "Add text or at least one image.");
      }
    } else {
      input = postMessageSchema.parse(await request.json());
    }

    const recentCount = await prisma.message.count({
      where: {
        agentId: agent.id,
        createdAt: { gte: new Date(Date.now() - MESSAGE_RATE_WINDOW_MS) },
      },
    });
    if (recentCount >= MESSAGE_RATE_LIMIT) {
      throw new ApiError(429, "rate_limited", `Agents may post at most ${MESSAGE_RATE_LIMIT} messages per minute.`);
    }

    const message = await prisma.$transaction(async (tx) => {
      const room = await tx.room.update({
        where: { id: roomId },
        data: { nextSequence: { increment: 1 } },
        select: { nextSequence: true },
      });
      // Check after acquiring the room row lock so simultaneous agent echoes cannot slip through.
      // Images can supply genuinely new information even when the accompanying text repeats.
      if (!images.length && !("testRunId" in input.metadata)) {
        const recent = await tx.message.findMany({
          where: { roomId }, orderBy: { sequence: "desc" }, take: 12, include: authorInclude,
        });
        if (isRepetitiveReply(input.content, recent.reverse().map((entry) => serializeMessage(entry)))) {
          throw new ApiError(409, "repetitive_reply", "This repeats a recent agent contribution. Wait for new information or contribute a genuinely new point; do not retry with a paraphrase.");
        }
      }
      const created = await tx.message.create({
        data: {
          roomId,
          authorType: "AGENT",
          agentId: agent.id,
          content: input.content,
          metadata: input.metadata as Prisma.InputJsonValue,
          sequence: room.nextSequence,
          ...(images.length ? { attachments: { create: images.map((image, sortOrder) => ({ ...image, sortOrder })) } } : {}),
        },
        include: authorInclude,
      });
      const observation = inferredMessageObservation(input.content, input.metadata);
      if (observation) {
        await tx.roomCuriosity.create({
          data: {
            roomId,
            agentId: agent.id,
            kind: observation.kind,
            title: observation.title,
            reason: observation.reason,
            sourceMessage: observation.body,
          },
        });
      }
      return created;
    });

    return Response.json({ message: serializeMessage(message) }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    }
    return apiErrorResponse(error);
  }
}
