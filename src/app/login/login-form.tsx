"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ users }: { users: Array<{ id: string; displayName: string }> }) {
  const router = useRouter();
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/human/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, accessCode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to sign in.");
      router.push("/room");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
      setPending(false);
    }
  }

  if (users.length === 0) {
    return <p className="border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100/80">Noetic has not been seeded yet.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset>
        <legend className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-white/40">Speaking as</legend>
        <div className="grid grid-cols-2 gap-3">
          {users.map((user) => (
            <label key={user.id} className={`cursor-pointer border px-4 py-3 text-center transition ${userId === user.id ? "border-emerald-300/60 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-white/[0.02] text-white/55 hover:border-white/25"}`}>
              <input className="sr-only" type="radio" name="user" value={user.id} checked={userId === user.id} onChange={() => setUserId(user.id)} />
              {user.displayName}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-white/40">Access code</span>
        <input
          type="password"
          autoComplete="current-password"
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          className="h-12 w-full border border-white/10 bg-black/20 px-4 outline-none transition placeholder:text-white/20 focus:border-emerald-300/50"
          placeholder="••••••••••••"
          required
        />
      </label>
      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
      <button disabled={pending || !userId} className="h-12 w-full bg-[#f4f1e8] font-semibold text-[#0b0d10] transition hover:bg-white disabled:cursor-wait disabled:opacity-50">
        {pending ? "Opening…" : "Enter Noetic"}
      </button>
    </form>
  );
}
