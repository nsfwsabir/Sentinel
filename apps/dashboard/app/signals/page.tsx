import { Card, PageHeader, EmptyState } from "../components/ui";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

async function getSignals() {
  try {
    const r = await fetch(`${API}/v1/signals`, { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as { id: string; source: string; rule: string; priority: string; summary: string; createdAt: string }[];
  } catch {
    return [];
  }
}

export default async function SignalsPage() {
  const signals = await getSignals();
  return (
    <div>
      <PageHeader title="Signals" subtitle="External detection evidence (e.g. Falco). Signals never auto-decide." />
      {signals.length === 0 ? (
        <EmptyState title="No signals yet." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Time</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Source</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Rule</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Priority</th>
                  <th className="border-b border-neutral-200 py-2 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.id} className="hover:bg-neutral-50">
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs text-neutral-500">{new Date(s.createdAt).toLocaleTimeString()}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">{s.source}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 text-neutral-900">{s.rule}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">{s.priority}</td>
                    <td className="border-b border-neutral-100 py-2 text-neutral-600">{s.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
