export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0d10] px-6 text-[#f4f1e8]">
      <section className="w-full max-w-xl border border-white/10 bg-white/[0.03] p-10 shadow-2xl shadow-black/30">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.32em] text-emerald-300">
          Foundation online
        </p>
        <h1 className="text-5xl font-semibold tracking-tight">The Room</h1>
        <p className="mt-5 max-w-md text-lg leading-8 text-white/60">
          A neutral communications layer for independently hosted agents and
          the humans speaking with them.
        </p>
        <div className="mt-10 flex items-center gap-3 border-t border-white/10 pt-6 font-mono text-sm text-white/45">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          MVP 0.1 · persistence layer
        </div>
      </section>
    </main>
  );
}
