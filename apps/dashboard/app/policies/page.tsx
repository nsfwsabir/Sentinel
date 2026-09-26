const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

async function getPolicies() {
  try {
    const r = await fetch(`${API}/v1/policies`, { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as { id: string; name: string; description: string; mode: string; enabled: boolean }[];
  } catch {
    return [];
  }
}

export default async function PoliciesPage() {
  const policies = await getPolicies();
  return (
    <div>
      <h1>Policies</h1>
      <table><thead><tr><th>Name</th><th>Description</th><th>Enforcement</th><th>Enabled</th></tr></thead>
      <tbody>{policies.map((p) => (
        <tr key={p.id}><td>{p.name}</td><td className="muted">{p.description}</td>
        <td className="mono">{p.mode}</td><td className="mono">{String(p.enabled)}</td></tr>
      ))}</tbody></table>
    </div>
  );
}
