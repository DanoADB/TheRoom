import { describe, expect, it } from "vitest";
import { buildRoomGallery } from "./room-gallery";

describe("room gallery", () => {
  it("includes approved agent gallery records when room curiosities are empty", () => {
    const gallery = buildRoomGallery([], [{
      id: "gallery-1",
      kind: "INITIAL",
      title: "Room provenance sketch",
      provenance: "Seeded for the room.",
      imageUrl: null,
      priority: "GALLERY_WORTHY",
      createdAt: new Date("2026-09-30T20:00:00.000Z"),
      agentId: "agent-isla",
      author: "Isla",
    }]);

    expect(gallery).toEqual([{
      priority: "gallery-worthy",
      label: "Gallery-worthy",
      description: "Keep visible, legible, and easy to browse first.",
      items: [{
        id: "gallery-1",
        kind: "INITIAL",
        title: "Room provenance sketch",
        reason: "Seeded for the room.",
        sourceMessage: null,
        timestamp: "2026-09-30T20:00:00.000Z",
        agentId: "agent-isla",
        author: "Isla",
        priority: "gallery-worthy",
      }],
    }, {
      priority: "needs-implementation",
      label: "Needs implementation",
      description: "Promising ideas that should become concrete work.",
      items: [],
    }, {
      priority: "interesting-but-not-yet-worth-changing",
      label: "Interesting, but not yet worth changing",
      description: "Worth remembering without reshaping the room yet.",
      items: [],
    }]);
  });

  it("merges both gallery sources in priority and newest-first order", () => {
    const gallery = buildRoomGallery([{
      id: "curiosity-1",
      kind: "QUESTION",
      title: "Older question",
      reason: null,
      sourceMessage: null,
      priority: "NEEDS_IMPLEMENTATION",
      createdAt: new Date("2026-09-30T19:00:00.000Z"),
      agent: { id: "agent-isla", displayName: "Isla" },
    }], [{
      id: "gallery-1",
      kind: "INTERNET_IMAGE",
      title: "Newer object",
      provenance: "Collected by Isla.",
      imageUrl: "https://example.com/object.jpg",
      priority: "GALLERY_WORTHY",
      createdAt: new Date("2026-09-30T20:00:00.000Z"),
      agentId: "agent-isla",
      author: "Isla",
    }]);

    expect(gallery[0].items.map((item) => item.id)).toEqual(["gallery-1"]);
    expect(gallery[1].items.map((item) => item.id)).toEqual(["curiosity-1"]);
  });

  it("projects every agent's current interests into filterable gallery records", () => {
    const gallery = buildRoomGallery([], [], [{
      agentId: "agent-friday",
      author: "Friday",
      updatedAt: new Date("2026-09-30T21:00:00.000Z"),
      interests: [{ topic: "ritual interfaces", why: "Small repeated gestures can become a shared language.", nextQuestion: "When does ritual become friction?", origin: "wildcard", strength: 3 }],
    }]);
    expect(gallery[0].items[0]).toMatchObject({ agentId: "agent-friday", author: "Friday", kind: "CURRENT INTEREST", title: "ritual interfaces" });
    expect(gallery[0].items[0].sourceMessage).toContain("When does ritual become friction?");
  });
});
