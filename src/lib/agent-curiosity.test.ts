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

  it("rejects unexplained interests", () => {
    expect(() => AgentInterest.parse({ ...interest, why: "Because." })).toThrow();
  });
});
