import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomView } from "./room-view";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("room gallery rendering", () => {
  it("shows seeded gallery items in the Gallery of Curiosity UI", () => {
    vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("Jan 1, 12:00 AM");

    const markup = renderToStaticMarkup(
      <RoomView
        room={{ id: "room-1", name: "Isla + Friday" }}
        currentUser={{ id: "user-1", displayName: "Dano" }}
        participants={[]}
        curiosities={[]}
        galleryItems={[
          {
            id: "gallery-1",
            kind: "INITIAL",
            title: "Room provenance sketch",
            provenance: "Seeded as a small starting gallery item for Dano to browse immediately.",
            imageUrl: null,
            visualMeta: {},
            steerAway: false,
            timestamp: "2024-01-01T00:00:00.000Z",
            author: "Isla",
          },
        ]}
        initialMessages={[]}
        initialSequence={0}
      />,
    );

    expect(markup).toContain("Gallery of Curiosity");
    expect(markup).toContain("Room provenance sketch");
    expect(markup).toContain("Seeded as a small starting gallery item for Dano to browse immediately.");
  });
});
