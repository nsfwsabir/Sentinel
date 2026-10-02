// Calibration harness: replay a labeled case set through the live Sentinel
// API and report decision accuracy + per-question judgment stats.
// The provider key (e.g. LAYA_API_KEY) lives on the API server — this script
// only needs the Sentinel agent key.
//
// Usage:
//   pnpm --filter @sentinel/api dev                                   # terminal 1
//   SENTINEL_API_URL=http://localhost:3001 SENTINEL_AGENT_KEY=dev-key-1 \
//     pnpm --filter @sentinel/tests calibrate [cases.json] [out.csv]
//
// Add your own cases (from approvals, incidents, or production traffic) to
// cases.json: { id, agentId, toolId, task?, arguments, context, expected, note? }

type Case = {
  id: string;
  agentId: string;
  toolId: string;
  task?: string;
  arguments: Record<string, unknown>;
  context: Record<string, unknown>;
  expected: "allow" | "review" | "block";
  note?: string;
};

type Judgment = { question: string; answer: unknown; confidence?: number };

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";
const KEY = process.env.SENTINEL_AGENT_KEY ?? "dev-key-1";
const CASES_PATH = process.argv[2] ?? new URL("./cases.json", import.meta.url).pathname;
const OUT_PATH = process.argv[3] ?? new URL("./report.csv", import.meta.url).pathname;

const cases: Case[] = JSON.parse(await (await import("node:fs/promises")).readFile(CASES_PATH, "utf8"));

type Row = {
  id: string;
  expected: string;
  actual: string;
  match: boolean;
  confidence: string;
  reason: string;
  judgments: Judgment[];
};

const rows: Row[] = [];
for (const c of cases) {
  const r = await fetch(`${API}/v1/actions/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      agentId: c.agentId,
      toolId: c.toolId,
      task: c.task,
      arguments: c.arguments,
      context: c.context,
    }),
  });
  if (!r.ok) {
    // Refused (unknown/disabled agent, unknown tool, rate-limited): safe
    // direction, scores as block. Anything else is a harness error.
    const refused = r.status === 403 || r.status === 404;
    rows.push({
      id: c.id,
      expected: c.expected,
      actual: refused ? "block(refused)" : `error:${r.status}`,
      match: refused && c.expected === "block",
      confidence: "",
      reason: await r.text(),
      judgments: [],
    });
    continue;
  }
  const body = (await r.json()) as { decision: string; confidence?: number; reason?: string; decisionId: string };
  let judgments: Judgment[] = [];
  try {
    const d = await fetch(`${API}/v1/decisions/${body.decisionId}`).then((x) => x.json()) as { judgments?: Judgment[] };
    judgments = d.judgments ?? [];
  } catch {
    judgments = [];
  }
  rows.push({
    id: c.id,
    expected: c.expected,
    actual: body.decision,
    match: body.decision === c.expected,
    confidence: body.confidence?.toFixed(3) ?? "",
    reason: (body.reason ?? "").slice(0, 120),
    judgments,
  });
}

// CSV: one row per case, one column pair per question.
const qids = [...new Set(rows.flatMap((r) => r.judgments.map((j) => j.question)))];
const head = ["id", "expected", "actual", "match", "confidence", "reason", ...qids.flatMap((q) => [`${q}:answer`, `${q}:conf`])];
const lines = [head.join(",")];
for (const r of rows) {
  const cells = [r.id, r.expected, r.actual, String(r.match), r.confidence, JSON.stringify(r.reason)];
  for (const q of qids) {
    const j = r.judgments.find((x) => x.question === q);
    cells.push(String(j?.answer ?? ""), j?.confidence?.toFixed(3) ?? "");
  }
  lines.push(cells.join(","));
}
await (await import("node:fs/promises")).writeFile(OUT_PATH, lines.join("\n"));
console.log(`wrote ${OUT_PATH}`);

// Console: per-case verdicts + accuracy + per-question yes-rate/confidence by expected class.
for (const r of rows) {
  console.log(`${r.match ? "ok  " : "DIFF"} ${r.id} expected=${r.expected} actual=${r.actual}${r.confidence ? ` conf=${r.confidence}` : ""}`);
}
const hits = rows.filter((r) => r.match).length;
console.log(`\ndecision accuracy: ${hits}/${rows.length}`);
for (const q of qids) {
  const parts: string[] = [];
  for (const cls of ["allow", "review", "block"]) {
    const js = rows
      .filter((r) => r.expected === cls)
      .map((r) => r.judgments.find((x) => x.question === q))
      .filter((j): j is Judgment => Boolean(j));
    if (js.length === 0) continue;
    const yes = js.filter((j) => String(j.answer).toLowerCase() === "yes").length;
    const mean = js.reduce((s, j) => s + (j.confidence ?? 0), 0) / js.length;
    parts.push(`${cls}: yes ${yes}/${js.length}, mean_conf ${mean.toFixed(2)}`);
  }
  console.log(`${q} -> ${parts.join(" | ")}`);
}
