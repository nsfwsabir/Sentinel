import Link from "next/link";
import { Card, PageHeader, StatusPill, EmptyState } from "./components/ui";
import { AuditBadge } from "./components/audit-badge";
import { TapeRefresh } from "./components/tape-refresh";
import { AreaChart, Donut } from "./components/charts";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

type Decision = {
  id: string;
  actionId: string;
  outcome: "allow" | "review" | "block";
  reason: string;
  createdAt: string;
  action?: { agentId: string; toolId: string };
};

type Metrics = {
  decisions_total: number;
  allow_total: number;
  review_total: number;
  block_total: number;
  pending_total: number;
};

async function getJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

const RANGES = [
  { id: "24h", label: "24h", windowMs: 24 * 3_600_000 },
  { id: "7d", label: "7d", windowMs: 7 * 24 * 3_600_000 },
  { id: "all", label: "All", windowMs: Number.POSITIVE_INFINITY },
] as const;

function bucketed(decisions: Decision[], windowMs: number) {
  const now = Date.now();
  const N = 24;
  const allow = new Array(N).fill(0);
  const review = new Array(N).fill(0);
  const block = new Array(N).fill(0);
  for (const d of decisions) {
    const age = now - new Date(d.createdAt).getTime();
    if (age < 0 || age >= windowMs) continue;
    const i = Number.isFinite(windowMs) ? N - 1 - Math.floor((age / windowMs) * N) : N - 1;
    if (d.outcome === "allow") allow[i] += 1;
    else if (d.outcome === "review") review[i] += 1;
    else if (d.outcome === "block") block[i] += 1;
  }
  return { allow, review, block };
}

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const active = RANGES.find((r) => r.id === range) ?? RANGES[0];
  const [metrics, decisions] = await Promise.all([
    getJSON<Metrics>("/v1/metrics", { decisions_total: 0, allow_total: 0, review_total: 0, block_total: 0, pending_total: 0 }),
    getJSON<Decision[]>("/v1/decisions?limit=500", []),
  ]);
  const buckets = bucketed(decisions, active.windowMs);
  const recent = decisions.slice(0, 8);
  const spine: Record<string, string> = { allow: "bg-allow", review: "bg-review", block: "bg-block" };
  const docketLine =
    decisions.length === 0
      ? "No rulings handed down yet."
      : `${decisions.length} ${decisions.length === 1 ? "ruling" : "rulings"} on record${
          metrics.pending_total > 0
            ? `, ${metrics.pending_total} waiting on a human`
            : ", queue clear"
        }.`;

  return (
    <div>
      <PageHeader title="Overview" subtitle={docketLine} action={<AuditBadge />} />
      {decisions.length === 0 ? (
        <EmptyState
          title="No decisions yet."
          body="Connect an agent and submit your first action to start evaluating runtime policy."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-1 gap-4 border-y-2 border-ink py-5 sm:grid-cols-3 sm:gap-6 dark:border-neutral-100">
            {[
              { label: "Blocked", value: metrics.block_total, color: "text-block" },
              { label: "Waiting on a human", value: metrics.pending_total, color: "text-review" },
              { label: "Allowed", value: metrics.allow_total, color: "text-allow" },
            ].map((f) => (
              <div key={f.label}>
                <dt className="text-sm text-neutral-500 dark:text-neutral-400">{f.label}</dt>
                <dd className={`mt-1 font-mono text-[56px] font-semibold leading-none tracking-tight ${f.color}`}>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
          {metrics.pending_total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink px-5 py-3.5 dark:bg-neutral-100">
              <p className="text-sm font-medium text-white dark:text-ink">
                {metrics.pending_total} {metrics.pending_total === 1 ? "decision is" : "decisions are"} waiting for a ruling.
              </p>
              <Link href="/approvals" className="rounded-[3px] bg-white px-3 py-1.5 text-[13px] font-bold text-ink dark:bg-ink dark:text-white">
                Review the queue
              </Link>
            </div>
          )}
          <section aria-label="Latest rulings">
            <TapeRefresh />
            <div className="flex items-baseline justify-between gap-4 pb-2">
              <h2 className="text-[15px] font-bold tracking-tight text-ink dark:text-neutral-50">Latest rulings</h2>
              <div className="flex items-baseline gap-3">
                <span className="text-xs text-neutral-400 dark:text-neutral-500">Auto-refreshes</span>
                <Link href="/decisions" className="text-[13px] font-medium text-ink underline dark:text-neutral-50">View all</Link>
              </div>
            </div>
            <ol className="border-t border-neutral-200 dark:border-neutral-800">
              {recent.map((d) => (
                <li key={d.id} className="flex items-center gap-4 border-b border-neutral-200 py-2.5 dark:border-neutral-800">
                  <span className={`w-1 shrink-0 self-stretch ${spine[d.outcome] ?? "bg-neutral-300"}`} aria-hidden="true" />
                  <span className="w-20 shrink-0 font-mono text-xs text-neutral-500 dark:text-neutral-400">{timeAgo(d.createdAt)}</span>
                  <span className="min-w-0 flex-1">
                    <Link href={`/decisions/${d.id}`} className="font-mono text-xs text-ink underline decoration-neutral-300 underline-offset-2 dark:text-neutral-50 dark:decoration-neutral-600">
                      {d.id}
                    </Link>
                    <span className="block truncate text-[13px] text-neutral-500 dark:text-neutral-400">
                      {d.action ? `${d.action.toolId} by ${d.action.agentId}` : d.reason}
                    </span>
                  </span>
                  <StatusPill value={d.outcome} />
                </li>
              ))}
            </ol>
          </section>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card
              title="Decisions over time"
              subtitle={active.id === "all" ? "All recorded decisions, by outcome" : `Last ${active.label}, by outcome`}
              className="xl:col-span-2"
              action={
                <div className="flex gap-1" role="group" aria-label="Time range">
                  {RANGES.map((r) => (
                    <Link
                      key={r.id}
                      href={r.id === "24h" ? "/" : `/?range=${r.id}`}
                      aria-current={r.id === active.id ? "true" : undefined}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        r.id === active.id
                          ? "bg-ink text-white dark:bg-neutral-100 dark:text-ink"
                          : "text-neutral-500 hover:bg-neutral-100 hover:text-ink dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
                      }`}
                    >
                      {r.label}
                    </Link>
                  ))}
                </div>
              }
            >
              <AreaChart series={buckets} label={`Decisions over ${active.id === "all" ? "all time" : `the last ${active.label}`}`} />
              <div className="mt-2 flex gap-4 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-[#15803d]" />Allow</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-[#b45309]" />Review</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-[#b91c1c]" />Block</span>
              </div>
            </Card>
            <Card title="Decision mix" subtitle="All recorded decisions">
              <Donut allow={metrics.allow_total} review={metrics.review_total} block={metrics.block_total} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
