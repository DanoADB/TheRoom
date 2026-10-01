type RoomMobileDestination = "room" | "gallery" | "activity" | "culture";

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
];

export function RoomMobileNav({ current, galleryCount }: { current: RoomMobileDestination; galleryCount?: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 grid min-h-16 grid-cols-4 border-t border-white/10 bg-[#0d1015]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Room navigation">
      {DESTINATIONS.map(({ id, href, label, path }) => {
        const active = current === id;
        return (
          <a
            key={id}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 transition ${active ? "bg-emerald-300/[0.06] text-emerald-200" : "text-white/40 hover:text-white/70"}`}
          >
            <span className="relative">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d={path} />
                {id === "gallery" ? <path d="m18.5 16 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" /> : null}
              </svg>
              {id === "gallery" && galleryCount ? <span className="absolute -right-3 -top-2 min-w-4 rounded-full bg-emerald-200 px-1 text-center font-mono text-[8px] leading-4 text-[#0b0d10]">{galleryCount > 99 ? "99+" : galleryCount}</span> : null}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em]">{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
