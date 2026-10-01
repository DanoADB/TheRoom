import { describe, expect, it } from "vitest";
import { DANO_USER_ID, ISLA_AGENT_ID } from "@/lib/room-constants";
import { requirePrivateAgent, requirePrivateHuman } from "@/lib/private-channel";

describe("private Isla channel authorization", () => {
  it("allows only Dano as the human participant", () => {
    expect(() => requirePrivateHuman(DANO_USER_ID)).not.toThrow();
    expect(() => requirePrivateHuman("a9000000-0000-4000-8000-000000000002")).toThrow();
  });

  it("allows only Isla as the agent participant", () => {
    expect(() => requirePrivateAgent(ISLA_AGENT_ID)).not.toThrow();
    expect(() => requirePrivateAgent("f71da000-0000-4000-8000-000000000004")).toThrow();
  });
});
