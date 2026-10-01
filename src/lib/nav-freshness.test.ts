import { describe, expect, it } from "vitest";
import { hasNewNavItems } from "./nav-freshness";

describe("navigation freshness", () => {
  it("does not flag existing content on first visit or after it has been seen", () => {
    const current = { updatedAt: "2026-10-01T12:00:00.000Z", count: 8 };
    expect(hasNewNavItems(current, null)).toBe(false);
    expect(hasNewNavItems(current, current)).toBe(false);
  });

  it("flags items created after the last visit", () => {
    expect(hasNewNavItems(
      { updatedAt: "2026-10-01T12:01:00.000Z", count: 9 },
      { updatedAt: "2026-10-01T12:00:00.000Z", count: 8 },
    )).toBe(true);
  });

  it("detects another item created in the same timestamp interval", () => {
    expect(hasNewNavItems(
      { updatedAt: "2026-10-01T12:00:00.000Z", count: 9 },
      { updatedAt: "2026-10-01T12:00:00.000Z", count: 8 },
    )).toBe(true);
  });

  it("does not treat an older or removed item as new", () => {
    expect(hasNewNavItems(
      { updatedAt: "2026-10-01T11:59:00.000Z", count: 7 },
      { updatedAt: "2026-10-01T12:00:00.000Z", count: 8 },
    )).toBe(false);
  });
});
