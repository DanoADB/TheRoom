import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ human: vi.fn(), membership: vi.fn(), origin: vi.fn(), observation: vi.fn(), message: vi.fn(), upsert: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/human-auth", () => ({ requireHuman: m.human, requireHumanRoomMembership: m.membership, requireSameOrigin: m.origin }));
vi.mock("@/lib/prisma", () => ({ prisma: { roomCuriosity: { findFirst: m.observation }, message: { findFirst: m.message }, activityPriority: { upsert: m.upsert, deleteMany: m.remove } } }));
import { PUT } from "./route";
import { ApiError } from "@/lib/api-errors";
const roomId = "700a0000-0000-4000-8000-000000000001";
const id = "5c6a994f-00ab-4bc8-bbc8-5d33603939b4";
const request = (body: unknown) => new Request("https://room.test/api/human/activity/priority", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); m.human.mockResolvedValue({ id: "human" }); m.membership.mockResolvedValue({}); m.observation.mockResolvedValue({ id }); m.message.mockResolvedValue({ id }); });
describe("human activity priorities", () => {
  it("authenticates and raises idempotently without editing original records", async () => {
    expect((await PUT(request({ roomId, entryId: `observation:${id}`, raised: true }))).status).toBe(200);
    expect(m.origin).toHaveBeenCalled(); expect(m.membership).toHaveBeenCalledWith("human", roomId);
    expect(m.observation).toHaveBeenCalledWith({ where: { id, roomId } });
    expect(m.upsert.mock.calls[0][0].update).toEqual({});
    expect(m.upsert.mock.calls[0][0].create.raisedBy).toBe("human");
  });
  it("supports undo on public agent message entries", async () => {
    expect((await PUT(request({ roomId, entryId: `message:${id}`, raised: false }))).status).toBe(200);
    expect(m.message).toHaveBeenCalledWith({ where: { id, roomId, authorType: "AGENT" } });
    expect(m.remove).toHaveBeenCalledWith({ where: { roomId, entryId: `message:${id}` } });
  });
  it("rejects missing or cross-room entries", async () => {
    m.observation.mockResolvedValue(null);
    expect((await PUT(request({ roomId, entryId: `observation:${id}`, raised: true }))).status).toBe(404);
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated, nonmember and cross-origin requests", async () => {
    m.human.mockRejectedValueOnce(new ApiError(401, "human_unauthorized", "Sign in"));
    expect((await PUT(request({ roomId, entryId: `observation:${id}`, raised: true }))).status).toBe(401);
    m.membership.mockRejectedValueOnce(new ApiError(404, "room_not_found", "Not a member"));
    expect((await PUT(request({ roomId, entryId: `observation:${id}`, raised: true }))).status).toBe(404);
    m.origin.mockImplementationOnce(() => { throw new ApiError(403, "invalid_origin", "Cross origin"); });
    expect((await PUT(request({ roomId, entryId: `observation:${id}`, raised: true }))).status).toBe(403);
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("rejects malformed identifiers and additional payload fields", async () => {
    for (const entryId of ["observation:------------------------------------", `private:${id}`, `message:${id}:extra`]) expect((await PUT(request({ roomId, entryId, raised: true }))).status).toBe(400);
    expect((await PUT(request({ roomId, entryId: `observation:${id}`, raised: true, raisedBy: "agent" }))).status).toBe(400);
    expect(m.upsert).not.toHaveBeenCalled();
  });
});
