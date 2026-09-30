"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ActivityRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, [router]);

  return null;
}
