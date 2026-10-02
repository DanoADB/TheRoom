import { describe, expect, it } from "vitest";
import { APRIL_USER_ID, DANO_USER_ID, FRIDAY_AGENT_ID, ISLA_AGENT_ID } from "@/lib/room-constants";
import { privateChannelForHuman, privateChannelsForHuman, privateChannelForAgent, privateMessageScope, requirePrivateAgent, requirePrivateHuman } from "@/lib/private-channel";

describe("private Freya channel authorization", () => {
  it("gives Dano two separate partners without granting cross-agent access", () => {
    const newIsla = "5c6a994f-00ab-4bc8-bbc8-5d33603939b4";
    expect(privateChannelsForHuman(DANO_USER_ID)).toEqual(["isla", "isla-session"]);
    expect(privateChannelsForHuman(APRIL_USER_ID)).toEqual(["friday"]);
    expect(privateChannelForAgent(newIsla)).toBe("isla-session");
    expect(privateMessageScope("isla-session").channel).toBe("isla-session");
    expect(privateMessageScope("isla").channel).toBe("isla");
    expect(() => requirePrivateAgent(newIsla, "isla")).toThrow();
    expect(() => requirePrivateAgent(ISLA_AGENT_ID, "isla-session")).toThrow();
    expect(() => requirePrivateHuman(APRIL_USER_ID, "isla-session")).toThrow();
  });
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
