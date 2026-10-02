export default function SettingsPage() {
  return (
    <div>
      <h1>Settings</h1>
      <div className="card" style={{ maxWidth: 560 }}>
        <p>API: <span className="mono">{process.env.SENTINEL_API_URL ?? "http://localhost:3001"}</span></p>
        <p className="muted">Thresholds: high 0.90 · review below 0.80 (configurable via API env).</p>
        <p className="muted">Approvals require admin basic auth. Judgment provider key stays server-side.</p>
      </div>
    </div>
  );
}
