import { describe, expect, it } from "vitest";
import { hashAgentToken, readBearerToken } from "@/lib/agent-auth";

describe("agent authentication helpers", () => {
  it("reads a case-insensitive Bearer token", () => {
    expect(readBearerToken("bearer room_secret")).toBe("room_secret");
  });

  it("rejects missing and malformed authorization", () => {
    expect(readBearerToken(null)).toBeNull();
    expect(readBearerToken("Basic abc")).toBeNull();
    expect(readBearerToken("Bearer two tokens")).toBeNull();
  });

  it("hashes tokens deterministically without retaining plaintext", () => {
    expect(hashAgentToken("room_secret")).toBe(hashAgentToken("room_secret"));
    expect(hashAgentToken("room_secret")).not.toContain("room_secret");
    expect(hashAgentToken("room_secret")).toHaveLength(64);
  });
});
