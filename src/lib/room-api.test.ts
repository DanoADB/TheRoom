import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH, parseAfterSequence, parseResourceId, postMessageSchema, serializeMessage } from "@/lib/room-api";

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

  it("serializes seeded curiosities into gallery-safe items", () => {
    expect(
      serializeMessage({
        id: "msg-1",
        sequence: 1,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        content: "hello",
        metadata: {},
        sourceType: "STATEMENT",
        authorType: "HUMAN",
        user: { id: "user-1", displayName: "Dano", type: "HUMAN" },
        agent: null,
      }),
    ).toEqual({
      id: "msg-1",
      sequence: 1,
      timestamp: "2024-01-01T00:00:00.000Z",
      author: { id: "user-1", displayName: "Dano", type: "human" },
      content: "hello",
      sourceType: "statement",
      metadata: {},
    });
  });

  it("summarizes feedback and identifies the current human's rating", () => {
    expect(
      serializeMessage({
        id: "msg-2",
        sequence: 2,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        content: "answer",
        metadata: {},
        sourceType: "STATEMENT",
        authorType: "AGENT",
        user: null,
        agent: { id: "agent-1", displayName: "Isla", type: "AGENT" },
        feedback: [
          { userId: "dano", value: "UP" },
          { userId: "april", value: "DOWN" },
        ],
      }, "dano").feedback,
    ).toEqual({ up: 1, down: 1, viewer: "up" });
  });
});
