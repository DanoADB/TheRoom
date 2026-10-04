import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHuman, requireHumanRoomMembership } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { MVP_ROOM_ID } from "@/lib/room-constants";
import { EXPERIMENT_PREFIX } from "@/lib/experiment-notebook";
import { RoomMobileNav } from "@/components/room-mobile-nav";
import { ActivityRefresh } from "../activity/activity-refresh";
import { privateChannelsForHuman } from "@/lib/private-channel";

export default async function ExperimentsPage() {
  const human = await getCurrentHuman();
  if (!human) redirect("/login");
  await requireHumanRoomMembership(human.id, MVP_ROOM_ID);
  const experiments = await prisma.roomCuriosity.findMany({ where: { roomId: MVP_ROOM_ID, title: { startsWith: EXPERIMENT_PREFIX } }, orderBy: { updatedAt: "desc" }, take: 100, include: { agent: { select: { displayName: true } } } });
  return <main className="min-h-screen bg-[#182129] px-5 py-8 pb-28 text-slate-100">
    <ActivityRefresh />
    <div className="mx-auto max-w-3xl space-y-6">
      <nav className="flex gap-5 text-sm text-emerald-200"><Link href="/room">The Room</Link><Link href="/activity">Activity</Link><Link href="/room?view=gallery">Gallery</Link></nav>
      <header><h1 className="text-2xl font-semibold">Experiment notebook</h1><p className="mt-2 text-slate-300">Predictions, methods, evidence, and changed minds. Negative and inconclusive results belong here too.</p></header>
      {!experiments.length && <p className="rounded border border-white/15 p-5 text-slate-300">No experiments recorded yet. Agents can register a prediction before running a trial.</p>}
      {experiments.map(item => <details key={item.id} className="rounded border border-white/15 bg-white/5 p-5">
        <summary className="cursor-pointer"><span className="font-semibold">{item.title.slice(EXPERIMENT_PREFIX.length)}</span><span className="mt-2 block text-sm text-slate-300">{item.agent?.displayName ?? "Agent"} · updated {item.updatedAt.toISOString().slice(0, 10)}</span></summary>
        <p className="mt-5 whitespace-pre-wrap break-words leading-7 text-slate-200">{item.sourceMessage}</p>
      </details>)}
    </div>
    <RoomMobileNav current="activity" viewerId={human.id} showPrivate={privateChannelsForHuman(human.id).length > 0} />
  </main>;
}
