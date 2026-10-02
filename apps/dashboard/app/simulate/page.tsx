"use client";
import { useState } from "react";

export default function SimulatePage() {
  const [agent, setAgent] = useState("research-agent");
  const [tool, setTool] = useState("send_email");
  const [args, setArgs] = useState('{\n  "to": "external@example.com",\n  "attachment": "customers.csv"\n}');
  const [result, setResult] = useState<{ decision: string; confidence?: number; reason?: string; decisionId?: string } | null>(null);
  const [error, setError] = useState("");

  async function evaluate() {
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agent, toolId: tool, arguments: JSON.parse(args), context: {} }),
      });
      const body = await r.json();
      if (!r.ok) setError(body.error ?? "evaluation failed");
      else setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "evaluation failed");
    }
  }

  return (
    <div>
      <h1>Simulate action</h1>
      <div className="card" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <label>Agent<select value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="research-agent">Research Agent</option>
          <option value="deploy-agent">Deploy Agent</option>
        </select></label>
        <label>Tool<select value={tool} onChange={(e) => setTool(e.target.value)}>
          <option value="send_email">send_email</option>
          <option value="query_database">query_database</option>
          <option value="delete_resource">delete_resource</option>
          <option value="refund">refund</option>
        </select></label>
        <label>Arguments<textarea rows={6} value={args} onChange={(e) => setArgs(e.target.value)} className="mono" /></label>
        <button onClick={evaluate}>Evaluate action</button>
      </div>
      {error && <div className="card"><p>Evaluation unavailable</p><p className="muted">{error}</p></div>}
      {result && (
        <div className="card">
          <p><span className={`badge ${result.decision}`}>{result.decision.toUpperCase()}</span></p>
          {result.confidence != null && <p className="mono">{Math.round(result.confidence * 100)}% confidence</p>}
          <p className="muted">{result.reason}</p>
          {result.decisionId && <a className="mono" href={`/decisions/${result.decisionId}`}>View decision</a>}
        </div>
      )}
    </div>
  );
}
