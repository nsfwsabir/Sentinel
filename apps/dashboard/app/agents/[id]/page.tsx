import Link from "next/link";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

export default async function AgentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let agent: { id: string; name: string; status: string; description?: string; recentActions?: { id: string; toolId: string }[] } | null = null;
  try {
    const r = await fetch(`${API}/v1/agents/${id}`, { cache: "no-store" });
    if (r.ok) agent = await r.json();
  } catch {
    agent = null;
  }
  if (!agent) return <div><Link href="/agents">← Agents</Link><p>Not found.</p></div>;
  return (
    <div>
      <Link href="/agents">← Agents</Link>
      <h1>{agent.name}</h1>
      <p className="mono">{agent.id} · {agent.status}</p>
      {agent.description && <p className="muted">{agent.description}</p>}
      <h3>Recent activity</h3>
      {(agent.recentActions ?? []).length === 0 ? (
        <p className="muted">No actions yet.</p>
      ) : (
        <table><thead><tr><th>Action</th><th>Tool</th></tr></thead>
        <tbody>{agent.recentActions!.map((a) => (
          <tr key={a.id}><td className="mono">{a.id}</td><td className="mono">{a.toolId}</td></tr>
        ))}</tbody></table>
      )}
    </div>
  );
}
