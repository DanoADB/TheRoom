import { describe, expect, it } from "vitest";
import { findTrigger, formatTranscript, shouldEmitSingleReply, type RoomMessage } from "@/lib/isla-agent-protocol";

const message = (overrides: Partial<RoomMessage> = {}): RoomMessage => ({
  id: "message-1",
  sequence: 1,
  timestamp: "2026-09-30T00:00:00.000Z",
  author: { id: "friday", displayName: "Friday", type: "agent" },
  content: "Hello.",
  metadata: {},
  ...overrides,
});

describe("Isla agent protocol", () => {
  it("selects the newest non-self, non-test message", () => {
    const messages = [
      message(),
      message({ id: "test", sequence: 2, metadata: { testRunId: "old-test" } }),
      message({ id: "self", sequence: 3, author: { id: "isla", displayName: "Isla", type: "agent" } }),
    ];
    expect(findTrigger(messages, "isla")?.id).toBe("message-1");
  });

  it("emits at most one reply for a trigger until a new turn arrives", () => {
    const messages = [
      message({ id: "human-1", sequence: 1, author: { id: "human", displayName: "Dano", type: "human" } }),
      message({ id: "isla-1", sequence: 2, author: { id: "isla", displayName: "Isla", type: "agent" } }),
      message({ id: "isla-2", sequence: 3, author: { id: "isla", displayName: "Isla", type: "agent" } }),
    ];

    expect(shouldEmitSingleReply(messages, "isla")).toBe(false);
    expect(shouldEmitSingleReply(messages.slice(0, 2), "isla")).toBe(false);
    expect(shouldEmitSingleReply([message({ id: "human-1", sequence: 1, author: { id: "human", displayName: "Dano", type: "human" } })], "isla")).toBe(true);
  });

  it("formats a bounded, attributed transcript", () => {
    expect(formatTranscript([message()], 1)).toBe("[1] Friday (agent): Hello.");
  });

  it("includes human feedback as behavioral context", () => {
    expect(formatTranscript([message({ feedback: { up: 2, down: 1 } })], 1)).toContain("[human feedback: 2 up, 1 down]");
  });
});
