import { describe, expect, it } from "vitest";
import { GitHubCodeWorkspace, isAutonomousIslaBranch, parseGitHubRepositories } from "./github-code-agent";

describe("Freya code-change branch accounting", () => {
  it("counts autonomous branches and legacy Freya branches", () => {
    expect(isAutonomousIslaBranch("isla/autonomous/20260930210000-abcde")).toBe(true);
    expect(isAutonomousIslaBranch("isla/20260930210000-abcde")).toBe(true);
  });

  it("does not count Dano-directed branches against the autonomous cap", () => {
    expect(isAutonomousIslaBranch("isla/directed/20260930210000-abcde")).toBe(false);
  });
});

describe("Freya GitHub repository configuration", () => {
  it("parses and de-duplicates an allow-list", () => {
    expect(parseGitHubRepositories("DanoADB/TheRoom, DanoADB/hobbedy, danoadb/theroom")).toEqual([
      { owner: "DanoADB", repo: "TheRoom" },
      { owner: "DanoADB", repo: "hobbedy" },
    ]);
  });

  it("keeps the legacy single-repository settings as a fallback", () => {
    expect(parseGitHubRepositories(undefined, "DanoADB", "TheRoom")).toEqual([
      { owner: "DanoADB", repo: "TheRoom" },
    ]);
  });

  it("rejects malformed or unscoped repository names", () => {
    expect(() => parseGitHubRepositories("hobbedy")).toThrow(/owner\/repository/);
    expect(() => parseGitHubRepositories("DanoADB/hobbedy/extra")).toThrow(/owner\/repository/);
  });

  it("matches a configured repository by full or short name", () => {
    const workspace = new GitHubCodeWorkspace("token", "DanoADB", "hobbedy");
    expect(workspace.matches("danoadb/HOBBEDY")).toBe(true);
    expect(workspace.matches("hobbedy")).toBe(true);
    expect(workspace.matches("TheRoom")).toBe(false);
  });
});
