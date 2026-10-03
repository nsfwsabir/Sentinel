import Link from "next/link";
import { Card, PageHeader, StatusPill, EmptyState } from "../components/ui";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

async function getDecisions() {
  try {
    const r = await fetch(`${API}/v1/decisions`, { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as { id: string; actionId: string; outcome: string; reason: string; createdAt: string }[];
  } catch {
    return [];
  }
}

export default async function DecisionsPage() {
  const decisions = await getDecisions();
  return (
    <div>
      <PageHeader title="Decisions" subtitle="Every evaluated action, newest first." />
      {decisions.length === 0 ? (
        <EmptyState title="No decisions yet." body="Submit an action from an agent or the simulator." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Time</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">ID</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Decision</th>
                  <th className="border-b border-neutral-200 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => (
                  <tr key={d.id} className="hover:bg-neutral-50">
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs text-neutral-500">{new Date(d.createdAt).toLocaleTimeString()}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">
                      <Link href={`/decisions/${d.id}`} className="underline decoration-neutral-300 underline-offset-2">{d.id}</Link>
                    </td>
                    <td className="border-b border-neutral-100 py-2 pr-3"><StatusPill value={d.outcome} /></td>
                    <td className="border-b border-neutral-100 py-2 text-neutral-600">{d.reason}</td>
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
