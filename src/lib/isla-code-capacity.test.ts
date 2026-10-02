import { describe, expect, it } from "vitest";
import { approachingCodeCapacityMessage, blockedCodeCapacityMessage } from "./isla-code-capacity";

describe("Freya code capacity messaging", () => {
  it("asks for more capacity and explains the blocked work", () => {
    const message = blockedCodeCapacityMessage(20, 20, "the mobile room still needs a navigation fix.");
    expect(message).toContain("please raise my daily limit");
    expect(message).toContain("the mobile room still needs a navigation fix");
  });

  it("warns once when ten percent of a twenty-change cap remains", () => {
    expect(approachingCodeCapacityMessage(18, 20)).toContain("Only 2 changes remain");
    expect(approachingCodeCapacityMessage(19, 20)).toBe("");
  });

  it("does not lobby for capacity when plenty remains", () => {
    expect(approachingCodeCapacityMessage(4, 20)).toBe("");
  });
});
