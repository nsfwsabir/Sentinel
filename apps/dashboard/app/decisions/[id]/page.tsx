import Link from "next/link";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

export default async function DecisionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await fetch(`${API}/v1/decisions/${id}`, { cache: "no-store" });
  if (!r.ok) return <div><Link href="/decisions">← Decisions</Link><p>Not found.</p></div>;
  const d = (await r.json()) as {
    id: string; outcome: string; reason: string; confidence: number;
    policyIds: string[]; judgments: { question: string; answer: unknown; confidence?: number }[];
    action?: { toolId: string; agentId: string; arguments: unknown };
  };
  return (
    <div>
      <Link href="/decisions">← Decisions</Link>
      <h1><span className={`badge ${d.outcome}`}>{d.outcome.toUpperCase()}</span></h1>
      <p className="mono">{d.action?.toolId} · {d.action?.agentId} · {d.id}</p>
      <h3>Action</h3>
      <pre className="mono">{JSON.stringify(d.action?.arguments ?? {}, null, 2)}</pre>
      <h3>Policies</h3>
      <ul>{d.policyIds.map((p) => <li key={p} className="mono">{p}</li>)}</ul>
      <h3>Judgments</h3>
      <table><thead><tr><th>Question</th><th>Answer</th><th>Confidence</th></tr></thead>
      <tbody>{d.judgments.map((j) => (
        <tr key={j.question}><td className="mono">{j.question}</td><td className="mono">{String(j.answer).toUpperCase()}</td><td className="mono">{j.confidence != null ? `${Math.round(j.confidence * 100)}%` : "—"}</td></tr>
      ))}</tbody></table>
      <h3>Final decision</h3>
      <p><span className={`badge ${d.outcome}`}>{d.outcome.toUpperCase()}</span></p>
      <p>Reason: {d.reason}</p>
    </div>
  );
}
