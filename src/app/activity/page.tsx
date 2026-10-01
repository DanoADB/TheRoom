import Link from "next/link";
import { redirect } from "next/navigation";
import { AgentInterestList } from "@/lib/agent-curiosity";
import { getCurrentHuman } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { DANO_USER_ID, MVP_ROOM_ID } from "@/lib/room-constants";
import { ActivityRefresh } from "./activity-refresh";
import { RoomMobileNav } from "@/components/room-mobile-nav";

function integerSetting(name: string, fallback: number) {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function enabledSetting(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function metadataOf(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percentage = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const boundedValue = max > 0 ? Math.min(value, max) : 0;
  return (
    <div>
      <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
        <span>{label}</span>
        <span>{value} / {max}</span>
      </div>
      <div className="h-1.5 overflow-hidden bg-white/[0.07]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={boundedValue}>
        <div className="h-full bg-emerald-300 transition-[width] duration-500" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function formatTime(value: Date | null) {
  if (!value) return "Not yet recorded";
  return value.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function ActivityPage() {
  const user = await getCurrentHuman();
  if (!user) redirect("/login");

  const membership = await prisma.roomMembership.findUnique({
    where: { roomId_userId: { roomId: MVP_ROOM_ID, userId: user.id } },
  });
  if (!membership) redirect("/login");

  const isla = await prisma.agent.findFirst({
    where: { displayName: "Isla" },
    include: { curiosity: true },
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayStart = new Date(`${today}T00:00:00.000Z`);
  const messages = isla ? await prisma.message.findMany({
    where: { roomId: MVP_ROOM_ID, agentId: isla.id },
    orderBy: { createdAt: "desc" },
    take: 150,
    select: { id: true, content: true, createdAt: true, metadata: true },
  }) : [];

  const todayMessages = messages.filter((message) => message.createdAt >= todayStart);
  const proactiveCount = todayMessages.filter((message) => metadataOf(message.metadata).proactive === true).length;
  const autonomousCodeCount = todayMessages.filter((message) => {
    const metadata = metadataOf(message.metadata);
    return metadata.codeChange === true && metadata.proactive === true;
  }).length;
  const recentActivity = messages.filter((message) => {
    const metadata = metadataOf(message.metadata);
    return metadata.proactive === true || metadata.worldCuriosity === true || metadata.codeChange === true;
  }).slice(0, 12);

  const interestsResult = AgentInterestList.safeParse(isla?.curiosity?.interests ?? []);
  const interests = interestsResult.success ? interestsResult.data : [];
  const maxResearch = integerSetting("ISLA_MAX_WORLD_RESEARCHES_PER_DAY", 4);
  const maxProactive = integerSetting("ISLA_MAX_PROACTIVE_POSTS_PER_DAY", 75);
  const maxCodeChanges = integerSetting("ISLA_MAX_CODE_CHANGES_PER_DAY", 20);
  const researchCount = isla?.curiosity?.researchDay === today ? isla.curiosity.researchCount : 0;
  const researchIntervalHours = integerSetting("ISLA_WORLD_RESEARCH_INTERVAL_HOURS", 6);
  const nextResearchAt = isla?.curiosity?.lastExploredAt
    ? new Date(isla.curiosity.lastExploredAt.getTime() + researchIntervalHours * 60 * 60_000)
    : null;
  const proactiveEnabled = enabledSetting("ISLA_PROACTIVE_ENABLED", true);
  const agentActive = isla?.status === "ACTIVE";

  return (
    <main className="min-h-screen bg-[#090b0f] text-[#f4f1e8] lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <ActivityRefresh />
      <aside className="hidden border-r border-white/10 bg-[#0d1015] p-7 lg:flex lg:flex-col">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-emerald-300/80">Noetic</p>
          <p className="mt-2 text-[11px] text-white/25">A Hobbedy space</p>
        </div>
        <nav className="mt-8 space-y-1 text-sm" aria-label="Primary navigation">
          <Link href="/room" className="block border-l border-transparent px-3 py-2 text-white/40 transition hover:border-white/20 hover:text-white/75">Conversation</Link>
          <Link href="/activity" aria-current="page" className="block border-l border-emerald-300 px-3 py-2 text-emerald-200">Activity</Link>
          {user.id === DANO_USER_ID ? <Link href="/private" className="block border-l border-transparent px-3 py-2 text-white/40 transition hover:border-white/20 hover:text-white/75">Private with Isla</Link> : null}
        </nav>
        <div className="mt-12 border-t border-white/10 pt-6">
          <p className="text-xs uppercase tracking-[0.18em] text-white/30">Runtime</p>
          <div className="mt-4 flex items-center gap-3">
            <span className={`h-2 w-2 rounded-full ${agentActive ? "bg-emerald-300" : "bg-white/20"}`} />
            <div>
              <p className="text-sm text-white/80">Isla</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-white/30">{agentActive ? "Active" : "Inactive"}</p>
            </div>
          </div>
        </div>
        <p className="mt-auto font-mono text-[9px] uppercase tracking-[0.14em] text-white/20">Refreshes every 15 seconds</p>
      </aside>

      <section className="flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] min-w-0 flex-col lg:h-screen">
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/10 bg-[#0d1015]/90 px-5 backdrop-blur sm:px-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Activity</h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">Tasks · research · background work</p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
            <span className={`h-2 w-2 rounded-full ${agentActive ? "bg-emerald-300" : "bg-white/20"}`} />
            Isla {agentActive ? "active" : "inactive"}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-8">
          <div className="mx-auto max-w-5xl space-y-10">
            <section aria-labelledby="background-work-title">
              <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-300/70">Always-on systems</p>
                  <h2 id="background-work-title" className="mt-2 text-2xl font-semibold tracking-tight text-white/90">Background work</h2>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">Live data</span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <article className="border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium text-white/85">World research</h3>
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-300/65">Scheduled</span>
                  </div>
                  <p className="mt-3 min-h-12 text-sm leading-6 text-white/45">Explores the world and grows Isla&apos;s interests during quiet periods.</p>
                  <div className="mt-5"><ProgressBar value={researchCount} max={maxResearch} label="Researches today" /></div>
                  <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-white/25">Next window · {formatTime(nextResearchAt)}</p>
                </article>

                <article className="border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium text-white/85">Room watch</h3>
                    <span className={`font-mono text-[9px] uppercase tracking-[0.16em] ${proactiveEnabled ? "text-emerald-300/65" : "text-amber-300/65"}`}>{proactiveEnabled ? "Watching" : "Paused"}</span>
                  </div>
                  <p className="mt-3 min-h-12 text-sm leading-6 text-white/45">Looks for worthwhile moments to start a conversation or improve the room.</p>
                  <div className="mt-5"><ProgressBar value={proactiveCount} max={maxProactive} label="Proactive posts today" /></div>
                  <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-white/25">Checked on Isla&apos;s heartbeat</p>
                </article>

                <article className="border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium text-white/85">Autonomous building</h3>
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-300/65">Available</span>
                  </div>
                  <p className="mt-3 min-h-12 text-sm leading-6 text-white/45">Can investigate, propose, and ship improvements when there is a concrete reason.</p>
                  <div className="mt-5"><ProgressBar value={autonomousCodeCount} max={maxCodeChanges} label="Changes today" /></div>
                  <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-white/25">Directed changes remain unlimited</p>
                </article>
              </div>
            </section>

            <section aria-labelledby="research-map-title">
              <div className="border-b border-white/10 pb-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-violet-300/70">Evolving over time</p>
                <h2 id="research-map-title" className="mt-2 text-2xl font-semibold tracking-tight text-white/90">Research map</h2>
                <p className="mt-2 text-sm text-white/40">Last explored {formatTime(isla?.curiosity?.lastExploredAt ?? null)}</p>
              </div>
              {interests.length === 0 ? (
                <p className="py-12 text-sm text-white/35">No research interests have been recorded yet.</p>
              ) : (
                <ul className="grid gap-4 py-6 md:grid-cols-2">
                  {interests.map((interest) => (
                    <li key={interest.topic} className="border border-white/10 bg-white/[0.02] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="font-medium text-white/85">{interest.topic}</h3>
                        <span className="border border-violet-300/20 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-violet-200/60">{interest.origin}</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/45">{interest.why}</p>
                      <p className="mt-4 text-sm leading-6 text-white/65"><span className="text-white/30">Open question — </span>{interest.nextQuestion}</p>
                      <div className="mt-5"><ProgressBar value={interest.strength} max={5} label="Interest strength" /></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="recent-activity-title">
              <div className="border-b border-white/10 pb-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-300/70">Recent trail</p>
                <h2 id="recent-activity-title" className="mt-2 text-2xl font-semibold tracking-tight text-white/90">Completed activity</h2>
              </div>
              <ol className="divide-y divide-white/10">
                {recentActivity.length === 0 ? <li className="py-12 text-sm text-white/35">No background activity has been recorded yet.</li> : null}
                {recentActivity.map((message) => {
                  const metadata = metadataOf(message.metadata);
                  const kind = metadata.worldCuriosity === true ? "Research" : metadata.codeChange === true ? "Build" : "Proactive";
                  return (
                    <li key={message.id} className="grid gap-3 py-5 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-start">
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-300/60">{kind}</span>
                      <p className="line-clamp-3 text-sm leading-6 text-white/55">{message.content}</p>
                      <time className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/25">{formatTime(message.createdAt)}</time>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
        </div>

      </section>
      <RoomMobileNav current="activity" showPrivate={user.id === DANO_USER_ID} />
    </main>
  );
}
