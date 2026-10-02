import { beforeEach, expect, it, vi } from "vitest";
import { DANO_USER_ID, ISLA_AGENT_ID } from "./room-constants";
const mocks = vi.hoisted(() => ({ human: vi.fn(), origin: vi.fn(), member: vi.fn(), agent: vi.fn(), agentMember: vi.fn(), room: vi.fn(), find: vi.fn(), update: vi.fn(), request: vi.fn() }));
vi.mock("@/lib/human-auth", () => ({ requireHuman: mocks.human, requireSameOrigin: mocks.origin, requireHumanRoomMembership: mocks.member }));
vi.mock("@/lib/agent-auth", () => ({ authenticateAgent: mocks.agent, requireAgentRoomMembership: mocks.agentMember }));
vi.mock("@/lib/prisma", () => {
  const tx = { room: { update: mocks.room }, roomMembership: { findUnique: mocks.find }, agent: { update: mocks.update, updateMany: mocks.request } };
  return { prisma: { ...tx, $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } };
});
import { PATCH } from "@/app/api/human/study/route";
import { POST } from "@/app/api/agents/study/route";
beforeEach(() => { vi.resetAllMocks(); mocks.human.mockResolvedValue({ id: DANO_USER_ID }); mocks.agent.mockResolvedValue({ id: ISLA_AGENT_ID }); mocks.find.mockResolvedValue({}); mocks.request.mockResolvedValue({ count: 1 }); });
const change = () => new Request("https://room.test/api/human/study", { method: "PATCH", body: JSON.stringify({ agentId: ISLA_AGENT_ID, inStudy: true }) });
it("moves without deactivating or deleting the agent and clears old requests", async () => {
  expect((await PATCH(change())).status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: ISLA_AGENT_ID }, data: { inStudy: true, returnRequest: null } });
  expect(mocks.room).toHaveBeenCalled();
});
it("denies other humans and nonmembers", async () => {
  mocks.human.mockResolvedValueOnce({ id: "outsider" }); expect((await PATCH(change())).status).toBe(403);
  mocks.find.mockResolvedValue(null); expect((await PATCH(change())).status).toBe(404);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("agents can request return only for themselves, not restore public posting", async () => {
  const response = await POST(new Request("https://room.test/api/agents/study", { method: "POST", body: JSON.stringify({ reason: "A new finding", agentId: "someone-else", inStudy: false }) }));
  expect(response.status).toBe(200);
  expect(mocks.request).toHaveBeenCalledWith({ where: { id: ISLA_AGENT_ID, inStudy: true }, data: { returnRequest: "A new finding" } });
  expect(mocks.update).not.toHaveBeenCalled();
});
