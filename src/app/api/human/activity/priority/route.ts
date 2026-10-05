import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { activityPrioritySchema } from "@/lib/activity-priority";
import { requireHuman, requireHumanRoomMembership, requireSameOrigin } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireHuman(request);
    const input = activityPrioritySchema.parse(await request.json());
    await requireHumanRoomMembership(user.id, input.roomId);
    const [type, id] = input.entryId.split(":");
    const target = type === "observation"
      ? await prisma.roomCuriosity.findFirst({ where: { id, roomId: input.roomId } })
      : await prisma.message.findFirst({ where: { id, roomId: input.roomId, authorType: "AGENT" } });
    if (!target) throw new ApiError(404, "activity_not_found", "Activity entry not found.");
    if (input.raised) {
      await prisma.activityPriority.upsert({ where: { roomId_entryId: { roomId: input.roomId, entryId: input.entryId } },
        create: { roomId: input.roomId, entryId: input.entryId, raisedBy: user.id }, update: {} });
    } else {
      await prisma.activityPriority.deleteMany({ where: { roomId: input.roomId, entryId: input.entryId } });
    }
    return Response.json({ raised: input.raised });
  } catch (error) {
    if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    return apiErrorResponse(error);
  }
}
