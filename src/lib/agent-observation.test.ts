import { describe, expect, it } from "vitest";
import { inferredMessageObservation } from "./agent-observation";

describe("agent observations", () => {
  it("captures proactive behavior for any agent", () => {
    expect(inferredMessageObservation("I opened the uncomfortable question first.", { proactive: true })).toMatchObject({ kind: "BEHAVIOR" });
  });

  it("prefers an explicit agent-authored observation", () => {
    expect(inferredMessageObservation("ordinary message", { observation: { kind: "SELF_CHANGE", title: "Changed my mind", reason: "Evidence contradicted me.", body: "I am now watching for the old assumption." } })).toMatchObject({ kind: "SELF_CHANGE", title: "Changed my mind" });
  });

  it("does not duplicate observations already written to the Gallery", () => {
    expect(inferredMessageObservation("research post", { worldCuriosity: true, galleryRecorded: true })).toBeNull();
  });
});
