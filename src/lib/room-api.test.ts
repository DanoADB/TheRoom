import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH, parseAfterSequence, parseResourceId, postMessageSchema } from "@/lib/room-api";

describe("room API validation", () => {
  it("accepts an omitted or non-negative after sequence", () => {
    expect(parseAfterSequence(null)).toBe(0);
    expect(parseAfterSequence("0")).toBe(0);
    expect(parseAfterSequence("42")).toBe(42);
  });

  it("rejects malformed after sequences", () => {
    for (const value of ["-1", "1.5", "hello"]) {
      expect(() => parseAfterSequence(value)).toThrow();
    }
  });

  it("validates resource UUIDs before querying Prisma", () => {
    expect(parseResourceId("700a0000-0000-4000-8000-000000000001", "room")).toBe("700a0000-0000-4000-8000-000000000001");
    expect(() => parseResourceId("not-a-uuid", "agent")).toThrow();
  });

  it("accepts content and defaults metadata", () => {
    expect(postMessageSchema.parse({ content: " Hello. " })).toEqual({ content: "Hello.", metadata: {} });
  });

  it("rejects empty, oversized, and impersonation fields", () => {
    expect(() => postMessageSchema.parse({ content: "   " })).toThrow();
    expect(() => postMessageSchema.parse({ content: "x".repeat(MAX_MESSAGE_LENGTH + 1) })).toThrow();
    expect(() => postMessageSchema.parse({ content: "Hello", authorId: "someone-else" })).toThrow();
  });
});
