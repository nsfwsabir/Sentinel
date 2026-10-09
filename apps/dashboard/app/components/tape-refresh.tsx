"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders server components on an interval so the verdict tape tracks
// new rulings. Skips hidden tabs; the queue-tick flash already marks rows
// that changed, so no extra motion here.
export function TapeRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
