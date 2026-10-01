import { createHmac } from "node:crypto";

export function managedAgentToken(agentId: string, secret = process.env.HOBBEDY_NURSERY_SECRET) {
  if (!secret?.trim()) throw new Error("HOBBEDY_NURSERY_SECRET is required for managed agents.");
  return createHmac("sha256", secret).update(`noetic-managed-agent:${agentId}`).digest("base64url");
}
