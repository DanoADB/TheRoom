import { ApiError, apiErrorResponse } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { requireHuman, requireHumanRoomMembership } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { parseResourceId } from "@/lib/room-api";

export async function GET(request: Request, { params }: RouteContext<"/api/messages/[messageId]/attachments/[attachmentId]">) {
  try {
    const raw = await params;
    const messageId = parseResourceId(raw.messageId, "message");
    const attachmentId = parseResourceId(raw.attachmentId, "attachment");
    const attachment = await prisma.messageAttachment.findFirst({
      where: { id: attachmentId, messageId },
      select: {
        fileName: true,
        mimeType: true,
        data: true,
        message: { select: { roomId: true } },
      },
    });
    if (!attachment) throw new ApiError(404, "attachment_not_found", "Image not found.");
    if (request.headers.get("authorization")?.toLowerCase().startsWith("bearer ")) {
      const agent = await authenticateAgent(request);
      await requireAgentRoomMembership(agent.id, attachment.message.roomId);
    } else {
      const user = await requireHuman(request);
      await requireHumanRoomMembership(user.id, attachment.message.roomId);
    }

    return new Response(Uint8Array.from(attachment.data), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
