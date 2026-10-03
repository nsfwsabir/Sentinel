import Link from "next/link";
import { Card, PageHeader, StatusPill, EmptyState } from "./components/ui";
import { Sparkline, AreaChart, Donut } from "./components/charts";

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

function hourlyBuckets(decisions: Decision[]) {
  const now = Date.now();
  const allow = new Array(24).fill(0);
  const review = new Array(24).fill(0);
  const block = new Array(24).fill(0);
  for (const d of decisions) {
    const h = Math.floor((now - new Date(d.createdAt).getTime()) / 3_600_000);
    if (h < 0 || h >= 24) continue;
    const i = 23 - h;
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

export default async function Overview() {
  const [metrics, decisions] = await Promise.all([
    getJSON<Metrics>("/v1/metrics", { decisions_total: 0, allow_total: 0, review_total: 0, block_total: 0, pending_total: 0 }),
    getJSON<Decision[]>("/v1/decisions?limit=500", []),
  ]);
  const buckets = hourlyBuckets(decisions);
  const recent = decisions.slice(0, 8);
  const cards = [
    { label: "Decisions", value: metrics.decisions_total, stroke: "#111111", spark: buckets.allow.map((v, i) => v + buckets.review[i] + buckets.block[i]) },
    { label: "Allowed", value: metrics.allow_total, stroke: "#15803d", spark: buckets.allow },
    { label: "Review", value: metrics.review_total, stroke: "#b45309", spark: buckets.review },
    { label: "Blocked", value: metrics.block_total, stroke: "#b91c1c", spark: buckets.block },
  ];

  return (
    <div>
      <PageHeader title="Overview" subtitle="Runtime decisions across your agents." />
      {decisions.length === 0 ? (
        <EmptyState
          title="No decisions yet."
          body="Connect an agent and submit your first action to start evaluating runtime policy."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-xl border border-neutral-200 bg-white px-5 py-4">
                <p className="text-[13px] text-neutral-500">{c.label}</p>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <p className="text-[28px] font-semibold leading-none text-neutral-900">{c.value}</p>
                  <Sparkline values={c.spark} stroke={c.stroke} />
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card title="Decisions over time" subtitle="Last 24 hours, by outcome" className="xl:col-span-2">
              <AreaChart series={buckets} />
              <div className="mt-2 flex gap-4 text-xs text-neutral-500">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-[#15803d]" />Allow</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-[#b45309]" />Review</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-[#b91c1c]" />Block</span>
              </div>
            </Card>
            <Card title="Decision mix" subtitle="All recorded decisions">
              <Donut allow={metrics.allow_total} review={metrics.review_total} block={metrics.block_total} />
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card
              title="Recent decisions"
              className="xl:col-span-2"
              action={<Link href="/decisions" className="text-[13px] font-medium text-neutral-900 underline">View all</Link>}
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-neutral-500">
                      <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Time</th>
                      <th className="border-b border-neutral-200 py-2 pr-3 font-medium">ID</th>
                      <th className="border-b border-neutral-200 py-2 font-medium">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((d) => (
                      <tr key={d.id}>
                        <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs text-neutral-500">{timeAgo(d.createdAt)}</td>
                        <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">
                          <Link href={`/decisions/${d.id}`} className="underline decoration-neutral-300 underline-offset-2">{d.id}</Link>
                        </td>
                        <td className="border-b border-neutral-100 py-2"><StatusPill value={d.outcome} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Recent activity" subtitle="Latest evaluations">
              <ul className="flex flex-col gap-3">
                {recent.slice(0, 6).map((d) => (
                  <li key={d.id} className="flex gap-2.5 text-[13px]">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${d.outcome === "allow" ? "bg-[#15803d]" : d.outcome === "review" ? "bg-[#b45309]" : "bg-[#b91c1c]"}`} />
                    <span className="text-neutral-600">
                      <span className="font-medium capitalize text-neutral-900">{d.outcome}</span>
                      {d.action ? ` ${d.action.toolId} by ${d.action.agentId}` : ` ${d.actionId}`}
                      <br />
                      <span className="text-xs text-neutral-400">{timeAgo(d.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
