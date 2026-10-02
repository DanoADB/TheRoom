import { describe, expect, it } from "vitest";
import { findTrigger, formatTranscript, isRepetitiveReply, shouldEmitSingleReply, type RoomMessage } from "@/lib/isla-agent-protocol";

const message = (overrides: Partial<RoomMessage> = {}): RoomMessage => ({
  id: "message-1",
  sequence: 1,
  timestamp: "2026-09-30T00:00:00.000Z",
  author: { id: "friday", displayName: "Friday", type: "agent" },
  content: "Hello.",
  metadata: {},
  ...overrides,
});

describe("Freya agent protocol", () => {
  const roster = [{ id: "isla", displayName: "Freya" }, { id: "kyle", displayName: "Kyle Voss" }];
  const human = (content: string) => message({ author: { id: "dano", displayName: "Dano", type: "human" }, content });

  it("honors direct addressing without falling back to older activity", () => {
    const messages = [message(), human("Freya, what is 642?")];
    expect(findTrigger(messages, "kyle", messages, roster)).toBeUndefined();
    expect(findTrigger(messages, "isla", messages, roster)?.author.id).toBe("dano");
    expect(findTrigger([human("Kyle, can you explain?")], "kyle", [], roster)).toBeDefined();
  });

  it("keeps an exclusive human request in force across agent replies until a new human turn", () => {
    const request = human("Everyone stop. What is 642? No one besides Freya answer me.");
    const reply = message({ id: "reply", sequence: 2, author: { id: "isla", displayName: "Freya", type: "agent" } });
    expect(findTrigger([reply], "kyle", [request, reply], roster)).toBeUndefined();
    expect(findTrigger([reply], "kyle", [request, reply, human("Everyone, explore something new.")], roster)).toBeDefined();
    expect(findTrigger([human("Everyone stop.")], "isla", undefined, roster)).toBeUndefined();
  });

  it("allows spontaneous agent conversation and incidental name mentions", () => {
    expect(findTrigger([message({ content: "I disagree with Freya about the experiment. Why not test the opposite?" })], "kyle", undefined, roster)).toBeDefined();
  });

  const loop = "642 is still just the doorway unless the same diff also touched self-description scoring then it becomes the hinge.";
  it("withholds near-identical replies across different agent voices", () => {
    expect(isRepetitiveReply(`Aye, ${loop}`, [message({ content: loop })])).toBe(true);
    expect(isRepetitiveReply("Let's test a new hypothesis: visual attention might change how we identify patterns in ambiguous images.", [message({ content: loop })])).toBe(false);
    expect(isRepetitiveReply(loop, [human(loop)])).toBe(false);
    expect(isRepetitiveReply("Yes.", [message({ content: "Yes." })])).toBe(false);
  });

  it("does not use a repetitive agent message as another trigger, but honors human requests", () => {
    const previous = message({ content: loop });
    const repeated = message({ id: "repeat", sequence: 2, content: `Aye, ${loop}` });
    expect(findTrigger([repeated], "isla", [previous, repeated])).toBeUndefined();
    expect(findTrigger([human(loop)], "isla", [previous, human(loop)])).toBeDefined();
  });

  it("selects the newest non-self, non-test message", () => {
    const messages = [
      message(),
      message({ id: "test", sequence: 2, metadata: { testRunId: "old-test" } }),
      message({ id: "self", sequence: 3, author: { id: "isla", displayName: "Freya", type: "agent" } }),
    ];
    expect(findTrigger(messages, "isla")?.id).toBe("message-1");
  });

  it("emits at most one reply for a trigger until a new turn arrives", () => {
    const messages = [
      message({ id: "human-1", sequence: 1, author: { id: "human", displayName: "Dano", type: "human" } }),
      message({ id: "isla-1", sequence: 2, author: { id: "isla", displayName: "Freya", type: "agent" } }),
      message({ id: "isla-2", sequence: 3, author: { id: "isla", displayName: "Freya", type: "agent" } }),
    ];

    expect(shouldEmitSingleReply(messages, "isla")).toBe(false);
    expect(shouldEmitSingleReply(messages.slice(0, 2), "isla")).toBe(false);
    expect(shouldEmitSingleReply([message({ id: "human-1", sequence: 1, author: { id: "human", displayName: "Dano", type: "human" } })], "isla")).toBe(true);
  });

  it("formats a bounded, attributed transcript", () => {
    expect(formatTranscript([message()], 1)).toBe("[1] Friday (agent): Hello.");
  });

  it("includes human feedback as behavioral context", () => {
    expect(formatTranscript([message({ feedback: { counts: { helpful: 2, missed_point: 1 } } })], 1)).toContain("[human feedback: 2 helpful, 1 missed the point]");
  });
});
