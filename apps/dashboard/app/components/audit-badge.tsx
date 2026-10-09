"use client";

import { useEffect, useState } from "react";

type Verify = { ok: boolean; checked: number; unchained: number; bridged: string[]; firstBadId?: string };

export function AuditBadge() {
  const [v, setV] = useState<Verify | null>(null);
  useEffect(() => {
    fetch("/api/audit", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setV(j))
      .catch(() => setV(null));
  }, []);
  if (!v) return null;
  const tone = v.ok
    ? "border-green-700/40 bg-green-50 text-green-800 dark:border-green-500/40 dark:bg-green-950 dark:text-green-400"
    : "border-red-700/40 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-950 dark:text-red-400";
  const label = v.ok
    ? `Audit chain OK · ${v.checked} verified`
    : `Audit chain BROKEN${v.firstBadId ? ` · ${v.firstBadId}` : ""}`;
  return (
    <span
      title={v.ok ? `bridged checkpoints: ${v.bridged.length}, pre-chain rows: ${v.unchained}` : "hash mismatch — investigate before trusting history"}
      className={`inline-block rounded-[3px] border-2 px-1.5 py-px font-mono text-[11px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}
