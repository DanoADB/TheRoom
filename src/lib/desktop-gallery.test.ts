import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.stubGlobal("React", React);
import { RoomView } from "@/app/room/room-view";
import { PrivateIslaView } from "@/app/private/private-isla-view";
import { APRIL_USER_ID } from "./room-constants";

describe("desktop Gallery navigation", () => {
  it("shows April's private partner and input as Friday", () => {
    const html = renderToStaticMarkup(React.createElement(PrivateIslaView, { initialMessages: [], viewerId: APRIL_USER_ID, channel: "friday", partnerName: "Friday", humanName: "April" }));
    expect(html).toContain("Private with Friday");
    expect(html).toContain('placeholder="Message Friday privately…"');
    expect(html).toContain("Visible only to April and Friday");
    expect(html).not.toContain("Private with Freya");
  });
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
