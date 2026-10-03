"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  return (
    <nav className="flex flex-col gap-5 overflow-y-auto border-r border-neutral-200 bg-white px-3 py-5" aria-label="Primary">
      <Link href="/" className="flex items-center gap-2.5 px-2 pb-4">
        <Image src="/logo.png" alt="Sentinel logo" width={30} height={30} className="rounded-md" priority />
        <span className="text-xl font-semibold tracking-tight text-neutral-900">Sentinel</span>
      </Link>
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-400">{g.label}</p>
          <div className="flex flex-col gap-0.5">
            {g.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active(l.href, path) ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 text-sm ${
                  active(l.href, path)
                    ? "bg-neutral-900 font-medium text-white"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
