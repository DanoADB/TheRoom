import { describe, expect, it } from "vitest";
import { findTrigger, formatTranscript, type RoomMessage } from "@/lib/isla-agent-protocol";

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

  it("formats a bounded, attributed transcript", () => {
    expect(formatTranscript([message()], 1)).toBe("[1] Friday (agent): Hello.");
  });

  it("includes human feedback as behavioral context", () => {
    expect(formatTranscript([message({ feedback: { counts: { helpful: 2, missed_point: 1 } } })], 1)).toContain("[human feedback: 2 helpful, 1 missed the point]");
  });
});
