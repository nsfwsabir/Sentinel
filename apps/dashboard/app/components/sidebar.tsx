"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const GROUPS: { label: string; links: { href: string; label: string }[] }[] = [
  { label: "Monitor", links: [
    { href: "/", label: "Overview" },
    { href: "/decisions", label: "Decisions" },
    { href: "/approvals", label: "Approvals" },
    { href: "/signals", label: "Signals" },
  ]},
  { label: "Manage", links: [
    { href: "/policies", label: "Policies" },
    { href: "/agents", label: "Agents" },
    { href: "/tools", label: "Tools" },
  ]},
  { label: "Lab", links: [{ href: "/simulate", label: "Simulate" }] },
  { label: "System", links: [{ href: "/settings", label: "Settings" }] },
];

function active(href: string, path: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export default function Sidebar() {
  const path = usePathname();
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/approvals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setPending(Array.isArray(j) ? j.length : null))
      .catch(() => setPending(null));
  }, [path]);
  return (
    <nav className="flex flex-col gap-6 overflow-y-auto border-r border-neutral-200 bg-folio px-3 py-5" aria-label="Primary">
      <Link href="/" className="flex items-center gap-2.5 px-2 pb-2">
        <Image src="/logo.png" alt="Sentinel logo" width={30} height={30} className="rounded-md" priority />
        <span className="text-[22px] font-bold tracking-tight text-ink">Sentinel</span>
      </Link>
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="px-2.5 pb-1 text-sm font-semibold text-neutral-800">{g.label}</p>
          <div className="flex flex-col gap-px">
            {g.links.map((l) => {
              const isActive = active(l.href, path);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm ${
                    isActive
                      ? "bg-white font-bold text-ink shadow-[inset_3px_0_0_0_#0a0a0a]"
                      : "text-neutral-600 hover:bg-white hover:text-ink"
                  }`}
                >
                  {l.label}
                  {l.href === "/approvals" && pending !== null && pending > 0 && (
                    <span key={pending} className="queue-tick rounded-[3px] px-1.5 py-px font-mono text-[11px] font-semibold text-review">
                      {pending}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
