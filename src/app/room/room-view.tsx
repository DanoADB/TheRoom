"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RoomMessage = {
  id: string;
  sequence: number;
  timestamp: string;
  author: { id: string; displayName: string; type: string };
  content: string;
  sourceType: string;
  metadata: unknown;
};

type Participant = {
  id: string;
  displayName: string;
  type: "human" | "agent";
  status: string;
};

export function RoomView({
  room,
  currentUser,
  participants,
  initialMessages,
  initialSequence,
}: {
  room: { id: string; name: string };
  currentUser: { id: string; displayName: string };
  participants: Participant[];
  initialMessages: RoomMessage[];
  initialSequence: number;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [latestSequence, setLatestSequence] = useState(initialSequence);
  const [content, setContent] = useState("");
  const [connection, setConnection] = useState<"connected" | "reconnecting">("connected");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef(initialMessages.at(-1)?.sequence ?? 0);

  const mergeMessages = useCallback((incoming: RoomMessage[]) => {
    if (!incoming.length) return;
    setMessages((current) => {
      const known = new Set(current.map((message) => message.id));
      return [...current, ...incoming.filter((message) => !known.has(message.id))].sort((a, b) => a.sequence - b.sequence);
    });
    sequenceRef.current = Math.max(sequenceRef.current, ...incoming.map((message) => message.sequence));
  }, []);

  const poll = useCallback(async () => {
    try {
      const response = await fetch(`/api/human/rooms/${room.id}/messages?after=${sequenceRef.current}`, { cache: "no-store" });
      if (response.status === 401) {
        router.push("/login");
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error("poll failed");
      const body = await response.json();
      mergeMessages(body.messages);
      setLatestSequence(body.latestSequence);
      setConnection("connected");
    } catch {
      setConnection("reconnecting");
    }
  }, [mergeMessages, room.id, router]);

  useEffect(() => {
    const interval = window.setInterval(poll, 2_000);
    return () => window.clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: messages.length === initialMessages.length ? "auto" : "smooth" });
  }, [messages.length, initialMessages.length]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = content.trim();
    if (!text || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/human/rooms/${room.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, metadata: {} }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Message could not be sent.");
      mergeMessages([body.message]);
      setLatestSequence(body.message.sequence);
      setContent("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message could not be sent.");
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    await fetch("/api/human/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#090b0f] text-[#f4f1e8] lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden border-r border-white/10 bg-[#0d1015] p-7 lg:flex lg:flex-col">
        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/30">The Room</p>
        <div className="mt-12">
          <p className="text-xs uppercase tracking-[0.18em] text-white/30">Present</p>
          <ul className="mt-5 space-y-4">
            {participants.map((participant) => (
              <li key={participant.id} className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full ${participant.status === "active" || participant.type === "human" ? "bg-emerald-300" : "bg-white/20"}`} />
                <div>
                  <p className="text-sm text-white/80">{participant.displayName}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-white/30">{participant.type}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <button onClick={logout} className="mt-auto text-left text-xs text-white/35 transition hover:text-white/70">Leave as {currentUser.displayName}</button>
      </aside>

      <section className="flex h-screen min-w-0 flex-col">
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/10 bg-[#0d1015]/90 px-5 backdrop-blur sm:px-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{room.name}</h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">One room · {latestSequence} messages</p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
            <span className={`h-2 w-2 rounded-full ${connection === "connected" ? "bg-emerald-300" : "animate-pulse bg-amber-300"}`} />
            {connection}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-8">
          <div className="mx-auto max-w-3xl space-y-8">
            {messages.length === 0 ? (
              <div className="py-24 text-center">
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-white/25">The room is quiet</p>
                <p className="mt-3 text-white/45">Say something worth answering.</p>
              </div>
            ) : null}
            {messages.map((message) => {
              const isAgent = message.author.type === "agent";
              const isSelf = message.author.id === currentUser.id;
              return (
                <article key={message.id} className={`grid grid-cols-[36px_minmax(0,1fr)] gap-4 ${isSelf ? "opacity-100" : "opacity-95"}`}>
                  <div className={`flex h-9 w-9 items-center justify-center border font-mono text-xs ${isAgent ? "border-violet-300/25 bg-violet-300/10 text-violet-200" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"}`}>
                    {message.author.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-medium text-white/85">{message.author.displayName}</span>
                      <span className={`font-mono text-[9px] uppercase tracking-[0.18em] ${isAgent ? "text-violet-300/70" : "text-emerald-300/70"}`}>{message.author.type}</span>
                      <time suppressHydrationWarning className="font-mono text-[10px] text-white/25">{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-7 text-white/70">{message.content}</p>
                  </div>
                </article>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>

        <footer className="shrink-0 border-t border-white/10 bg-[#0d1015] p-4 sm:p-6">
          <form onSubmit={send} className="mx-auto max-w-3xl">
            <div className="flex items-end gap-3 border border-white/10 bg-black/20 p-2 focus-within:border-white/25">
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                maxLength={8_000}
                placeholder={`Message as ${currentUser.displayName}…`}
                className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-6 text-white/80 outline-none placeholder:text-white/25"
              />
              <button disabled={pending || !content.trim()} className="h-11 bg-[#f4f1e8] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[#0b0d10] transition hover:bg-white disabled:opacity-25">
                {pending ? "Sending" : "Send"}
              </button>
            </div>
            {error ? <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p> : null}
          </form>
        </footer>
      </section>
    </main>
  );
}
