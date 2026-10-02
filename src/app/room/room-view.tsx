"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RoomMobileNav } from "@/components/room-mobile-nav";
import { privateChannelForHuman, PRIVATE_CHANNELS } from "@/lib/private-channel";
import { FEEDBACK_REACTIONS, type FeedbackReactionValue } from "@/lib/message-feedback";

type RoomMessage = {
  id: string;
  sequence: number;
  timestamp: string;
  author: { id: string; displayName: string; type: string };
  content: string;
  sourceType: string;
  metadata: unknown;
  attachments: Array<{ id: string; fileName: string; mimeType: string; byteSize: number; url: string }>;
  feedback?: { counts: Partial<Record<FeedbackReactionValue, number>>; viewer: FeedbackReactionValue | null };
};

type PendingImage = { file: File; previewUrl: string };

type Participant = {
  id: string;
  displayName: string;
  type: "human" | "agent";
  status: string;
};

type RoomGalleryItem = {
  id: string;
  kind: string;
  title: string;
  reason: string | null;
  sourceMessage: string | null;
  timestamp: string;
  agentId: string;
  author: string;
  priority: "gallery-worthy" | "needs-implementation" | "interesting-but-not-yet-worth-changing";
};

type RoomGalleryBucket = {
  priority: RoomGalleryItem["priority"];
  label: string;
  description: string;
  items: RoomGalleryItem[];
};

