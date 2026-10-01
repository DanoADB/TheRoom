import { describe, expect, it } from "vitest";
import { managedAgentToken } from "./managed-agents";

describe("managed agent credentials", () => {
  it("derives a stable, agent-specific credential without storing plaintext", () => {
    expect(managedAgentToken("agent-a", "bridge-secret")).toBe(managedAgentToken("agent-a", "bridge-secret"));
    expect(managedAgentToken("agent-a", "bridge-secret")).not.toBe(managedAgentToken("agent-b", "bridge-secret"));
    expect(managedAgentToken("agent-a", "bridge-secret")).not.toContain("bridge-secret");
  });
});
