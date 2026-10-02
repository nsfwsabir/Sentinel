import ProviderTest from "./provider-test";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

async function getProviderStatus(): Promise<{ provider: string; mode?: string; warnings?: string[] }> {
  try {
    const r = await fetch(`${API}/v1/provider/status`, { cache: "no-store" });
    if (!r.ok) return { provider: "unknown" };
    return (await r.json()) as { provider: string; mode?: string; warnings?: string[] };
  } catch {
    return { provider: "unknown" };
  }
}

export default async function SettingsPage() {
  const status = await getProviderStatus();
  return (
    <div>
      <h1>Settings</h1>
      <div className="card" style={{ maxWidth: 560 }}>
        <p>API: <span className="mono">{process.env.SENTINEL_API_URL ?? "http://localhost:3001"}</span></p>
        <p className="muted">Thresholds: high 0.90 · review below 0.80 (configurable via API env).</p>
        <p className="muted">Approvals require admin basic auth. Judgment provider key stays server-side.</p>
      </div>
      <h2>Laya Judgment Provider</h2>
      <div className="card" style={{ maxWidth: 560 }}>
        <p>Provider: <span className="mono">{status.provider}</span>{status.mode && <> · Mode: <span className="mono">{status.mode}</span></>}</p>
        <p className="muted">Hosted (Laya Studio + your key) or self-hosted `laya-serve` via LAYA_API_URL. Sentinel never hosts Laya.</p>
        {(status.warnings ?? []).map((w) => (
          <p key={w} className="muted">{w}</p>
        ))}
        <ProviderTest />
      </div>
    </div>
  );
}
