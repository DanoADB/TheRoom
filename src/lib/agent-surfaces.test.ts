import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-errors";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(), membership: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), messages: vi.fn(), members: vi.fn(), priorities: vi.fn(),
}));
vi.mock("@/lib/agent-auth", () => ({ authenticateAgent: mocks.authenticate, requireAgentRoomMembership: mocks.membership }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  roomCuriosity: { findMany: mocks.find, create: mocks.create, updateMany: mocks.update },
  message: { findMany: mocks.messages }, roomMembership: { findMany: mocks.members },
  activityPriority: { findMany: mocks.priorities },
} }));
import { GET as activity, POST, PATCH } from "@/app/api/agents/activity/route";
import { GET as gallery } from "@/app/api/agents/gallery/route";

const roomId = "700a0000-0000-4000-8000-000000000001";
const fridayId = "f71da000-0000-4000-8000-000000000004";
const entryId = "700a0000-0000-4000-8000-000000000002";
const request = (body: unknown, method = "POST") => new Request("https://room.test/api/agents/activity", { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const entry = { id: entryId, roomId, agentId: fridayId, kind: "RESEARCH", title: "A discovery", reason: "A new question", sourceMessage: "Evidence and findings", priority: "GALLERY_WORTHY", createdAt: new Date(), agent: { id: fridayId, displayName: "Friday" } };

beforeEach(() => {
  vi.resetAllMocks(); mocks.authenticate.mockResolvedValue({ id: fridayId }); mocks.membership.mockResolvedValue({});
  mocks.find.mockResolvedValue([entry]); mocks.messages.mockResolvedValue([]); mocks.members.mockResolvedValue([]);
  mocks.create.mockResolvedValue({ id: entryId, createdAt: new Date() }); mocks.update.mockResolvedValue({ count: 1 });
  mocks.priorities.mockResolvedValue([]);
});

describe("agent Activity and Gallery access", () => {
  it("delivers human-raised records separately with human provenance", async () => {
    mocks.priorities.mockResolvedValue([{ entryId: `observation:${entryId}`, raisedBy: "human", raisedAt: new Date("2026-10-05T21:00:00Z") }]);
    const response = await activity(new Request(`https://room.test/api/agents/activity?roomId=${roomId}`));
    expect((await response.json()).humanPriorities[0]).toMatchObject({ entryId: `observation:${entryId}`, raisedBy: "human", author: "Friday", body: "Evidence and findings" });
  });
  it("lets Friday read shared activity and marks her observations editable", async () => {
    const response = await activity(new Request(`https://room.test/api/agents/activity?roomId=${roomId}`));
    expect(response.status).toBe(200);
    expect((await response.json()).activity[0]).toMatchObject({ agent: { id: fridayId }, editable: true });
    expect(mocks.membership).toHaveBeenCalledWith(fridayId, roomId);
  });
  it("lets Friday read the same Gallery buckets as the human view", async () => {
    const response = await gallery(new Request(`https://room.test/api/agents/gallery?roomId=${roomId}`));
    expect(response.status).toBe(200);
    expect((await response.json()).buckets[0].items[0]).toMatchObject({ id: entryId, author: "Friday", editable: true });
  });
  it("attributes writes to the authenticated Friday, not a caller-supplied author", async () => {
    const response = await POST(request({ roomId, kind: "RESEARCH", title: "Friday research", reason: "A real discovery", body: "Full research entry", priority: "GALLERY_WORTHY" }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ agentId: fridayId, roomId, priority: "GALLERY_WORTHY" }) }));
    expect((await POST(request({ roomId, agentId: "someone-else", kind: "RESEARCH", title: "Test", reason: "Test reason", body: "Test body" }))).status).toBe(400);
  });
  it("only updates entries owned by Friday in the requested room", async () => {
    expect((await PATCH(request({ roomId, id: entryId, body: "Updated findings" }, "PATCH"))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: entryId, roomId, agentId: fridayId }, data: { sourceMessage: "Updated findings" } });
    mocks.update.mockResolvedValue({ count: 0 });
    expect((await PATCH(request({ roomId, id: entryId, title: "Another agent's entry" }, "PATCH"))).status).toBe(404);
  });
  it("rejects unauthenticated and non-member readers before fetching data", async () => {
    mocks.authenticate.mockRejectedValue(new ApiError(401, "unauthorized", "No token"));
    expect((await gallery(new Request(`https://room.test/api/agents/gallery?roomId=${roomId}`))).status).toBe(401);
    mocks.authenticate.mockResolvedValue({ id: fridayId });
    mocks.membership.mockRejectedValue(new ApiError(404, "room_not_found", "No membership"));
    expect((await activity(new Request(`https://room.test/api/agents/activity?roomId=${roomId}`))).status).toBe(404);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("rejects non-member writes and empty updates", async () => {
    expect((await PATCH(request({ roomId, id: entryId }, "PATCH"))).status).toBe(400);
    mocks.membership.mockRejectedValue(new ApiError(404, "room_not_found", "No membership"));
    expect((await POST(request({ roomId, kind: "RESEARCH", title: "Test", reason: "Test reason", body: "Test body" }))).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
