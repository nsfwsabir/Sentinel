"use client";
import { useEffect, useState } from "react";

type Policy = { id: string; name: string; description: string; mode: string; enabled: boolean };

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [name, setName] = useState("Production deletion");
  const [description, setDescription] = useState("Production resources may not be deleted without human approval.");
  const [mode, setMode] = useState("review");
  const [error, setError] = useState("");

  async function load() {
    const list = await fetch("/api/policies", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    setPolicies(list);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setError("");
    const r = await fetch("/api/policies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: `pol_${Date.now().toString(36)}`,
        name,
        description,
        severity: "high",
        mode,
        enabled: true,
        version: 1,
      }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setError((b as { error?: string }).error ?? "save failed");
      return;
    }
    window.location.reload();
  }

  return (
    <div>
      <h1>Policies</h1>
      {policies.length > 0 && (
        <table><thead><tr><th>Name</th><th>Description</th><th>Enforcement</th><th>Enabled</th></tr></thead>
        <tbody>{policies.map((p) => (
          <tr key={p.id}><td>{p.name}</td><td className="muted">{p.description}</td>
          <td className="mono">{p.mode}</td><td className="mono">{String(p.enabled)}</td></tr>
        ))}</tbody></table>
      )}
      <h2>New policy</h2>
      <div className="card" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        {error && <p>{error}</p>}
        <label>Policy name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Description<textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label>Enforcement<select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="block">Block</option>
          <option value="review">Require approval</option>
          <option value="audit">Audit only</option>
        </select></label>
        <div><button onClick={save}>Save policy</button></div>
      </div>
    </div>
  );
}
