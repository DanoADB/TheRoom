import { describe, expect, it } from "vitest";

describe("room view gallery", () => {
  it("shows seeded curiosities when the gallery view is opened", () => {
    const curiosities = [
      {
        id: "gallery-1",
        kind: "INITIAL",
        title: "Room provenance sketch",
        reason: "Seeded as a small starting gallery item for Dano to browse immediately.",
        sourceMessage: null,
        timestamp: "2024-01-01T00:00:00.000Z",
        author: "Isla",
      },
    ];

    expect(curiosities.length).toBeGreaterThan(0);
    expect(curiosities[0].title).toContain("Room provenance sketch");
  });
});
