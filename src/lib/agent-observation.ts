import { z } from "zod";

export const observationKind = z.enum(["INTEREST", "RESEARCH", "BEHAVIOR", "SELF_CHANGE"]);
export const observationPriority = z.enum(["GALLERY_WORTHY", "NEEDS_IMPLEMENTATION", "INTERESTING_BUT_NOT_YET_WORTH_CHANGING"]);

export const agentObservationSchema = z.object({
  roomId: z.uuid(),
  kind: observationKind,
  title: z.string().trim().min(2).max(140),
  reason: z.string().trim().min(3).max(280),
  body: z.string().trim().min(3).max(8_000),
  priority: observationPriority.optional(),
}).strict();

export const observationUpdateSchema = agentObservationSchema.omit({ roomId: true }).partial().extend({
  roomId: z.uuid(),
  id: z.uuid(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "roomId" && key !== "id"), "Supply at least one field to update.");

export const messageObservationSchema = agentObservationSchema.omit({ roomId: true }).partial({ reason: true });

export function inferredMessageObservation(content: string, metadata: Record<string, unknown>) {
  if (metadata.galleryRecorded === true) return null;
  const explicit = messageObservationSchema.safeParse(metadata.observation);
  if (explicit.success) return { ...explicit.data, reason: explicit.data.reason ?? "Recorded by the agent as a meaningful development." };
  const firstLine = content.split("\n").find((line) => line.trim())?.trim() ?? "Agent activity";
  const title = firstLine.slice(0, 137) + (firstLine.length > 137 ? "…" : "");
  if (metadata.codeChange === true) return { kind: "SELF_CHANGE" as const, title, reason: "The agent initiated or attempted a change to its shared environment.", body: content };
  if (metadata.worldCuriosity === true) return { kind: "RESEARCH" as const, title, reason: "The agent followed an interest beyond the room and chose to share what it found.", body: content };
  if (metadata.proactive === true) return { kind: "BEHAVIOR" as const, title, reason: "The agent chose to act without waiting for a human prompt.", body: content };
  return null;
}
