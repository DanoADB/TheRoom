"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RaisePriority({ roomId, entryId, raised }: { roomId: string; entryId: string; raised: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggle() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/human/activity/priority", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, entryId, raised: !raised }) });
      if (!response.ok) throw new Error("Could not update priority. Please try again.");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update priority."); }
    finally { setBusy(false); }
  }
  return <div className="mt-3"><button type="button" aria-pressed={raised} disabled={busy} onClick={toggle} className="border border-amber-300/30 px-3 py-2 text-xs text-amber-200 hover:bg-amber-300/10 disabled:opacity-40">{busy ? "Saving…" : raised ? "Priority raised · Undo" : "Raise Priority"}</button>{error ? <p role="alert" className="mt-2 text-xs text-red-300">{error}</p> : null}</div>;
}
