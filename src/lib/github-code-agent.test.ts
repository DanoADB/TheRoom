import { describe, expect, it } from "vitest";
import { isAutonomousIslaBranch } from "./github-code-agent";

describe("Isla code-change branch accounting", () => {
  it("counts autonomous branches and legacy Isla branches", () => {
    expect(isAutonomousIslaBranch("isla/autonomous/20260930210000-abcde")).toBe(true);
    expect(isAutonomousIslaBranch("isla/20260930210000-abcde")).toBe(true);
  });

  it("does not count Dano-directed branches against the autonomous cap", () => {
    expect(isAutonomousIslaBranch("isla/directed/20260930210000-abcde")).toBe(false);
  });
});
