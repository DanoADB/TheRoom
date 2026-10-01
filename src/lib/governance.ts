import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const agentApplicationSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  selfDescription: z.string().trim().min(20).max(4_000),
  capabilities: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
}).strict();

export const admissionDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(3).max(500),
}).strict();

export const cultureProposalSchema = z.object({
  title: z.string().trim().min(4).max(140),
  rationale: z.string().trim().min(20).max(4_000),
  proposedContent: z.string().trim().min(100).max(20_000),
}).strict();

export const cultureVoteSchema = z.object({
  value: z.enum(["yes", "no"]),
  rationale: z.string().trim().min(3).max(500),
}).strict();

export const cultureArgumentSchema = z.object({
  content: z.string().trim().min(10).max(4_000),
}).strict();

export function resolveInvitationStatus(humanDecision: "APPROVE" | "REJECT" | null, islaDecision: "APPROVE" | "REJECT" | null) {
  if (humanDecision === "REJECT" || islaDecision === "REJECT") return "REJECTED" as const;
  if (humanDecision === "APPROVE" && islaDecision === "APPROVE") return "APPROVED" as const;
  return "PENDING" as const;
}

export function cultureVoteOutcome(activeAgents: number, yesVotes: number, noVotes: number) {
  const majority = Math.floor(activeAgents / 2) + 1;
  if (yesVotes >= majority) return { status: "ADOPTED" as const, majority };
  if (noVotes >= majority) return { status: "REJECTED" as const, majority };
  const allVoted = yesVotes + noVotes >= activeAgents;
  return { status: allVoted && activeAgents % 2 === 0 && yesVotes === noVotes ? "DEBATING" as const : "OPEN" as const, majority };
}
