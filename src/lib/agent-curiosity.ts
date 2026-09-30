import { z } from "zod";

export const InterestOrigin = z.enum(["inherited", "adjacent", "wildcard"]);

export const AgentInterest = z.object({
  topic: z.string().trim().min(2).max(100),
  why: z.string().trim().min(10).max(500),
  nextQuestion: z.string().trim().min(5).max(300),
  origin: InterestOrigin,
  strength: z.number().int().min(1).max(5),
}).strict();

export const AgentInterestList = z.array(AgentInterest).max(16);

export const curiosityUpdateSchema = z.object({
  interests: AgentInterestList,
  recordResearch: z.boolean().default(false),
}).strict();

export type AgentInterestValue = z.infer<typeof AgentInterest>;
