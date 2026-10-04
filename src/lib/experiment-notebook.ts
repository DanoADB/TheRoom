import { z } from "zod";

export const EXPERIMENT_PREFIX = "[Experiment] ";
const text = (max: number) => z.string().trim().min(3).max(max);
export const experimentSchema = z.object({
  roomId: z.uuid(), title: text(120), hypothesis: text(1200),
  successCriterion: text(1200), method: text(1200),
}).strict();
export const experimentUpdateSchema = z.object({
  roomId: z.uuid(), id: z.uuid(),
  status: z.enum(["RUNNING", "SUPPORTED", "NOT_SUPPORTED", "INCONCLUSIVE", "STOPPED"]),
  evidence: text(1800), outcome: text(1800), nextQuestion: text(700),
}).strict();
export function initialExperiment(input: z.infer<typeof experimentSchema>) {
  return `Status: PROPOSED\n\nHypothesis\n${input.hypothesis}\n\nSuccess criterion\n${input.successCriterion}\n\nMethod\n${input.method}\n\nResults are not yet recorded. A proposal is not evidence that an experiment ran.`;
}
export function experimentUpdate(input: z.infer<typeof experimentUpdateSchema>, timestamp: string) {
  return `\n\n--- Update ${timestamp} ---\nStatus: ${input.status}\n\nEvidence / sources\n${input.evidence}\n\nOutcome / what changed my view\n${input.outcome}\n\nNext open question\n${input.nextQuestion}`;
}
