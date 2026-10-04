import { describe, it, expect } from "vitest";
import { experimentSchema, experimentUpdateSchema, initialExperiment, experimentUpdate } from "./experiment-notebook";
const input = { roomId: "700a0000-0000-4000-8000-000000000001", title: "A bounded trial", hypothesis: "A specific prediction", successCriterion: "A measurable difference", method: "Compare matched conditions" };
describe("experiment notebook", () => {
  it("requires a prediction and success criterion before results", () => {
    expect(experimentSchema.safeParse({ ...input, successCriterion: "" }).success).toBe(false);
    expect(initialExperiment(experimentSchema.parse(input))).toContain("Status: PROPOSED");
  });
  it("requires evidence for negative and inconclusive outcomes too", () => {
    const update = { roomId: input.roomId, id: input.roomId, status: "NOT_SUPPORTED", evidence: "Matched observations did not differ", outcome: "The prediction failed", nextQuestion: "Would a longer observation change it?" };
    expect(experimentUpdateSchema.safeParse({ ...update, evidence: "" }).success).toBe(false);
    expect(experimentUpdate(experimentUpdateSchema.parse(update), "2026-10-04")).toContain("Status: NOT_SUPPORTED");
  });
  it("rejects arbitrary fields and unbounded records", () => {
    expect(experimentSchema.safeParse({ ...input, privateContents: "secret" }).success).toBe(false);
    expect(experimentSchema.safeParse({ ...input, method: "x".repeat(1201) }).success).toBe(false);
  });
});
