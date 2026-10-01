const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

async function getJSON<T>(path: string): Promise<T[]> {
  try {
    const r = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as T[];
  } catch {
    return [];
  }
}

type Agent = { id: string; name: string; status: string; description?: string };

export default async function AgentsPage() {
  const agents = await getJSON<Agent>("/v1/agents");
  return (
    <div>
      <h1>Agents</h1>
      {agents.length === 0 ? (
        <p className="muted">No agents registered.</p>
      ) : (
        <table><thead><tr><th>Agent</th><th>ID</th><th>Status</th></tr></thead>
        <tbody>{agents.map((a) => (
          <tr key={a.id}><td><a href={`/agents/${a.id}`}>{a.name}</a></td>
          <td className="mono">{a.id}</td><td className="mono">{a.status}</td></tr>
        ))}</tbody></table>
      )}
    </div>
  );
}
