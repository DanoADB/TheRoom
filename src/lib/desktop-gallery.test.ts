import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.stubGlobal("React", React);
import { RoomView } from "@/app/room/room-view";

describe("desktop Gallery navigation", () => {
  it("exposes Gallery on desktop and does not force the transcript visible in gallery view", () => {
    const html = renderToStaticMarkup(React.createElement(RoomView, {
      room: { id: "room", name: "The Room" }, currentUser: { id: "dano", displayName: "Dano" },
      canOpenPrivate: true, participants: [], curiosities: [], initialMessages: [], initialSequence: 0, initialMobileView: "gallery",
    }));
    expect(html).toContain('href="/room?view=gallery" aria-current="page"');
    expect(html).toContain('class="block min-h-0 flex-1 overflow-y-auto" aria-label="Gallery of Curiosity"');
    expect(html).toContain('class="hidden relative min-h-0 flex-1"');
    expect(html).not.toContain('flex-1 overflow-y-auto lg:hidden');
  });
});
