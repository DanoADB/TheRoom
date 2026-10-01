"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RoomRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, [router]);

  return null;
}
