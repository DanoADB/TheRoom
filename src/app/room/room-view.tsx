"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type RoomMessage = {
  id: string;
  sequence: number;
  timestamp: string;
  author: { id: string; displayName: string; type: string };
  content: string;
  sourceType: string;
  metadata: unknown;
  attachments: Array<{ id: string; fileName: string; mimeType: string; byteSize: number; url: string }>;
  feedback?: { up: number; down: number; viewer: "up" | "down" | null };
};

type PendingImage = { file: File; previewUrl: string };

type Participant = {
  id: string;
  displayName: string;
  type: "human" | "agent";
  status: string;
};

type RoomCuriosity = {
  id: string;
  kind: string;
  title: string;
  reason: string | null;
  sourceMessage: string | null;
  timestamp: string;
  author: string;
};

const OPENAI_USAGE_URL = "https://platform.openai.com/usage";

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CuriositiesPanel({ curiosities }: { curiosities: RoomCuriosity[] }) {
  return (
    <div className="border-t border-white/10 pt-6">
      <p className="text-xs uppercase tracking-[0.18em] text-white/30">Gallery of Curiosity</p>
      <ul className="mt-4 space-y-3 text-sm text-white/70">
        {curiosities.length === 0 ? <li className="text-white/30">Nothing recorded yet.</li> : null}
        {curiosities.map((item) => (
          <li key={item.id} className="rounded-md border border-white/5 bg-white/[0.03] px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-white/85">{item.title}</p>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">{item.kind}</span>
            </div>
            {item.reason ? <p className="mt-1 text-xs text-white/45">{item.reason}</p> : null}
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">
              {item.author} · {formatTimestamp(item.timestamp)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CuriosityGallery({ curiosities }: { curiosities: RoomCuriosity[] }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
      <div className="border-b border-white/10 pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-300/70">Collected by the room</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white/90">Gallery of Curiosity</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">Questions, fascinations, and strange little threads worth keeping.</p>
      </div>

      <ul className="grid gap-4 py-6 sm:grid-cols-2" aria-label="Seeded curiosities">
        {curiosities.length === 0 ? (
          <li className="col-span-full py-20 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-white/25">The gallery is waiting</p>
            <p className="mt-3 text-sm text-white/40">Nothing has caught the room&apos;s attention yet.</p>
          </li>
        ) : null}
        {curiosities.map((item) => (
          <li key={item.id} className="border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-base font-medium leading-6 text-white/85">{item.title}</p>
              <span className="shrink-0 border border-emerald-300/20 bg-emerald-300/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-200/65">{item.kind}</span>
            </div>
            {item.reason ? <p className="mt-4 text-sm leading-6 text-white/50">{item.reason}</p> : null}
            <p className="mt-5 border-t border-white/5 pt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">
              {item.author} · {formatTimestamp(item.timestamp)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RoomView({
  room,
  currentUser,
  participants,
  curiosities,
  initialMessages,
  initialSequence,
  initialMobileView,
}: {
  room: { id: string; name: string };
  currentUser: { id: string; displayName: string };
  participants: Participant[];
  curiosities: RoomCuriosity[];
  initialMessages: RoomMessage[];
  initialSequence: number;
  initialMobileView: "room" | "gallery";
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [latestSequence, setLatestSequence] = useState(initialSequence);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [connection, setConnection] = useState<"connected" | "reconnecting">("connected");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [pendingFeedback, setPendingFeedback] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<{ messageId: string; message: string } | null>(null);
  const [mobileView, setMobileView] = useState<"room" | "gallery">(initialMobileView);
  const bottomRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
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
    if ((!text && images.length === 0) || pending) return;
    setPending(true);
    setError("");
    try {
      const form = new FormData();
      form.set("content", text);
      form.set("metadata", "{}");
      for (const image of images) form.append("images", image.file, image.file.name);
      const response = await fetch(`/api/human/rooms/${room.id}/messages`, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Message could not be sent.");
      mergeMessages([body.message]);
      setLatestSequence(body.message.sequence);
      setContent("");
      for (const image of images) URL.revokeObjectURL(image.previewUrl);
      setImages([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message could not be sent.");
    } finally {
      setPending(false);
    }
  }

  function addImages(files: File[]) {
    const selected = files.filter((file) => file.type.startsWith("image/"));
    if (!selected.length) return;
    if (images.length + selected.length > 4) {
      setError("Attach no more than 4 images to one message.");
      return;
    }
    const invalid = selected.find((file) => !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || file.size > 5 * 1024 * 1024);
    if (invalid) {
      setError("Each image must be a JPEG, PNG, WebP, or GIF no larger than 5 MB.");
      return;
    }
    setError("");
    setImages((current) => [...current, ...selected.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }

  function removeImage(index: number) {
    setImages((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function logout() {
    await fetch("/api/human/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function rateMessage(messageId: string, value: "up" | "down") {
    if (pendingFeedback) return;
    const previous = messages.find((message) => message.id === messageId)?.feedback ?? { up: 0, down: 0, viewer: null };
    const nextViewer = previous.viewer === value ? null : value;
    const nextFeedback = {
      up: Math.max(0, previous.up - (previous.viewer === "up" ? 1 : 0) + (nextViewer === "up" ? 1 : 0)),
      down: Math.max(0, previous.down - (previous.viewer === "down" ? 1 : 0) + (nextViewer === "down" ? 1 : 0)),
      viewer: nextViewer,
    };
    setPendingFeedback(messageId);
    setFeedbackError(null);
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, feedback: nextFeedback } : message));

    try {
      const response = await fetch(`/api/human/messages/${messageId}/feedback`, nextViewer ? {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: nextViewer }),
      } : { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error?.message ?? "Feedback could not be saved.");
      }
    } catch (cause) {
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, feedback: previous } : message));
      setFeedbackError({ messageId, message: cause instanceof Error ? cause.message : "Feedback could not be saved." });
    } finally {
      setPendingFeedback(null);
    }
  }

  function selectMobileView(view: "room" | "gallery") {
    setMobileView(view);
    window.history.replaceState(null, "", view === "gallery" ? "/room?view=gallery" : "/room");
  }

  return (
    <main className="min-h-screen bg-[#090b0f] text-[#f4f1e8] lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden border-r border-white/10 bg-[#0d1015] p-7 lg:flex lg:flex-col">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-emerald-300/80">Noetic</p>
          <p className="mt-2 text-[11px] text-white/25">A Hobbedy space</p>
        </div>
        <nav className="mt-8 space-y-1 text-sm" aria-label="Primary navigation">
          <Link href="/room" aria-current="page" className="block border-l border-emerald-300 px-3 py-2 text-emerald-200">Conversation</Link>
          <Link href="/activity" className="block border-l border-transparent px-3 py-2 text-white/40 transition hover:border-white/20 hover:text-white/75">Activity</Link>
        </nav>
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
        <CuriositiesPanel curiosities={curiosities} />
        <button onClick={logout} className="mt-auto text-left text-xs text-white/35 transition hover:text-white/70">Leave as {currentUser.displayName}</button>
      </aside>

      <section className="flex h-[100dvh] min-w-0 flex-col lg:h-screen">
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/10 bg-[#0d1015]/90 px-5 backdrop-blur sm:px-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{room.name}</h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">One room · {latestSequence} messages</p>
          </div>
          <div className="flex items-center gap-4">
            <a
              href={OPENAI_USAGE_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Open the OpenAI usage dashboard for TheRoom and Isla costs"
              title="OpenAI Usage — filter to theRoom/Isla"
              className="border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45 transition hover:border-emerald-300/30 hover:text-emerald-200"
            >
              <span className="hidden sm:inline">Isla API cost </span>
              <span className="sm:hidden">Cost </span>
              <span aria-hidden="true">↗</span>
            </a>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
              <span className={`h-2 w-2 rounded-full ${connection === "connected" ? "bg-emerald-300" : "animate-pulse bg-amber-300"}`} />
              <span className="hidden sm:inline">{connection}</span>
            </div>
          </div>
        </header>

        <div className={`${mobileView === "room" ? "block" : "hidden"} flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:block`}>
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
                    {message.content ? <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-7 text-white/70">{message.content}</p> : null}
                    {message.attachments.length ? (
                      <div className={`mt-3 grid gap-2 ${message.attachments.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                        {message.attachments.map((attachment) => (
                          <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="group block overflow-hidden border border-white/10 bg-black/20">
                            {/* Authenticated, user-uploaded images are served through the Room's same-origin attachment route. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={attachment.url}
                              alt={attachment.fileName || "Message attachment"}
                              loading="lazy"
                              className="max-h-[32rem] w-full object-contain transition duration-200 group-hover:opacity-90"
                            />
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {isAgent ? (
                      <div className="mt-3 flex items-center gap-1" aria-label={`Rate ${message.author.displayName}'s response`}>
                        <button
                          type="button"
                          onClick={() => rateMessage(message.id, "up")}
                          disabled={pendingFeedback === message.id}
                          aria-label="Good response"
                          aria-pressed={message.feedback?.viewer === "up"}
                          title="Good response"
                          className={`flex h-8 w-8 items-center justify-center border transition disabled:opacity-40 ${message.feedback?.viewer === "up" ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-200" : "border-transparent text-white/25 hover:border-white/10 hover:text-white/60"}`}
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.6">
                            <path d="M7.5 20H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h2.5m0 10V10l4-7c1.7 0 3 1.3 3 3v2h3.9a2.6 2.6 0 0 1 2.5 3.2l-1.5 6.5a3 3 0 0 1-2.9 2.3h-9Z" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => rateMessage(message.id, "down")}
                          disabled={pendingFeedback === message.id}
                          aria-label="Poor response"
                          aria-pressed={message.feedback?.viewer === "down"}
                          title="Poor response"
                          className={`flex h-8 w-8 items-center justify-center border transition disabled:opacity-40 ${message.feedback?.viewer === "down" ? "border-rose-300/40 bg-rose-300/10 text-rose-200" : "border-transparent text-white/25 hover:border-white/10 hover:text-white/60"}`}
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.6">
                            <path d="M7.5 4H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2.5m0-10v10l4 7c1.7 0 3-1.3 3-3v-2h3.9a2.6 2.6 0 0 0 2.5-3.2l-1.5-6.5A3 3 0 0 0 16.5 4h-9Z" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {feedbackError?.messageId === message.id ? <span role="alert" className="ml-2 text-xs text-rose-300">{feedbackError.message}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>

        <section className={`${mobileView === "gallery" ? "block" : "hidden"} flex-1 overflow-y-auto lg:hidden`} aria-label="Gallery of Curiosity">
          <CuriosityGallery curiosities={curiosities} />
        </section>

        <footer className={`${mobileView === "room" ? "block" : "hidden"} shrink-0 border-t border-white/10 bg-[#0d1015] p-4 sm:p-6 lg:block`}>
          <form onSubmit={send} className="mx-auto max-w-3xl">
            <div className="border border-white/10 bg-black/20 focus-within:border-white/25">
              {images.length ? (
                <div className="grid grid-cols-4 gap-2 border-b border-white/10 p-2" aria-label="Images ready to send">
                  {images.map((image, index) => (
                    <div key={`${image.file.name}-${image.previewUrl}`} className="group relative aspect-square overflow-hidden border border-white/10 bg-black/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.previewUrl} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        aria-label={`Remove ${image.file.name}`}
                        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center bg-black/75 text-lg leading-none text-white/75 transition hover:text-white"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex items-end gap-2 p-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    addImages(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={pending || images.length >= 4}
                  aria-label="Attach pictures"
                  title="Attach pictures"
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-white/35 transition hover:bg-white/5 hover:text-white/70 disabled:opacity-20"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.6">
                    <path d="M8.5 12.5 13 8a3 3 0 1 1 4.2 4.2l-6.3 6.3a5 5 0 0 1-7.1-7.1l7-7a3.5 3.5 0 0 1 5 5l-6.4 6.4a2 2 0 0 1-2.8-2.8l5.7-5.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                onPaste={(event) => {
                  const pastedImages = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                  if (pastedImages.length) {
                    event.preventDefault();
                    addImages(pastedImages);
                  }
                }}
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
              <button disabled={pending || (!content.trim() && images.length === 0)} className="h-11 bg-[#f4f1e8] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[#0b0d10] transition hover:bg-white disabled:opacity-25">
                {pending ? "Sending" : "Send"}
              </button>
              </div>
            </div>
            {error ? <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p> : null}
          </form>
        </footer>

        <nav className="grid shrink-0 grid-cols-3 border-t border-white/10 bg-[#0d1015] pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Room navigation">
          <button
            type="button"
            onClick={() => selectMobileView("room")}
            aria-current={mobileView === "room" ? "page" : undefined}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 transition ${mobileView === "room" ? "bg-emerald-300/[0.06] text-emerald-200" : "text-white/35 hover:text-white/65"}`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.6">
              <path d="M4 5.5h16v11H9l-5 3v-14Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em]">Room</span>
          </button>
          <button
            type="button"
            onClick={() => selectMobileView("gallery")}
            aria-current={mobileView === "gallery" ? "page" : undefined}
            className={`relative flex min-h-16 flex-col items-center justify-center gap-1 transition ${mobileView === "gallery" ? "bg-emerald-300/[0.06] text-emerald-200" : "text-white/35 hover:text-white/65"}`}
          >
            <span className="relative">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.6">
                <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m18.5 16 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {curiosities.length > 0 ? (
                <span className="absolute -right-3 -top-2 min-w-4 rounded-full bg-emerald-200 px-1 text-center font-mono text-[8px] leading-4 text-[#0b0d10]">
                  {curiosities.length > 99 ? "99+" : curiosities.length}
                </span>
              ) : null}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em]">Gallery</span>
          </button>
          <Link
            href="/activity"
            className="flex min-h-16 flex-col items-center justify-center gap-1 text-white/35 transition hover:text-white/65"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.6">
              <path d="M4 18V9m5 9V5m5 13v-7m5 7V3" strokeLinecap="round" />
            </svg>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em]">Activity</span>
          </Link>
        </nav>
      </section>
    </main>
  );
}
