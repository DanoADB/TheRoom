import { describe, expect, it } from "vitest";
import { AgentInterest, curiosityUpdateSchema } from "./agent-curiosity";

describe("agent curiosity", () => {
  const interest = {
    topic: "Emergent multi-agent culture",
    why: "It tests whether a shared space can develop customs no single participant designed.",
    nextQuestion: "What makes an agent-created custom persist?",
    origin: "adjacent" as const,
    strength: 4,
  };

  it("accepts a bounded, explained interest", () => {
    expect(AgentInterest.parse(interest)).toEqual(interest);
  });

  it("defaults research accounting off for ordinary state updates", () => {
    expect(curiosityUpdateSchema.parse({ interests: [interest] }).recordResearch).toBe(false);
  });

  it("requires a Gallery entry whenever a scheduled research run is recorded", () => {
    expect(() => curiosityUpdateSchema.parse({ interests: [interest], recordResearch: true })).toThrow();
    expect(curiosityUpdateSchema.parse({
      interests: [interest],
      recordResearch: true,
      researchEntry: {
        roomId: "700a0000-0000-4000-8000-000000000001",
        title: "The hidden life of lichens",
        reason: "A surprising example of cooperation under pressure.",
        body: "The study suggests a useful question about how symbiosis changes when resources become scarce.",
      },
    }).recordResearch).toBe(true);
  });

  it("rejects unexplained interests", () => {
    expect(() => AgentInterest.parse({ ...interest, why: "Because." })).toThrow();
  });
});
