import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-errors";
import { APRIL_USER_ID, DANO_USER_ID, FRIDAY_AGENT_ID, ISLA_AGENT_ID } from "./room-constants";
import { privateMessageScope } from "./private-channel";
const mocks = vi.hoisted(() => ({ human: vi.fn(), origin: vi.fn(), agent: vi.fn(), agentMembership: vi.fn(), member: vi.fn(), find: vi.fn(), aggregate: vi.fn(), count: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/human-auth", () => ({ requireHuman: mocks.human, requireSameOrigin: mocks.origin }));
vi.mock("@/lib/agent-auth", () => ({ authenticateAgent: mocks.agent, requireAgentRoomMembership: mocks.agentMembership }));
vi.mock("@/lib/prisma", () => ({ prisma: { roomMembership: { findUnique: mocks.member }, privateMessage: { findMany: mocks.find, aggregate: mocks.aggregate, count: mocks.count, create: mocks.create } } }));
import { GET as humanFriday, POST as postHumanFriday } from "@/app/api/human/friday/private/messages/route";
import { GET as agentFriday, POST as postAgentFriday } from "@/app/api/agents/friday/private/messages/route";
import { GET as humanIsla } from "@/app/api/human/isla/private/messages/route";
import { GET as agentIsla } from "@/app/api/agents/isla/private/messages/route";
const get = () => new Request("https://room.test/private?after=12");
const post = () => new Request("https://room.test/private", { method: "POST", body: JSON.stringify({ content: "Hello privately", metadata: {} }) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.human.mockResolvedValue({ id: APRIL_USER_ID }); mocks.agent.mockResolvedValue({ id: FRIDAY_AGENT_ID });
  mocks.member.mockResolvedValue({}); mocks.agentMembership.mockResolvedValue({}); mocks.find.mockResolvedValue([]);
  mocks.aggregate.mockResolvedValue({ _max: { sequence: 0 } }); mocks.count.mockResolvedValue(0);
  mocks.create.mockImplementation(async ({ data }) => ({ ...data, id: "message", sequence: 20, createdAt: new Date(), user: data.userId ? { id: data.userId, displayName: "April", type: "HUMAN" } : null, agent: data.agentId ? { id: data.agentId, displayName: "Friday", type: "AGENT" } : null }));
});
describe("private channel endpoint isolation", () => {
  it("April and Friday read only their pair, including the sequence aggregate", async () => {
    for (const read of [humanFriday, agentFriday]) {
      const response = await read(get()); expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(mocks.find).toHaveBeenLastCalledWith(expect.objectContaining({ where: { ...privateMessageScope("friday"), sequence: { gt: 12 } } }));
      expect(mocks.aggregate).toHaveBeenLastCalledWith({ where: privateMessageScope("friday"), _max: { sequence: true } });
    }
  });
  it("keeps existing Dano and Isla history scoped to their pair", async () => {
    mocks.human.mockResolvedValue({ id: DANO_USER_ID }); mocks.agent.mockResolvedValue({ id: ISLA_AGENT_ID });
    for (const read of [humanIsla, agentIsla]) {
      expect((await read(get())).status).toBe(200);
      expect(mocks.aggregate).toHaveBeenLastCalledWith({ where: privateMessageScope("isla"), _max: { sequence: true } });
    }
  });
  it("denies cross-channel reads before touching private data", async () => {
    expect((await humanIsla(get())).status).toBe(404); expect((await agentIsla(get())).status).toBe(404);
    mocks.human.mockResolvedValue({ id: DANO_USER_ID }); mocks.agent.mockResolvedValue({ id: ISLA_AGENT_ID });
    expect((await humanFriday(get())).status).toBe(404); expect((await agentFriday(get())).status).toBe(404);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("writes April and Friday only into the private store with server-determined authorship", async () => {
    expect((await postHumanFriday(post())).status).toBe(201);
    expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: APRIL_USER_ID, authorType: "HUMAN" }) }));
    expect((await postAgentFriday(post())).status).toBe(201);
    expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ agentId: FRIDAY_AGENT_ID, authorType: "AGENT" }) }));
  });
  it("denies cross-channel writes and missing membership", async () => {
    mocks.human.mockResolvedValue({ id: DANO_USER_ID }); mocks.agent.mockResolvedValue({ id: ISLA_AGENT_ID });
    expect((await postHumanFriday(post())).status).toBe(404); expect((await postAgentFriday(post())).status).toBe(404);
    mocks.human.mockResolvedValue({ id: APRIL_USER_ID }); mocks.member.mockResolvedValue(null);
    expect((await humanFriday(get())).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("retains same-origin protection and rate limiting", async () => {
    mocks.origin.mockImplementationOnce(() => { throw new ApiError(403, "cross_origin", "No"); });
    expect((await postHumanFriday(post())).status).toBe(403);
    mocks.count.mockResolvedValue(30);
    expect((await postAgentFriday(post())).status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
