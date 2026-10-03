"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Hit = { label: string; sub: string; href: string };

export default function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  async function search(value: string) {
    setQ(value);
    const needle = value.trim().toLowerCase();
    if (needle.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    try {
      const [decisions, policies] = await Promise.all([
        fetch("/api/decisions").then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch("/api/policies").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      const out: Hit[] = [];
      for (const d of (decisions ?? []) as { id: string; outcome: string }[]) {
        if (d.id.toLowerCase().includes(needle)) {
          out.push({ label: d.id, sub: `Decision · ${d.outcome}`, href: `/decisions/${d.id}` });
        }
      }
      for (const p of (policies ?? []) as { id: string; name: string }[]) {
        if (p.id.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)) {
          out.push({ label: p.name, sub: `Policy · ${p.id}`, href: "/policies" });
        }
      }
      setHits(out.slice(0, 8));
      setOpen(true);
    } catch {
      setHits([]);
    }
  }

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <input
        value={q}
        onChange={(e) => search(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits.length > 0) go(hits[0].href);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search by decision or policy ID…"
        aria-label="Search decisions and policies by ID"
        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          {hits.map((h) => (
            <li key={h.href + h.label}>
              <button
                onClick={() => go(h.href)}
                className="flex w-full flex-col bg-white px-3 py-2 text-left hover:bg-neutral-50"
              >
                <span className="font-mono text-[12.5px] text-neutral-900">{h.label}</span>
                <span className="text-xs text-neutral-500">{h.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
