import Link from "next/link";

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
      <h1>Decisions</h1>
      <table>
        <thead><tr><th>Time</th><th>ID</th><th>Decision</th><th>Reason</th></tr></thead>
        <tbody>
          {decisions.map((d) => (
            <tr key={d.id}>
              <td className="mono">{new Date(d.createdAt).toLocaleTimeString()}</td>
              <td className="mono"><Link href={`/decisions/${d.id}`}>{d.id}</Link></td>
              <td><span className={`badge ${d.outcome}`}>{d.outcome.toUpperCase()}</span></td>
              <td className="muted">{d.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
