import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), membership: vi.fn(), upsert: vi.fn(), update: vi.fn(), aggregate: vi.fn() }));
vi.mock("./agent-auth", () => ({ authenticateAgent: mocks.auth, requireAgentRoomMembership: mocks.membership }));
vi.mock("./prisma", () => ({ prisma: { privateChannelCursor: { upsert: mocks.upsert, updateMany: mocks.update }, privateMessage: { aggregate: mocks.aggregate } } }));
import { privateCursorHandlers } from "./private-cursor-api";
const handlers = privateCursorHandlers("isla-session");
const read = () => new Request("https://room.test/cursor");
const patch = (sequence: number) => new Request("https://room.test/cursor", { method: "PATCH", body: JSON.stringify({ lastSeenSequence: sequence }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: "5c6a994f-00ab-4bc8-bbc8-5d33603939b4" });
  mocks.membership.mockResolvedValue({});
  mocks.upsert.mockResolvedValue({ lastSeenSequence: 0 });
  mocks.aggregate.mockResolvedValue({ _max: { sequence: 20 } });
  mocks.update.mockResolvedValue({ count: 1 });
});
describe("durable private cursor", () => {
  it("starts at zero and is scoped to this agent and channel", async () => {
    expect(await (await handlers.GET(read())).json()).toEqual({ lastSeenSequence: 0 });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { agentId: "5c6a994f-00ab-4bc8-bbc8-5d33603939b4", channel: "isla-session" } }));
  });
  it("rejects another agent before reading private state", async () => {
    mocks.auth.mockResolvedValue({ id: "151a0000-0000-4000-8000-000000000003" });
    expect((await handlers.GET(read())).status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rejects cursors ahead of the channel and regressions", async () => {
    expect((await handlers.PATCH(patch(21))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.update.mockResolvedValue({ count: 0 });
    expect((await handlers.PATCH(patch(12))).status).toBe(409);
  });
  it("advances monotonically through the processed private sequence", async () => {
    expect((await handlers.PATCH(patch(12))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ channel: "isla-session", lastSeenSequence: { lte: 12 } }), data: { lastSeenSequence: 12 } }));
  });
});
