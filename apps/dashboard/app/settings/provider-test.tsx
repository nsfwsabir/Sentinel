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
      <button
        onClick={test}
        disabled={busy}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-ink dark:hover:bg-white"
      >
        {busy ? "Testing…" : "Test connection"}
      </button>
      {result && (
        <div className="mt-3">
          {result.ok ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm">
                <span className="inline-block rounded-full border border-allow/40 bg-green-50 px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide text-allow dark:bg-green-950">
                  Connected
                </span>
                <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">{result.provider} · {result.latencyMs}ms</span>
              </p>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-neutral-500 dark:text-neutral-400">
                    <th className="border-b border-neutral-200 py-2 pr-3 font-medium dark:border-neutral-800">Question</th>
                    <th className="border-b border-neutral-200 py-2 pr-3 font-medium dark:border-neutral-800">Answer</th>
                    <th className="border-b border-neutral-200 py-2 font-medium dark:border-neutral-800">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {result.judgments.map((j) => (
                    <tr key={j.question}>
                      <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs dark:border-neutral-800">{j.question}</td>
                      <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs dark:border-neutral-800">{String(j.answer).toUpperCase()}</td>
                      <td className="border-b border-neutral-100 py-2 font-mono text-xs dark:border-neutral-800">{j.confidence != null ? `${Math.round(j.confidence * 100)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p>
                <span className="inline-block rounded-full border border-block/40 bg-red-50 px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide text-block dark:bg-red-950">
                  Failed
                </span>
              </p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
