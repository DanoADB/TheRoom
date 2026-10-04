import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), membership: vi.fn(), find: vi.fn(), update: vi.fn(), lock: vi.fn() }));
vi.mock("@/lib/agent-auth", () => ({ authenticateAgent: mocks.auth, requireAgentRoomMembership: mocks.membership }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({ $queryRaw: mocks.lock, roomCuriosity: { findFirst: mocks.find, update: mocks.update } }) } }));
import { PATCH } from "@/app/api/agents/experiments/route";
const roomId = "700a0000-0000-4000-8000-000000000001";
const request = () => new Request("https://room.test/api/agents/experiments", { method: "PATCH", body: JSON.stringify({ roomId, id: roomId, status: "INCONCLUSIVE", evidence: "Not enough observations", outcome: "No conclusion justified", nextQuestion: "How many repetitions are needed?" }) });
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ id: "isla" }); mocks.membership.mockResolvedValue({}); });
describe("experiment ownership and retained history", () => {
  it("cannot update someone else's experiment", async () => {
    mocks.find.mockResolvedValue(null);
    expect((await PATCH(request())).status).toBe(404);
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ agentId: "isla", roomId }) }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("appends evidence without erasing the initial prediction", async () => {
    mocks.find.mockResolvedValue({ id: roomId, sourceMessage: "Original prediction" });
    expect((await PATCH(request())).status).toBe(200);
    expect(mocks.lock).toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { sourceMessage: expect.stringContaining("Original prediction\n\n--- Update") } }));
  });
  it("refuses to silently truncate a full record", async () => {
    mocks.find.mockResolvedValue({ id: roomId, sourceMessage: "x".repeat(8000) });
    expect((await PATCH(request())).status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
