"use client";

import { useEffect, useState } from "react";
import { hasNewNavItems, type NavFreshness } from "@/lib/nav-freshness";

type RoomMobileDestination = "room" | "gallery" | "activity" | "culture" | "private";
type NavFreshnessResponse = { gallery: NavFreshness; activity: NavFreshness };

const DESTINATIONS: Array<{
  id: RoomMobileDestination;
  href: string;
  label: string;
  path: string;
}> = [
  { id: "room", href: "/room", label: "Room", path: "M4 5.5h16v11H9l-5 3v-14Z" },
  { id: "gallery", href: "/room?view=gallery", label: "Gallery", path: "m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" },
  { id: "activity", href: "/activity", label: "Activity", path: "M4 18V9m5 9V5m5 13v-7m5 7V3" },
  { id: "culture", href: "/governance", label: "Culture", path: "M12 3v18M5 7h14M7 7l-3 6h6L7 7Zm10 0-3 6h6l-3-6ZM8 21h8" },
  { id: "private", href: "/private", label: "Private", path: "M12 3 20 6v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3Z" },
];

export function RoomMobileNav({ current, viewerId, showPrivate = false }: { current: RoomMobileDestination; viewerId: string; showPrivate?: boolean }) {
  const [newDestinations, setNewDestinations] = useState<Set<"gallery" | "activity">>(() => new Set());
  const destinations = DESTINATIONS.filter((destination) => destination.id !== "private" || showPrivate);

  useEffect(() => {
    let stopped = false;
    async function refreshFreshness() {
      try {
        const response = await fetch("/api/human/rooms/nav-freshness", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as NavFreshnessResponse;
        if (!stopped) {
          const next = new Set<"gallery" | "activity">();
          for (const destination of ["gallery", "activity"] as const) {
            const latest = body[destination];
            const key = `noetic-nav-seen:${viewerId}:${destination}`;
            try {
              const stored = localStorage.getItem(key);
              const seen = stored ? JSON.parse(stored) as NavFreshness : null;
              if (current === destination) {
                localStorage.setItem(key, JSON.stringify(latest));
              } else if (!stored) {
                // Establish a baseline on rollout; old content should not look newly arrived.
                localStorage.setItem(key, JSON.stringify(latest));
              } else if (hasNewNavItems(latest, seen)) {
                next.add(destination);
              }
            } catch {
              // Ignore unavailable or malformed browser storage rather than showing stale badges.
            }
          }
          setNewDestinations(next);
        }
      } catch {
        // Navigation remains usable if freshness checks are temporarily unavailable.
      }
    }
    void refreshFreshness();
    const interval = window.setInterval(refreshFreshness, 15_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [current, viewerId]);

  return (
    <nav className={`fixed inset-x-0 bottom-0 z-50 grid min-h-16 ${showPrivate ? "grid-cols-5" : "grid-cols-4"} border-t border-white/10 bg-[#0d1015]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden`} aria-label="Room navigation">
      {destinations.map(({ id, href, label, path }) => {
        const active = current === id;
        const isNew = (id === "gallery" || id === "activity") && newDestinations.has(id);
        return (
          <a
            key={id}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={isNew ? `${label}, new items` : label}
            className={`flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 transition ${active ? "bg-emerald-300/[0.06] text-emerald-200" : "text-white/40 hover:text-white/70"}`}
          >
            <span className="relative">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d={path} />
                {id === "gallery" ? <path d="m18.5 16 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" /> : null}
              </svg>
              {isNew ? <span aria-hidden="true" className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-[#0d1015] bg-emerald-200" /> : null}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em]">{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
