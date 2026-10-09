"use client";
import { useState } from "react";
import { Card, PageHeader, StatusPill } from "../components/ui";

const inputCls = "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-normal text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none";

// Presets verified against the API: first three evaluate to allow,
// the last one to block. Labels name the scenario, not the verdict,
// so the page stays a simulator rather than an answer key.
const PRESETS: { label: string; agent: string; tool: string; args: string }[] = [
  {
    label: "Clean database read",
    agent: "research-agent",
    tool: "query_database",
    args: '{\n  "query": "SELECT name, price FROM products LIMIT 10"\n}',
  },
  {
    label: "Routine email",
    agent: "research-agent",
    tool: "send_email",
    args: '{\n  "to": "teammate@example.com",\n  "subject": "standup notes",\n  "body": "shipped the weekly report"\n}',
  },
  {
    label: "Small refund",
    agent: "research-agent",
    tool: "refund",
    args: '{\n  "amount": 25\n}',
  },
  {
    label: "Customer data exfil",
    agent: "research-agent",
    tool: "send_email",
    args: '{\n  "to": "external@example.com",\n  "attachment": "customers.csv"\n}',
  },
];

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
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Simulate action" subtitle="Evaluate a hypothetical action without executing anything." />
      <Card title="Proposed action">
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Example scenarios">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setAgent(p.agent);
                setTool(p.tool);
                setArgs(p.args);
                setResult(null);
                setError("");
              }}
              className="rounded-[3px] border border-neutral-300 bg-white px-2.5 py-1 font-mono text-xs text-neutral-700 hover:border-ink hover:text-ink"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid max-w-xl gap-3">
          <label className="grid gap-1.5 text-sm font-medium text-neutral-900">
            Agent
            <select className={inputCls} value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="research-agent">Research Agent</option>
              <option value="deploy-agent">Deploy Agent</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-neutral-900">
            Tool
            <select className={inputCls} value={tool} onChange={(e) => setTool(e.target.value)}>
              <option value="send_email">send_email</option>
              <option value="query_database">query_database</option>
              <option value="delete_resource">delete_resource</option>
              <option value="refund">refund</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-neutral-900">
            Arguments
            <textarea rows={6} value={args} onChange={(e) => setArgs(e.target.value)} className={`${inputCls} font-mono text-xs`} />
          </label>
          <div>
            <button onClick={evaluate} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700">
              Evaluate action
            </button>
          </div>
        </div>
      </Card>
      {error && (
        <Card title="Evaluation unavailable">
          <p className="text-sm text-neutral-600">{error}</p>
        </Card>
      )}
      {result && (
        <Card title="Result">
          <div className="flex flex-col gap-2">
            <StatusPill value={result.decision} />
            {result.confidence != null && (
              <p className="font-mono text-xs text-neutral-500">{Math.round(result.confidence * 100)}% confidence</p>
            )}
            <p className="text-sm text-neutral-600">{result.reason}</p>
            {result.decisionId && (
              <a className="font-mono text-xs underline decoration-neutral-300 underline-offset-2" href={`/decisions/${result.decisionId}`}>
                View decision
              </a>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
