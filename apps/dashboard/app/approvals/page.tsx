const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

async function getApprovals() {
  try {
    const r = await fetch(`${API}/v1/approvals`, { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as { id: string; reason: string }[];
  } catch {
    return [];
  }
}

export default async function ApprovalsPage() {
  const items = await getApprovals();
  return (
    <div>
      <h1>Pending approval</h1>
      {items.length === 0 ? <p className="muted">No pending approvals.</p> : (
        <table><thead><tr><th>Decision</th><th>Reason</th></tr></thead>
        <tbody>{items.map((d) => (
          <tr key={d.id}><td className="mono">{d.id}</td><td className="muted">{d.reason}</td></tr>
        ))}</tbody></table>
      )}
    </div>
  );
}
