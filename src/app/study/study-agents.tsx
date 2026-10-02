"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function StudyAgents({ agents, canManage }: { agents: Array<{ id: string; displayName: string; inStudy: boolean; returnRequest: string | null }>; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function move(id: string, inStudy: boolean) {
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/human/study", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: id, inStudy }) });
      if (!response.ok) throw new Error("Could not change participation. Please try again.");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Request failed."); }
    finally { setBusy(null); }
  }
  return <div className="space-y-4">{error && <p role="alert" className="text-red-300">{error}</p>}{agents.map(agent => <section key={agent.id} className="rounded-xl border border-white/20 bg-white/5 p-5">
    <h2 className="text-xl">{agent.displayName}</h2><p className="my-2 text-emerald-200">{agent.inStudy ? "In the Study" : "In the Room"}</p>
    {agent.returnRequest && <p className="my-3">Request to return: {agent.returnRequest}</p>}
    {canManage && <button disabled={busy !== null} onClick={() => move(agent.id, !agent.inStudy)} className="mt-2 rounded border border-white/30 px-4 py-3 disabled:opacity-40">{busy === agent.id ? "Moving…" : agent.inStudy ? "Return to Room" : "Move to Study"}</button>}
  </section>)}</div>;
}
