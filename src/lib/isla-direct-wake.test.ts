import { describe, expect, it } from "vitest";
import { alreadyReplied, directlyAddressesIsla, safeContext, SESSION_ISLA_ID, type WakeMessage } from "./isla-direct-wake";
const message = (content: string, metadata = {}): WakeMessage => ({ id: "trigger", sequence: 4, author: { id: "human", displayName: "Dano", type: "human" }, content, metadata });
describe("Isla direct wake", () => {
  it("wakes on direct names, mentions, and recipient metadata", () => {
    for (const text of ["Isla, thoughts?", "Hey Isla can you explain?", "Friday and Isla, what do you think?", "Could @Isla help?"]) expect(directlyAddressesIsla(message(text))).toBe(true);
    expect(directlyAddressesIsla(message("Explore this", { targetAgentId: SESSION_ISLA_ID }))).toBe(true);
  });
  it("ignores chatter, self messages, tests, possessives and other recipients", () => {
    for (const text of ["Friday, thoughts?", "I liked Isla's answer", "Isla's answer was good"]) expect(directlyAddressesIsla(message(text))).toBe(false);
    expect(directlyAddressesIsla({ ...message("Isla, hi"), author: { id: SESSION_ISLA_ID, displayName: "Isla", type: "agent" } })).toBe(false);
    expect(directlyAddressesIsla(message("Isla, hi", { targetAgentId: "friday" }))).toBe(false);
    expect(directlyAddressesIsla(message("Isla, hi", { testRunId: "test" }))).toBe(false);
  });
  it("recognizes explicit reply threads and previously handled triggers", () => {
    const reply = { ...message("Answer", { inReplyTo: "trigger" }), id: "reply", author: { id: SESSION_ISLA_ID, displayName: "Isla", type: "agent" } };
    expect(alreadyReplied("trigger", [reply])).toBe(true);
    expect(directlyAddressesIsla(message("More?", { inReplyTo: "reply" }), [reply])).toBe(true);
  });
  it("bounds input and excludes arbitrary metadata", () => {
    const result = safeContext(Array.from({ length: 50 }, () => message("a".repeat(4000), { secret: "never" })));
    expect(result).toHaveLength(35); expect(result[0].content).toHaveLength(3000);
    expect(result[0]).not.toHaveProperty("metadata");
  });
});
