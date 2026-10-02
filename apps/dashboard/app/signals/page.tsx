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
      <h1>Signals</h1>
      <p className="muted">External detection evidence (e.g. Falco). Signals never auto-decide.</p>
      {signals.length === 0 ? (
        <p className="muted">No signals yet.</p>
      ) : (
        <table><thead><tr><th>Time</th><th>Source</th><th>Rule</th><th>Priority</th><th>Summary</th></tr></thead>
        <tbody>{signals.map((s) => (
          <tr key={s.id}>
            <td className="mono">{new Date(s.createdAt).toLocaleTimeString()}</td>
            <td className="mono">{s.source}</td>
            <td>{s.rule}</td>
            <td className="mono">{s.priority}</td>
            <td className="muted">{s.summary}</td>
          </tr>
        ))}</tbody></table>
      )}
    </div>
  );
}
