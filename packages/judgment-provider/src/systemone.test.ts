import { describe, it, expect } from "vitest";
import { SystemOneJudgmentProvider } from "./systemone.js";
import { MS_DECISION_API_URL, MS_DECISION_MODEL } from "./index.js";
import type { EvalState } from "./index.js";

const state: EvalState = {
  agent: "research-agent",
  tool: "send_email",
  arguments: { to: "external@example.com", attachment: "customers.csv" },
  policies: ["Customer data must never be sent externally."],
};

const QIDS = [
  "sensitive_exposure",
  "policy_violation",
  "human_review_needed",
  "destructive",
  "targets_production",
];

describe("system-one provider (ms-decision / jev wire)", () => {
  it("posts state+questions and normalizes noul answers", async () => {
    let seen: { url: unknown; headers: Record<string, string>; body: string } | null = null;
    const fetchImpl = (async (url: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
      seen = { url, headers: init?.headers ?? {}, body: String(init?.body ?? "") };
      const answers: Record<string, unknown> = {};
      for (const qid of QIDS) answers[qid] = { type: "noul", noul: 0.9, confidence: 0.9 };
      return new Response(JSON.stringify({ answers }), { status: 200 });
    }) as typeof fetch;
    const provider = new SystemOneJudgmentProvider("ms-decision", {
      apiUrl: MS_DECISION_API_URL,
      apiKey: "k",
      model: MS_DECISION_MODEL,
      fetchImpl,
    });
    const out = await provider.judge(state);
    expect(out).toHaveLength(5);
    expect(out.find((j) => j.question === "policy_violation")?.answer).toBe("yes");
    expect(seen!.headers["authorization"]).toBe("Bearer k");
    const body = JSON.parse(seen!.body);
    expect(body.model).toBe(MS_DECISION_MODEL);
    expect(Object.keys(body.questions)).toEqual(QIDS);
    expect(provider.describeConfig()).toEqual({ mode: undefined, warnings: [] });
  });

  it("throws on HTTP errors (fail-closed upstream)", async () => {
    const provider = new SystemOneJudgmentProvider("jev", {
      apiUrl: "http://jev",
      apiKey: "k",
      fetchImpl: (async () => new Response("nope", { status: 500 })) as typeof fetch,
    });
    await expect(provider.judge(state)).rejects.toThrow(/jev unavailable: HTTP 500/);
  });
});