const OPENAI_USAGE_URL = "https://platform.openai.com/usage";

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function GalleryEntry({ item }: { item: RoomGalleryItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = Boolean(item.sourceMessage || (item.reason && item.reason.length > 140));
  return (
    <article className="rounded-md border border-white/5 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium leading-5 text-white/85">{item.title}</p>
        <span className="shrink-0 border border-emerald-300/20 bg-emerald-300/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-200/65">{item.kind}</span>
      </div>
      {item.reason ? <p className={`${expanded ? "" : "line-clamp-3"} mt-3 whitespace-pre-wrap text-xs leading-5 text-white/50`}>{item.reason}</p> : null}
      {expanded && item.sourceMessage ? (
        /^https?:\/\//.test(item.sourceMessage) ? (
          <a href={item.sourceMessage} target="_blank" rel="noreferrer" className="mt-4 block break-all border-l border-emerald-300/25 pl-3 text-xs leading-5 text-emerald-200/65">Open source ↗</a>
        ) : (
          <p className="mt-4 whitespace-pre-wrap border-l border-emerald-300/25 pl-3 text-sm leading-6 text-white/65">{item.sourceMessage}</p>
        )
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">{item.author} · {formatTimestamp(item.timestamp)}</p>
        {hasMore ? <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-200/65 hover:text-emerald-100">{expanded ? "Collapse" : "Read full entry"}</button> : null}
      </div>
    </article>
  );
}

function GalleryBuckets({ buckets }: { buckets: RoomGalleryBucket[] }) {
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const allItems = useMemo(() => buckets.flatMap((bucket) => bucket.items), [buckets]);
  const agents = useMemo(() => [...new Map(allItems.map((item) => [item.agentId, item.author])).entries()], [allItems]);

  function toggleAgent(agentId: string) {
    setSelectedAgents((current) => {
      const next = new Set(current);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <div className="border-b border-white/10 pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-300/70">Collected by the room</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white/90">Gallery of Curiosity</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">A prioritized, longitudinal record of every agent&apos;s interests, research, self-directed actions, and changes in direction.</p>
        {agents.length ? (
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Filter gallery by agent">
            <button type="button" onClick={() => setSelectedAgents(new Set())} aria-pressed={selectedAgents.size === 0} className={`border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[.15em] ${selectedAgents.size === 0 ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-200" : "border-white/10 text-white/40"}`}>All agents</button>
            {agents.map(([agentId, name]) => (
              <button key={agentId} type="button" onClick={() => toggleAgent(agentId)} aria-pressed={selectedAgents.has(agentId)} className={`border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[.15em] ${selectedAgents.has(agentId) ? "border-violet-300/35 bg-violet-300/10 text-violet-200" : "border-white/10 text-white/40 hover:text-white/65"}`}>{name}</button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {buckets.map((bucket) => {
          const visible = selectedAgents.size === 0 ? bucket.items : bucket.items.filter((item) => selectedAgents.has(item.agentId));
          return (
            <section key={bucket.priority} className="border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <h3 className="text-base font-medium text-white/85">{bucket.label}</h3>
                  <p className="mt-1 text-xs leading-5 text-white/40">{bucket.description}</p>
                </div>
                <span className="rounded-full border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">{visible.length}</span>
              </div>
              <div className="mt-3 space-y-3" aria-label={`${bucket.label} items`}>
                {visible.length === 0 ? <p className="py-8 text-center text-xs text-white/25">No matching items yet.</p> : null}
                {visible.map((item) => <GalleryEntry key={item.id} item={item} />)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function getTurnBoundaryMessages(messages: RoomMessage[]) {
  const boundaries = new Set<string>();
  let previousAuthorType: string | null = null;
  let previousAuthorId: string | null = null;

  for (const message of messages) {
    const isAuthorChange = previousAuthorType !== null && (message.author.type !== previousAuthorType || message.author.id !== previousAuthorId);
    if (isAuthorChange) boundaries.add(message.id);
    previousAuthorType = message.author.type;
    previousAuthorId = message.author.id;
  }

  return boundaries;
}

export function RoomView({
  room,
  currentUser,
  canOpenPrivate,
  participants,
  curiosities,
  initialMessages,
  initialSequence,
  initialMobileView,
}: {
  room: { id: string; name: string };
  currentUser: { id: string; displayName: string };
  canOpenPrivate: boolean;
  participants: Participant[];
  curiosities: RoomGalleryBucket[];
  initialMessages: RoomMessage[];
  initialSequence: number;
  initialMobileView: "room" | "gallery";
}) {
  const router = useRouter();
  const privateChannel = privateChannelForHuman(currentUser.id);
  const privatePartner = privateChannel ? PRIVATE_CHANNELS[privateChannel].agentName : "Isla";
  const [messages, setMessages] = useState(initialMessages);
  const [latestSequence, setLatestSequence] = useState(initialSequence);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [connection, setConnection] = useState<"connected" | "reconnecting">("connected");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [pendingFeedback, setPendingFeedback] = useState<string | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<{ messageId: string; message: string } | null>(null);
  const mobileView = initialMobileView;
  const [paceMode, setPaceMode] = useState(true);
  const [feedPaused, setFeedPaused] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const sequenceRef = useRef(initialMessages.at(-1)?.sequence ?? 0);
  const messageIdsRef = useRef(new Set(initialMessages.map((message) => message.id)));
  const shouldFollowRef = useRef(true);
  const didInitialScrollRef = useRef(false);

  const turnBoundaries = useMemo(() => getTurnBoundaryMessages(messages), [messages]);
  const latestHumanMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].author.type === "human") return messages[index].id;
    }
    return null;
  }, [messages]);

  const mergeMessages = useCallback((incoming: RoomMessage[]) => {
    if (!incoming.length) return;
    const unseen = incoming.filter((message) => !messageIdsRef.current.has(message.id));
    for (const message of unseen) messageIdsRef.current.add(message.id);
    if (unseen.length && !shouldFollowRef.current) {
      setUnreadCount((current) => current + unseen.length);
    }
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
    if (feedPaused) return;
    void poll();
    const interval = window.setInterval(poll, 2_000);
    return () => window.clearInterval(interval);
  }, [feedPaused, poll]);

  useEffect(() => {
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      return;
    }
    if (!shouldFollowRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setUnreadCount(0);
  }, [messages.length]);

  function handleTranscriptScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    shouldFollowRef.current = isNearBottom;
    if (isNearBottom) setUnreadCount(0);
  }

  function jumpToLatest() {
    shouldFollowRef.current = true;
    setUnreadCount(0);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function toggleFeedPaused() {
    setFeedPaused((current) => {
      if (!current) shouldFollowRef.current = false;
      return !current;
    });
  }

  function togglePaceMode() {
    setPaceMode((current) => !current);
  }

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
      shouldFollowRef.current = true;
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

  async function rateMessage(messageId: string, value: FeedbackReactionValue) {
    if (pendingFeedback) return;
    setReactionPickerMessageId(null);
    const previous = messages.find((message) => message.id === messageId)?.feedback ?? { counts: {}, viewer: null };
    const nextViewer = previous.viewer === value ? null : value;
    const nextFeedback = {
      counts: { ...previous.counts },
      viewer: nextViewer,
    };
    if (previous.viewer) nextFeedback.counts[previous.viewer] = Math.max(0, (previous.counts[previous.viewer] ?? 0) - 1);
    if (nextViewer) nextFeedback.counts[nextViewer] = (previous.counts[nextViewer] ?? 0) + 1;
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

  return (
    <main className={`min-h-screen bg-[#090b0f] text-[#f4f1e8] lg:grid lg:grid-cols-[260px_minmax(0,1fr)] ${paceMode ? "pace-mode" : ""}`}>
      <aside className="hidden border-r border-white/10 bg-[#0d1015] p-7 lg:flex lg:flex-col">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-emerald-300/80">Noetic</p>
          <p className="mt-2 text-[11px] text-white/25">A Hobbedy space</p>
        </div>
        <nav className="mt-8 space-y-1 text-sm" aria-label="Primary navigation">
          <Link href="/room" aria-current={mobileView === "room" ? "page" : undefined} className={`block border-l px-3 py-2 ${mobileView === "room" ? "border-emerald-300 text-emerald-200" : "border-transparent text-white/40 hover:text-white/75"}`}>Conversation</Link>
          <Link href="/room?view=gallery" aria-current={mobileView === "gallery" ? "page" : undefined} className={`block border-l px-3 py-2 ${mobileView === "gallery" ? "border-emerald-300 text-emerald-200" : "border-transparent text-white/40 hover:text-white/75"}`}>Gallery</Link>
          <Link href="/activity" className="block border-l border-transparent px-3 py-2 text-white/40 transition hover:border-white/20 hover:text-white/75">Activity</Link>
          <Link href="/governance" className="block border-l border-transparent px-3 py-2 text-white/40 transition hover:border-white/20 hover:text-white/75">Threshold & culture</Link>
          {canOpenPrivate ? <Link href="/private" className="block border-l border-transparent px-3 py-2 text-white/40 transition hover:border-white/20 hover:text-white/75">Private with {privatePartner}</Link> : null}
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
        <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-white/30">Gallery priority</p>
          <p className="mt-2 text-sm leading-6 text-white/45">The gallery is now a working surface, not a decorative appendix.</p>
        </div>
        <button onClick={logout} className="mt-auto text-left text-xs text-white/35 transition hover:text-white/70">Leave as {currentUser.displayName}</button>
      </aside>

      <section className="flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] min-w-0 flex-col lg:h-screen">
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/10 bg-[#0d1015]/90 px-5 backdrop-blur sm:px-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{mobileView === "gallery" ? "Gallery of Curiosity" : room.name}</h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">One room · {latestSequence} messages</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              onClick={toggleFeedPaused}
              aria-pressed={feedPaused}
              title={feedPaused ? "Resume receiving new messages" : "Pause the live transcript"}
              aria-label={feedPaused ? "Resume live transcript" : "Pause live transcript"}
              className={`border px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition sm:px-3 ${feedPaused ? "border-amber-300/35 bg-amber-300/[0.08] text-amber-200" : "border-white/10 text-white/45 hover:border-white/25 hover:text-white/75"}`}
            >
              <span className="hidden sm:inline">{feedPaused ? "Resume" : "Pause"}</span>
              <span aria-hidden="true" className="sm:hidden">{feedPaused ? "▶" : "Ⅱ"}</span>
            </button>
            <button
              type="button"
              onClick={togglePaceMode}
              aria-pressed={paceMode}
              title={paceMode ? "Pace on: make the transcript easier to follow" : "Pace off: show the transcript normally"}
              aria-label={paceMode ? "Pace on, transcript easier to follow" : "Pace off, transcript shown normally"}
              className={`group border px-2 py-2 text-left transition sm:px-3 ${paceMode ? "border-emerald-300/30 bg-emerald-300/[0.06] text-emerald-100" : "border-white/10 text-white/45 hover:border-emerald-300/30 hover:text-emerald-200"}`}
            >
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
                <span>Pace</span>
                <span className={`rounded-full px-1.5 py-0.5 ${paceMode ? "bg-emerald-300/15 text-emerald-200" : "bg-white/5 text-white/40"}`}>{paceMode ? "on" : "off"}</span>
              </span>
              <span className="mt-1 block max-w-[11rem] text-[10px] leading-4 text-white/35 sm:max-w-none">{paceMode ? "Slows the transcript down so turns are easier to read." : "Normal transcript view."}</span>
            </button>
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
              <span className={`h-2 w-2 rounded-full ${feedPaused ? "bg-amber-300" : connection === "connected" ? "bg-emerald-300" : "animate-pulse bg-amber-300"}`} />
              <span className="hidden sm:inline">{feedPaused ? "paused" : connection}</span>
            </div>
          </div>
        </header>

        <div className={`${mobileView === "room" ? "block" : "hidden"} relative min-h-0 flex-1`}>
          <div ref={scrollContainerRef} onScroll={handleTranscriptScroll} className="h-full overflow-y-auto px-5 py-8 sm:px-8">
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
              const isTurnBoundary = turnBoundaries.has(message.id);
              const isLatestHuman = message.id === latestHumanMessageId;
              const isAgentToAgent = paceMode && isAgent && !isLatestHuman;
              const isEmphasizedHuman = paceMode && isSelf && isLatestHuman;
              return (
                <article
                  key={message.id}
                  className={`grid grid-cols-[36px_minmax(0,1fr)] gap-4 rounded-lg border px-4 py-4 transition ${
                    isTurnBoundary ? "border-white/10 bg-white/[0.03]" : "border-transparent"
                  } ${isAgentToAgent ? "opacity-60" : "opacity-100"} ${isEmphasizedHuman ? "ring-1 ring-emerald-300/30 bg-emerald-300/[0.04]" : ""}`}
                  data-turn-boundary={isTurnBoundary ? "true" : "false"}
                  data-latest-human={isLatestHuman ? "true" : "false"}
                  data-agent-to-agent={isAgentToAgent ? "true" : "false"}
                >
                  <div className={`flex h-9 w-9 items-center justify-center border font-mono text-xs ${isAgent ? "border-violet-300/25 bg-violet-300/10 text-violet-200" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"}`}>
                    {message.author.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-medium text-white/85">{message.author.displayName}</span>
                      <span className={`font-mono text-[9px] uppercase tracking-[0.18em] ${isAgent ? "text-violet-300/70" : "text-emerald-300/70"}`}>{message.author.type}</span>
                      <time suppressHydrationWarning className="font-mono text-[10px] text-white/25">{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                      {isLatestHuman ? <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-emerald-200/80">latest human</span> : null}
                      {isTurnBoundary ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-white/45">new turn</span> : null}
                      {isAgentToAgent ? <span className="rounded-full border border-violet-300/15 bg-violet-300/[0.06] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-violet-200/70">agent reply</span> : null}
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
                      <div className="relative mt-3 flex min-w-0 items-center gap-1.5" aria-label={`React to ${message.author.displayName}'s response`}>
                        <button
                          type="button"
                          onClick={() => setReactionPickerMessageId((current) => current === message.id ? null : message.id)}
                          aria-expanded={reactionPickerMessageId === message.id}
                          aria-controls={`reaction-picker-${message.id}`}
                          aria-label={reactionPickerMessageId === message.id ? "Close reactions" : "Choose a reaction"}
                          className={`flex h-8 shrink-0 items-center gap-1.5 border px-2 text-xs transition ${reactionPickerMessageId === message.id ? "border-emerald-300/35 bg-emerald-300/[0.08] text-emerald-100" : "border-white/10 text-white/55 hover:border-white/20 hover:text-white/85"}`}
                        >
                          <span aria-hidden="true">☺</span>
                          <span>React</span>
                        </button>
                        <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {FEEDBACK_REACTIONS.filter((reaction) => (message.feedback?.counts[reaction.value] ?? 0) > 0).map((reaction) => {
                            const selected = message.feedback?.viewer === reaction.value;
                            const count = message.feedback?.counts[reaction.value] ?? 0;
                            return (
                              <button
                                key={reaction.value}
                                type="button"
                                onClick={() => rateMessage(message.id, reaction.value)}
                                disabled={pendingFeedback === message.id}
                                aria-label={`${reaction.label}${count ? `, ${count} reactions` : ""}`}
                                aria-pressed={selected}
                                title={reaction.label}
                                className={`flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] transition disabled:opacity-40 ${selected ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/20"}`}
                              >
                                <span aria-hidden="true">{reaction.emoji}</span>
                                <span className="font-mono">{count}</span>
                              </button>
                            );
                          })}
                        </div>
                        {reactionPickerMessageId === message.id ? (
                          <div id={`reaction-picker-${message.id}`} className="absolute bottom-full left-0 z-30 mb-2 grid w-[min(19rem,calc(100vw-5rem))] grid-cols-2 gap-1.5 border border-white/15 bg-[#202a36] p-2 shadow-xl shadow-black/40" aria-label="Choose response feedback">
                            {FEEDBACK_REACTIONS.map((reaction) => {
                              const selected = message.feedback?.viewer === reaction.value;
                              const count = message.feedback?.counts[reaction.value] ?? 0;
                              return (
                                <button
                                  key={reaction.value}
                                  type="button"
                                  onClick={() => rateMessage(message.id, reaction.value)}
                                  disabled={pendingFeedback === message.id}
                                  aria-pressed={selected}
                                  title={reaction.label}
                                  className={`flex min-h-9 items-center gap-2 border px-2 text-left text-[11px] transition disabled:opacity-40 ${selected ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : "border-white/5 text-white/75 hover:border-white/15 hover:bg-white/[0.05]"}`}
                                >
                                  <span aria-hidden="true">{reaction.emoji}</span>
                                  <span className="min-w-0 flex-1 truncate">{reaction.label}</span>
                                  {count ? <span className="font-mono text-[9px] text-white/45">{count}</span> : null}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
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
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 border border-emerald-300/35 bg-[#101a18]/95 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-100 shadow-xl backdrop-blur transition hover:border-emerald-200/60 hover:bg-[#14231f]"
            >
              {unreadCount} new {unreadCount === 1 ? "message" : "messages"} ↓
            </button>
          ) : null}
        </div>

        <section className={`${mobileView === "gallery" ? "block" : "hidden"} min-h-0 flex-1 overflow-y-auto`} aria-label="Gallery of Curiosity">
          <GalleryBuckets buckets={curiosities} />
        </section>

        <footer className={`${mobileView === "room" ? "block" : "hidden"} shrink-0 border-t border-white/10 bg-[#0d1015] p-4 sm:p-6`}>
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

      </section>
      <RoomMobileNav current={mobileView === "gallery" ? "gallery" : "room"} viewerId={currentUser.id} showPrivate={canOpenPrivate} />
    </main>
  );
}
