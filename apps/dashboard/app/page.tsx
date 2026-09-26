const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

async function getDecisions() {
  try {
    const r = await fetch(`${API}/v1/decisions`, { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as { outcome: string }[];
  } catch {
    return [];
  }
}

export default async function Overview() {
  const decisions = await getDecisions();
  const allow = decisions.filter((d) => d.outcome === "allow").length;
  const review = decisions.filter((d) => d.outcome === "review").length;
  const block = decisions.filter((d) => d.outcome === "block").length;
  return (
    <div>
      <h1>Overview</h1>
      <p className="muted">Runtime decisions across your agents.</p>
      {decisions.length === 0 ? (
        <div className="card">
          <p>No decisions yet.</p>
          <p className="muted">Connect an agent and submit your first action to start evaluating runtime policy.</p>
        </div>
      ) : (
        <div className="row">
          <div className="card"><div className="muted">Decisions</div><div className="metric">{decisions.length}</div></div>
          <div className="card"><div className="muted">Allowed</div><div className="metric">{allow}</div></div>
          <div className="card"><div className="muted">Review</div><div className="metric">{review}</div></div>
          <div className="card"><div className="muted">Blocked</div><div className="metric">{block}</div></div>
        </div>
      )}
    </div>
  );
}
