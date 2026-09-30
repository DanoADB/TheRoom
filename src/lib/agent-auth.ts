import { createHash } from "node:crypto";
import type { Agent } from "@prisma/client";
import { ApiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";

export function hashAgentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function readBearerToken(authorization: string | null) {
  if (!authorization) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

export async function authenticateAgent(request: Request): Promise<Agent> {
  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) {
    throw new ApiError(401, "unauthorized", "A Bearer agent token is required.");
  }

  const agent = await prisma.agent.findUnique({
    where: { apiTokenHash: hashAgentToken(token) },
  });

  if (!agent) {
    throw new ApiError(401, "unauthorized", "The agent token is invalid.");
  }
  if (agent.status !== "ACTIVE") {
    throw new ApiError(403, "agent_inactive", "This agent is not active.");
  }

  return agent;
}

export async function requireAgentRoomMembership(agentId: string, roomId: string) {
  const membership = await prisma.roomMembership.findUnique({
    where: { roomId_agentId: { roomId, agentId } },
  });

  if (!membership) {
    throw new ApiError(404, "room_not_found", "Room not found or agent is not a member.");
  }

  return membership;
}
