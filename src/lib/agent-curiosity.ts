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

export const ResearchGalleryEntry = z.object({
  roomId: z.uuid(),
  title: z.string().trim().min(2).max(140),
  reason: z.string().trim().min(3).max(280),
  body: z.string().trim().min(3).max(8_000),
}).strict();

export const curiosityUpdateSchema = z.object({
  interests: AgentInterestList,
  recordResearch: z.boolean().default(false),
  researchEntry: ResearchGalleryEntry.optional(),
}).strict().refine((input) => !input.recordResearch || Boolean(input.researchEntry), {
  message: "A Gallery research entry is required when recording research.",
  path: ["researchEntry"],
});

export type AgentInterestValue = z.infer<typeof AgentInterest>;
