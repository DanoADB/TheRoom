import { describe, expect, it } from "vitest";
import { hashHumanSecret, secretsMatch } from "@/lib/human-auth";

describe("human authentication helpers", () => {
  it("matches the correct access code", () => {
    const hash = hashHumanSecret("a sufficiently long code");
    expect(secretsMatch("a sufficiently long code", hash)).toBe(true);
    expect(secretsMatch("the wrong code", hash)).toBe(false);
  });
});
