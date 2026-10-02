"use client";
import { useState } from "react";

type TestResult =
  | { ok: true; provider: string; latencyMs: number; judgments: { question: string; answer: unknown; confidence?: number }[] }
  | { ok: false; provider: string; latencyMs: number; error: string };

export default function ProviderTest() {
  const [result, setResult] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/provider", { method: "POST" });
      setResult((await r.json()) as TestResult);
    } catch (e) {
      setResult({ ok: false, provider: "unknown", latencyMs: 0, error: e instanceof Error ? e.message : "request failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={test} disabled={busy}>{busy ? "Testing…" : "Test connection"}</button>
      {result && (
        <div style={{ marginTop: 12 }}>
          {result.ok ? (
            <div>
              <p><span className="badge allow">CONNECTED</span> <span className="mono">{result.provider} · {result.latencyMs}ms</span></p>
              <table><thead><tr><th>Question</th><th>Answer</th><th>Confidence</th></tr></thead>
              <tbody>{result.judgments.map((j) => (
                <tr key={j.question}><td className="mono">{j.question}</td><td className="mono">{String(j.answer).toUpperCase()}</td><td className="mono">{j.confidence != null ? `${Math.round(j.confidence * 100)}%` : "—"}</td></tr>
              ))}</tbody></table>
            </div>
          ) : (
            <div>
              <p><span className="badge block">FAILED</span></p>
              <p className="muted">{result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
