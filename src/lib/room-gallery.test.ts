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
      createdAt: new Date("2026-09-30T20:00:00.000Z"),
      author: "Isla",
    }]);

    expect(gallery).toEqual([{
      id: "gallery-1",
      kind: "INITIAL",
      title: "Room provenance sketch",
      reason: "Seeded for the room.",
      sourceMessage: null,
      timestamp: "2026-09-30T20:00:00.000Z",
      author: "Isla",
    }]);
  });

  it("merges both gallery sources in newest-first order", () => {
    const gallery = buildRoomGallery([{
      id: "curiosity-1",
      kind: "QUESTION",
      title: "Older question",
      reason: null,
      sourceMessage: null,
      createdAt: new Date("2026-09-30T19:00:00.000Z"),
      agent: { displayName: "Isla" },
    }], [{
      id: "gallery-1",
      kind: "INTERNET_IMAGE",
      title: "Newer object",
      provenance: "Collected by Isla.",
      imageUrl: "https://example.com/object.jpg",
      createdAt: new Date("2026-09-30T20:00:00.000Z"),
      author: "Isla",
    }]);

    expect(gallery.map((item) => item.id)).toEqual(["gallery-1", "curiosity-1"]);
  });
});
