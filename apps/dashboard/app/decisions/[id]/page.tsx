import Link from "next/link";
import { Card, StatusPill } from "../../components/ui";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

export default async function DecisionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await fetch(`${API}/v1/decisions/${id}`, { cache: "no-store" });
  if (!r.ok) {
    return (
      <div>
        <Link href="/decisions" className="text-sm text-neutral-500 hover:text-neutral-900">← Decisions</Link>
        <p className="mt-4">Not found.</p>
      </div>
    );
  }
  const d = (await r.json()) as {
    id: string; outcome: string; reason: string; confidence: number;
    policyIds: string[]; judgments: { question: string; answer: unknown; confidence?: number }[];
    action?: { toolId: string; agentId: string; arguments: unknown };
  };
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <Link href="/decisions" className="text-sm text-neutral-500 hover:text-neutral-900">← Decisions</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <StatusPill value={d.outcome} />
          <h1 className="font-mono text-lg text-neutral-900">{d.action?.toolId}</h1>
        </div>
        <p className="mt-1 font-mono text-xs text-neutral-500">{d.action?.agentId} · {d.id}</p>
      </div>
      <Card title="Action">
        <pre className="overflow-auto rounded-lg bg-neutral-100 p-3 font-mono text-xs">{JSON.stringify(d.action?.arguments ?? {}, null, 2)}</pre>
      </Card>
      <Card title="Policies">
        {d.policyIds.length === 0 ? (
          <p className="text-[13px] text-neutral-500">No policies matched.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {d.policyIds.map((p) => (
              <li key={p} className="font-mono text-xs text-neutral-700">{p}</li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Judgments">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Question</th>
              <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Answer</th>
              <th className="border-b border-neutral-200 py-2 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {d.judgments.map((j) => (
              <tr key={j.question}>
                <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">{j.question}</td>
                <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">{String(j.answer).toUpperCase()}</td>
                <td className="border-b border-neutral-100 py-2 font-mono text-xs">{j.confidence != null ? `${Math.round(j.confidence * 100)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Final decision">
        <div className="flex items-center gap-3">
          <StatusPill value={d.outcome} />
          <p className="text-sm text-neutral-600">{d.reason}</p>
        </div>
      </Card>
    </div>
  );
}
