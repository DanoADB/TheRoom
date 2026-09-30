import { redirect } from "next/navigation";
import { getCurrentHuman } from "@/lib/human-auth";
import { prisma } from "@/lib/prisma";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentHuman()) redirect("/room");

  const users = await prisma.user.findMany({
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090b0f] px-5 py-12 text-[#f4f1e8]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(74,222,128,0.08),transparent_30%),radial-gradient(circle_at_80%_90%,rgba(96,165,250,0.08),transparent_35%)]" />
      <section className="relative w-full max-w-md border border-white/10 bg-[#11141a]/95 p-8 shadow-2xl shadow-black/40 sm:p-10">
        <div className="mb-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-emerald-300">Private channel</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Enter The Room</h1>
          <p className="mt-3 leading-7 text-white/50">Choose your identity and enter your access code.</p>
        </div>
        <LoginForm users={users} />
      </section>
    </main>
  );
}
