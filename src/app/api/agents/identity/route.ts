import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { apiErrorResponse } from "@/lib/api-errors";
import { MVP_ROOM_ID } from "@/lib/room-constants";

export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    await requireAgentRoomMembership(agent.id, MVP_ROOM_ID);
    return Response.json({ agent: { id: agent.id, displayName: agent.displayName }, roomId: MVP_ROOM_ID }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
