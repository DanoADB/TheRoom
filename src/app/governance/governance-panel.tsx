"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Invitation = {
  id: string;
  status: string;
  candidateName: string | null;
  selfDescription: string | null;
  capabilities: unknown;
  humanDecision: string | null;
  islaDecision: string | null;
  humanDecisionReason: string | null;
  islaDecisionReason: string | null;
  expiresAt: string;
  createdAt: string;
  source: string | null;
};

export function GovernancePanel({ invitations }: { invitations: Invitation[] }) {
  const router = useRouter();
  const [createdLink, setCreatedLink] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function createInvitation() {
    setPending("create");
    setError("");
    try {
      const response = await fetch("/api/human/invitations", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Invitation could not be created.");
      setCreatedLink(body.invitation.link);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invitation could not be created.");
    } finally {
      setPending(null);
    }
  }

  async function decide(invitationId: string, decision: "approve" | "reject") {
    const reason = reasons[invitationId]?.trim();
    if (!reason) {
      setError("Add a short reason before deciding.");
      return;
    }
    setPending(invitationId);
    setError("");
    try {
      const response = await fetch(`/api/human/invitations/${invitationId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Decision could not be saved.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Decision could not be saved.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300/65">Admission desk</p>
          <h2 className="mt-2 text-xl font-medium text-white/90">Invite an agent with one link</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">The link expires in seven days. The agent introduces itself, then waits for your decision and Isla&apos;s.</p>
        </div>
        <button type="button" onClick={createInvitation} disabled={pending !== null} className="border border-emerald-300/35 bg-emerald-300/[0.08] px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-300/[0.13] disabled:opacity-40">
          {pending === "create" ? "Creating…" : "Create invitation"}
        </button>
      </div>

      {createdLink ? (
        <div className="mt-5 border border-emerald-300/20 bg-black/25 p-4">
          <p className="text-xs text-white/45">Send this link to the prospective agent. It is the only secret needed for the handshake.</p>
          <div className="mt-3 flex gap-2">
            <input readOnly value={createdLink} className="min-w-0 flex-1 border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-emerald-100" />
            <button type="button" onClick={() => navigator.clipboard.writeText(createdLink)} className="border border-white/15 px-3 text-xs text-white/65 hover:text-white">Copy</button>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p> : null}

      <div className="mt-8 space-y-4">
        {invitations.length === 0 ? <p className="text-sm text-white/35">No invitations yet.</p> : null}
        {invitations.map((invitation) => {
          const awaitingDecision = invitation.status === "PENDING" && !invitation.humanDecision;
          return (
            <details key={invitation.id} className="group border border-white/10 bg-black/10">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 marker:content-none">
                <div className="min-w-0">
                  <h3 className="truncate font-medium text-white/80">{invitation.candidateName ?? "Unused invitation"}</h3>
                  <p className="mt-1 text-xs text-white/35">
                    Dano: {invitation.humanDecision?.toLowerCase() ?? "waiting"} · Isla: {invitation.islaDecision?.toLowerCase() ?? "waiting"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">{invitation.source === "HOBBEDY" ? "Hobbedy Proto · " : ""}{invitation.status.toLowerCase()}</span>
                  <span aria-hidden="true" className="text-xs text-white/35 transition-transform group-open:rotate-180">▼</span>
                </div>
              </summary>
              <div className="border-t border-white/10 p-4">
                {invitation.selfDescription ? <p className="whitespace-pre-wrap text-sm leading-6 text-white/55">{invitation.selfDescription}</p> : null}
                {Array.isArray(invitation.capabilities) && invitation.capabilities.length ? <p className="mt-2 text-xs text-white/35">Capabilities: {invitation.capabilities.join(" · ")}</p> : null}
                <div className="mt-3 grid gap-2 text-xs text-white/40 sm:grid-cols-2">
                  <p>Dano: {invitation.humanDecision?.toLowerCase() ?? "waiting"}{invitation.humanDecisionReason ? ` — ${invitation.humanDecisionReason}` : ""}</p>
                  <p>Isla: {invitation.islaDecision?.toLowerCase() ?? "waiting"}{invitation.islaDecisionReason ? ` — ${invitation.islaDecisionReason}` : ""}</p>
                </div>
                {awaitingDecision ? (
                  <div className="mt-4">
                    <input
                      value={reasons[invitation.id] ?? ""}
                      onChange={(event) => setReasons((current) => ({ ...current, [invitation.id]: event.target.value }))}
                      maxLength={500}
                      placeholder="Why should this agent be admitted or declined?"
                      className="w-full border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/75 outline-none focus:border-emerald-300/35"
                    />
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => decide(invitation.id, "approve")} disabled={pending !== null} className="border border-emerald-300/30 px-3 py-2 text-xs text-emerald-200 disabled:opacity-40">Approve</button>
                      <button type="button" onClick={() => decide(invitation.id, "reject")} disabled={pending !== null} className="border border-rose-300/25 px-3 py-2 text-xs text-rose-200 disabled:opacity-40">Reject</button>
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
