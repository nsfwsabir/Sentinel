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
                <tr className="text-left text-neutral-500 dark:text-neutral-400">
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium dark:border-neutral-800">Time</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium dark:border-neutral-800">Source</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium dark:border-neutral-800">Rule</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium dark:border-neutral-800">Priority</th>
                  <th className="border-b border-neutral-200 py-2 font-medium dark:border-neutral-800">Summary</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">{new Date(s.createdAt).toLocaleTimeString()}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs dark:border-neutral-800">{s.source}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 text-neutral-900 dark:border-neutral-800 dark:text-neutral-100">{s.rule}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs dark:border-neutral-800">{s.priority}</td>
                    <td className="border-b border-neutral-100 py-2 text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">{s.summary}</td>
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
