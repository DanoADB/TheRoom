import { describe, expect, it } from "vitest";
import { APRIL_USER_ID, DANO_USER_ID, FRIDAY_AGENT_ID, ISLA_AGENT_ID } from "@/lib/room-constants";
import { privateChannelForHuman, requirePrivateAgent, requirePrivateHuman } from "@/lib/private-channel";

describe("private Freya channel authorization", () => {
  it("pairs April with Friday without granting access to Dano or Freya", () => {
    expect(privateChannelForHuman(APRIL_USER_ID)).toBe("friday");
    expect(privateChannelForHuman(DANO_USER_ID)).toBe("isla");
    expect(privateChannelForHuman("another-human")).toBeNull();
    expect(() => requirePrivateHuman(APRIL_USER_ID, "friday")).not.toThrow();
    expect(() => requirePrivateAgent(FRIDAY_AGENT_ID, "friday")).not.toThrow();
    expect(() => requirePrivateHuman(DANO_USER_ID, "friday")).toThrow();
    expect(() => requirePrivateAgent(ISLA_AGENT_ID, "friday")).toThrow();
  });
  it("allows only Dano as the human participant", () => {
    expect(() => requirePrivateHuman(DANO_USER_ID)).not.toThrow();
    expect(() => requirePrivateHuman("a9000000-0000-4000-8000-000000000002")).toThrow();
  });

  it("allows only Freya as the agent participant", () => {
    expect(() => requirePrivateAgent(ISLA_AGENT_ID)).not.toThrow();
    expect(() => requirePrivateAgent("f71da000-0000-4000-8000-000000000004")).toThrow();
  });
});
