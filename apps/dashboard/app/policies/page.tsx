"use client";
import { useEffect, useState } from "react";
import { Card, PageHeader } from "../components/ui";

type Policy = { id: string; name: string; description: string; mode: string; enabled: boolean; version: number; scope?: string; agentIds?: string[] };
type PolicyVersion = { version: number; name: string; description: string; mode: string; enabled: boolean; createdAt: string };

function field(label: string, children: React.ReactNode) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-neutral-900">
      {label}
      {children}
    </label>
  );
}

const inputCls = "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-normal text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none";

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [name, setName] = useState("Production deletion");
  const [description, setDescription] = useState("Production resources may not be deleted without human approval.");
  const [mode, setMode] = useState("review");
  const [scope, setScope] = useState("org");
  const [agentIds, setAgentIds] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMode, setEditMode] = useState("review");
  const [editScope, setEditScope] = useState("org");
  const [editAgentIds, setEditAgentIds] = useState("");
  const [dryRun, setDryRun] = useState<{ evaluated: number; would_block: number; would_review: number; would_remain_allowed: number } | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<PolicyVersion[]>([]);

  async function showHistory(id: string) {
    setError("");
    if (historyId === id) {
      setHistoryId(null);
      return;
    }
    const list = await fetch(`/api/policies/${id}/versions`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    setHistory(list);
    setHistoryId(id);
  }

  async function revert(id: string, version: number) {
    setError("");
    const r = await fetch(`/api/policies/${id}/revert/${version}`, { method: "POST" });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setError((b as { error?: string }).error ?? "revert failed");
      return;
    }
    setHistoryId(null);
    await load();
  }

  async function load() {
    const list = await fetch("/api/policies", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    setPolicies(list);
  }
  useEffect(() => {
    load();
  }, []);

  async function toggle(id: string, enabled: boolean) {
    setError("");
    const r = await fetch("/api/policies", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setError((b as { error?: string }).error ?? "update failed");
      return;
    }
    setPolicies((ps) => ps.map((p) => (p.id === id ? { ...p, enabled } : p)));
  }

  async function startEdit(p: Policy) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditDescription(p.description);
    setEditMode(p.mode);
    setEditScope(p.scope ?? "org");
    setEditAgentIds((p.agentIds ?? []).join(", "));
    setError("");
  }

  async function saveEdit(id: string) {
    setError("");
    const r = await fetch("/api/policies", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, name: editName, description: editDescription, mode: editMode, scope: editScope, agentIds: editAgentIds.split(",").map((s) => s.trim()).filter(Boolean) }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setError((b as { error?: string }).error ?? "update failed");
      return;
    }
    const updated = (await r.json()) as Policy;
    setPolicies((ps) => ps.map((p) => (p.id === id ? updated : p)));
    setEditingId(null);
  }

  async function runDryRun() {
    setError("");
    setDryRun(null);
    const r = await fetch("/api/policies/dry-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "draft",
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
      setError((b as { error?: string }).error ?? "dry run failed");
      return;
    }
    setDryRun(await r.json());
  }

  async function save() {    setError("");
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
        scope,
        agentIds: agentIds.split(",").map((s) => s.trim()).filter(Boolean),
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
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Policies" subtitle="What Sentinel enforces, and how." />
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-[#b91c1c]">{error}</p>
      )}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Name</th>
                <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Description</th>
                <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Enforcement</th>
                <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Scope</th>
                <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Version</th>
                <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Enabled</th>
                <th className="border-b border-neutral-200 py-2 font-medium"><span className="sr-only">Toggle</span></th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                editingId === p.id ? (
                  <tr key={p.id}>
                    <td className="border-b border-neutral-100 py-2 pr-3">
                      <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Policy name" />
                    </td>
                    <td className="border-b border-neutral-100 py-2 pr-3">
                      <input className={inputCls} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} aria-label="Policy description" />
                    </td>
                    <td className="border-b border-neutral-100 py-2 pr-3">
                      <select className={inputCls} value={editMode} onChange={(e) => setEditMode(e.target.value)} aria-label="Enforcement">
                        <option value="block">Block</option>
                        <option value="review">Require approval</option>
                        <option value="audit">Audit only</option>
                      </select>
                    </td>
                    <td className="border-b border-neutral-100 py-2 pr-3">
                      <select className={inputCls} value={editScope} onChange={(e) => setEditScope(e.target.value)} aria-label="Scope">
                        <option value="org">Org</option>
                        <option value="agent">Agents</option>
                      </select>
                      {editScope === "agent" && (
                        <input className={`${inputCls} mt-1 font-mono text-xs`} value={editAgentIds} onChange={(e) => setEditAgentIds(e.target.value)} aria-label="Agent IDs" placeholder="research-agent" />
                      )}
                    </td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">v{p.version}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">{String(p.enabled)}</td>
                    <td className="border-b border-neutral-100 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(p.id)}
                          className="rounded-md bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-900 hover:bg-neutral-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="hover:bg-neutral-50">
                    <td className="border-b border-neutral-100 py-2 pr-3 font-medium text-neutral-900">{p.name}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 text-neutral-600">{p.description}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">{p.mode}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs" title={(p.agentIds ?? []).join(", ")}>{p.scope ?? "org"}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">v{p.version}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">{String(p.enabled)}</td>
                    <td className="border-b border-neutral-100 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => showHistory(p.id)}
                          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-900 hover:bg-neutral-50"
                        >
                          History
                        </button>
                        <button
                          onClick={() => startEdit(p)}
                          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-900 hover:bg-neutral-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggle(p.id, !p.enabled)}
                          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-900 hover:bg-neutral-50"
                        >
                          {p.enabled ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {historyId && (
        <Card title={`History · ${policies.find((p) => p.id === historyId)?.name ?? historyId}`}>
          {history.length === 0 ? (
            <p className="text-[13px] text-neutral-500">No snapshots yet — history starts at the next edit.</p>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Version</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Name</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Enforcement</th>
                  <th className="border-b border-neutral-200 py-2 font-medium"><span className="sr-only">Revert</span></th>
                </tr>
              </thead>
              <tbody>
                {history.map((v) => (
                  <tr key={v.version}>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">v{v.version}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3">{v.name}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">{v.mode}</td>
                    <td className="border-b border-neutral-100 py-2">
                      <button
                        onClick={() => revert(historyId, v.version)}
                        className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-900 hover:bg-neutral-50"
                      >
                        Revert
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      <Card title="New policy">
        <div className="grid max-w-xl gap-3">
          {field("Policy name", <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />)}
          {field("Description", <textarea className={inputCls} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />)}
          {field("Enforcement", (
            <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="block">Block</option>
              <option value="review">Require approval</option>
              <option value="audit">Audit only</option>
            </select>
          ))}
          {field("Scope", (
            <select className={inputCls} value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="org">Organization-wide</option>
              <option value="agent">Specific agents</option>
            </select>
          ))}
          {scope === "agent" && field("Agent IDs (comma-separated)", (
            <input className={`${inputCls} font-mono text-xs`} value={agentIds} onChange={(e) => setAgentIds(e.target.value)} placeholder="research-agent, support-agent" />
          ))}
          <div className="flex gap-2">
            <button onClick={save} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700">
              Save policy
            </button>
            <button onClick={runDryRun} className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50">
              Dry run
            </button>
          </div>
          {dryRun && (
            <p className="text-[13px] text-neutral-600">
              Would block <span className="font-mono font-medium text-neutral-900">{dryRun.would_block}</span>
              {" · "}would review <span className="font-mono font-medium text-neutral-900">{dryRun.would_review}</span>
              {" · "}unaffected <span className="font-mono font-medium text-neutral-900">{dryRun.would_remain_allowed}</span>
              {" "}of {dryRun.evaluated} recent actions.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
