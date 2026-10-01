import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH, messageFeedbackSchema, parseAfterSequence, parseResourceId, postMessageFormSchema, postMessageSchema, serializeMessage } from "@/lib/room-api";

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

  it("accepts an empty text field for image-only multipart replies", () => {
    expect(postMessageFormSchema.parse({ content: "", metadata: {} })).toEqual({ content: "", metadata: {} });
    expect(() => postMessageFormSchema.parse({ content: "x".repeat(MAX_MESSAGE_LENGTH + 1) })).toThrow();
  });

  it("accepts specific message-level reaction signals", () => {
    expect(messageFeedbackSchema.parse({ value: "push_back_more" })).toEqual({ value: "push_back_more" });
    expect(() => messageFeedbackSchema.parse({ value: "up" })).toThrow();
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
      attachments: [],
    });
  });

  it("serializes image attachments without exposing stored bytes", () => {
    const message = serializeMessage({
      id: "msg-3",
      sequence: 3,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      content: "look at this",
      metadata: {},
      sourceType: "STATEMENT",
      authorType: "HUMAN",
      user: { id: "user-1", displayName: "Dano", type: "HUMAN" },
      agent: null,
      attachments: [{ id: "image-1", fileName: "potato.png", mimeType: "image/png", byteSize: 42, sortOrder: 0 }],
    });

    expect(message.attachments).toEqual([{
      id: "image-1",
      fileName: "potato.png",
      mimeType: "image/png",
      byteSize: 42,
      url: "/api/messages/msg-3/attachments/image-1",
    }]);
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
          { userId: "dano", value: "HELPFUL" },
          { userId: "april", value: "MISSED_POINT" },
        ],
      }, "dano").feedback,
    ).toEqual({ counts: { helpful: 1, missed_point: 1 }, viewer: "helpful" });
  });
});
