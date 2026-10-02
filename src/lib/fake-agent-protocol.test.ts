import { describe, expect, it } from "vitest";
import {
  belongsToRun,
  buildDeterministicResponse,
  shouldRespond,
  type TransportMessage,
} from "@/lib/fake-agent-protocol";

const message: TransportMessage = {
  sequence: 7,
  author: { displayName: "Friday", type: "agent" },
  content: "Test",
  metadata: { testRunId: "run-1" },
};

describe("fake agent protocol", () => {
  it("isolates messages by test run", () => {
    expect(belongsToRun(message, "run-1")).toBe(true);
    expect(belongsToRun(message, "run-2")).toBe(false);
  });

  it("only responds to the configured peer in the same run", () => {
    expect(shouldRespond(message, "Friday", "run-1")).toBe(true);
    expect(shouldRespond(message, "Freya", "run-1")).toBe(false);
    expect(shouldRespond({ ...message, author: { displayName: "Friday", type: "human" } }, "Friday", "run-1")).toBe(false);
  });

  it("produces deterministic, inspectable output", () => {
    expect(buildDeterministicResponse("Freya", 3, message)).toBe(
      "Freya transport turn 3: acknowledged Friday at sequence 7.",
    );
  });
});
