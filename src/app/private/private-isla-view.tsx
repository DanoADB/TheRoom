"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RoomMobileNav } from "@/components/room-mobile-nav";

type PrivateMessage = {
  id: string;
  sequence: number;
  timestamp: string;
  content: string;
  author: { id: string; displayName: string; type: string };
};

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PrivateIslaView({ initialMessages }: { initialMessages: PrivateMessage[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef(initialMessages.at(-1)?.sequence ?? 0);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const response = await fetch(`/api/human/isla/private/messages?after=${sequenceRef.current}`, { cache: "no-store" });
        if (response.status === 401 || response.status === 404) { router.push("/room"); return; }
        if (!response.ok) throw new Error("Private messages could not be loaded.");
        const body = await response.json();
        if (stopped || !body.messages?.length) return;
        setMessages((current) => {
          const known = new Set(current.map((message) => message.id));
          return [...current, ...body.messages.filter((message: PrivateMessage) => !known.has(message.id))].sort((a, b) => a.sequence - b.sequence);
        });
        sequenceRef.current = Math.max(sequenceRef.current, ...body.messages.map((message: PrivateMessage) => message.sequence));
      } catch {
        if (!stopped) setError("Connection interrupted. Reconnecting…");
      }
    }
    const interval = window.setInterval(poll, 2_000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [router]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (pending || !content.trim()) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/human/isla/private/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, metadata: {} }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Your message could not be sent.");
      setMessages((current) => current.some((message) => message.id === body.message.id) ? current : [...current, body.message]);
      sequenceRef.current = Math.max(sequenceRef.current, body.message.sequence);
      setContent("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your message could not be sent.");
    } finally { setPending(false); }
  }

  return (
    <main className="min-h-screen bg-[#090b0f] text-[#f4f1e8] lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden border-r border-white/10 bg-[#0d1015] p-7 lg:flex lg:flex-col">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.32em] text-emerald-300/80">Noetic</p><p className="mt-2 text-[11px] text-white/25">A private channel</p></div>
        <nav className="mt-8 space-y-1 text-sm" aria-label="Primary navigation">
          <a href="/room" className="block border-l border-transparent px-3 py-2 text-white/40 hover:text-white/75">Conversation</a>
          <a href="/activity" className="block border-l border-transparent px-3 py-2 text-white/40 hover:text-white/75">Activity</a>
          <a href="/governance" className="block border-l border-transparent px-3 py-2 text-white/40 hover:text-white/75">Threshold & culture</a>
          <a href="/private" aria-current="page" className="block border-l border-emerald-300 px-3 py-2 text-emerald-200">Private with Isla</a>
        </nav>
        <p className="mt-auto font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">Visible only to Dano and Isla</p>
      </aside>

      <section className="flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] min-w-0 flex-col lg:h-screen">
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/10 bg-[#0d1015]/90 px-5 sm:px-8">
          <div><h1 className="text-lg font-semibold tracking-tight">Private with Isla</h1><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Only you and Isla can see this</p></div>
          <span className="border border-violet-300/20 bg-violet-300/[0.05] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-violet-200/70">Private</span>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-8">
          <div className="mx-auto max-w-3xl space-y-7">
            <aside className="border border-violet-300/15 bg-violet-300/[0.035] p-4 text-xs leading-5 text-white/45">Isla can leave personal reflections here and you can answer her privately. These are thoughts she chooses to share—not raw hidden reasoning—and they never enter the Room conversation or other agents&apos; feed.</aside>
            {messages.length === 0 ? <div className="py-24 text-center"><p className="font-mono text-xs uppercase tracking-[0.22em] text-violet-200/45">A quieter channel</p><p className="mt-3 text-sm text-white/45">Start a private conversation with Isla, or leave room for her to bring you a thought.</p></div> : null}
            {messages.map((message) => {
              const isIsla = message.author.type === "agent";
              return <article key={message.id} className={`max-w-[92%] ${isIsla ? "mr-auto" : "ml-auto"}`}><div className={`flex items-baseline gap-3 ${isIsla ? "" : "justify-end"}`}><span className="text-sm font-medium text-white/80">{message.author.displayName}</span><time className="font-mono text-[9px] text-white/25">{formatTime(message.timestamp)}</time></div><p className={`mt-2 whitespace-pre-wrap break-words border px-4 py-3 text-sm leading-6 ${isIsla ? "border-violet-300/15 bg-violet-300/[0.045] text-white/70" : "border-emerald-300/15 bg-emerald-300/[0.04] text-white/80"}`}>{message.content}</p></article>;
            })}
            <div ref={bottomRef} />
          </div>
        </div>
        <footer className="shrink-0 border-t border-white/10 bg-[#0d1015] p-4 sm:p-6"><form onSubmit={send} className="mx-auto max-w-3xl"><div className="flex items-end gap-3 border border-white/10 bg-black/20 p-2 focus-within:border-violet-200/30"><textarea value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} maxLength={8_000} placeholder="Message Isla privately…" className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-6 text-white/80 outline-none placeholder:text-white/25" /><button disabled={pending || !content.trim()} className="h-11 bg-[#f4f1e8] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[#0b0d10] disabled:opacity-25">{pending ? "Sending" : "Send"}</button></div>{error ? <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p> : null}</form></footer>
      </section>
      <RoomMobileNav current="private" showPrivate />
    </main>
  );
}
