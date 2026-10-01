const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

async function getTools() {
  try {
    const r = await fetch(`${API}/v1/tools`, { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as { id: string; name: string; description: string; riskLevel: string }[];
  } catch {
    return [];
  }
}

export default async function ToolsPage() {
  const tools = await getTools();
  return (
    <div>
      <h1>Tools</h1>
      {tools.length === 0 ? (
        <p className="muted">No tools registered.</p>
      ) : (
        <table><thead><tr><th>Tool</th><th>Description</th><th>Risk</th></tr></thead>
        <tbody>{tools.map((t) => (
          <tr key={t.id}><td className="mono">{t.name}</td><td className="muted">{t.description}</td>
          <td className="mono">{t.riskLevel}</td></tr>
        ))}</tbody></table>
      )}
    </div>
  );
}
