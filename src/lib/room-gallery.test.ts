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
      agent: { displayName: "Isla" },
    }], [{
      id: "gallery-1",
      kind: "INTERNET_IMAGE",
      title: "Newer object",
      provenance: "Collected by Isla.",
      imageUrl: "https://example.com/object.jpg",
      priority: "GALLERY_WORTHY",
      createdAt: new Date("2026-09-30T20:00:00.000Z"),
      author: "Isla",
    }]);

    expect(gallery[0].items.map((item) => item.id)).toEqual(["gallery-1"]);
    expect(gallery[1].items.map((item) => item.id)).toEqual(["curiosity-1"]);
  });
});
