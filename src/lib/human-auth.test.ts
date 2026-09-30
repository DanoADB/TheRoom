import { describe, expect, it } from "vitest";
import { hashHumanSecret, requireSameOrigin, secretsMatch } from "@/lib/human-auth";

describe("human authentication helpers", () => {
  it("matches the correct access code", () => {
    const hash = hashHumanSecret("a sufficiently long code");
    expect(secretsMatch("a sufficiently long code", hash)).toBe(true);
    expect(secretsMatch("the wrong code", hash)).toBe(false);
  });

  it("accepts Railway's public origin through forwarded headers", () => {
    const request = new Request("http://internal-service:8080/api/human/login", {
      headers: {
        origin: "https://theroom-production.example",
        host: "internal-service:8080",
        "x-forwarded-host": "theroom-production.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(() => requireSameOrigin(request)).not.toThrow();
  });

  it("still rejects a genuinely foreign origin", () => {
    const request = new Request("http://internal-service:8080/api/human/login", {
      headers: {
        origin: "https://attacker.example",
        "x-forwarded-host": "theroom-production.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(() => requireSameOrigin(request)).toThrow("Cross-origin requests are not allowed");
  });
});
