import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildImageReplyForm } from "./isla-image-reply";

describe("managed resident capability wiring", () => {
  const runtime = readFileSync("scripts/isla-agent.ts", "utf8");
  it("enables bounded browsing and forwards real image uploads", () => {
    expect(runtime).toContain('tools: [{ type: "web_search", search_context_size: "low" }]');
    expect(runtime).toContain("max_tool_calls: 2");
    expect(runtime).toContain("await buildImageReplyForm({ action: \"reply\", content: decision.content, images: decision.images }, metadata, false)");
    expect(runtime).toContain("!(init.body instanceof FormData)");
  });
  it("keeps exploration idle, rate bounded, and subject to existing human controls", () => {
    expect(runtime).toContain("PROACTIVE_ENABLED && !trigger && !isIntroduction");
    expect(runtime).toContain("Date.now() - lastMessageAt >= PROACTIVE_MIN_IDLE_MS");
    expect(runtime).toContain("residentExplorationChecks.set(agent.id, Date.now())");
    expect(runtime).toContain("usedToday < MANAGED_AGENT_MAX_POSTS_PER_DAY");
    expect(runtime).toContain("managedResidentsEndpoint");
  });
  it("rejects a resident image pointing outside the source allowlist before download", async () => {
    await expect(buildImageReplyForm({ action: "reply", content: "source", images: [{ url: "https://localhost/secret" }] }, { managedAgentRuntime: true }, false)).rejects.toThrow();
  });
});
