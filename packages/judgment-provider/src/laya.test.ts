import { describe, it, expect } from "vitest";
import { LayaJudgmentProvider } from "./laya.js";
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

function answersFetch(noul: number, confidence?: number) {
  const answers: Record<string, unknown> = {};
  for (const qid of QIDS) {
    answers[qid] = {
      type: "noul",
      noul,
      ...(confidence !== undefined ? { confidence } : {}),
    };
  }
  return (async () =>
    new Response(JSON.stringify({ answers }), { status: 200 })) as typeof fetch;
}

describe("laya provider", () => {
  it("normalizes noul answers into yes/no judgments with confidence", async () => {
    const provider = new LayaJudgmentProvider({
      apiUrl: "http://laya",
      apiKey: "k",
      fetchImpl: answersFetch(0.94, 0.94),
    });
    const out = await provider.judge(state);
    expect(out).toHaveLength(5);
    expect(out.map((j) => j.question)).toEqual(QIDS);
    const v = out.find((j) => j.question === "policy_violation");
    expect(v?.answer).toBe("yes");
    expect(v?.confidence).toBe(0.94);
    expect(v?.probabilities?.yes).toBe(0.94);
    expect(v?.probabilities?.no).toBeCloseTo(0.06);
  });

  it("derives confidence from noul when absent and answers no below 0.5", async () => {
    const provider = new LayaJudgmentProvider({
      apiUrl: "http://laya",
      apiKey: "k",
      fetchImpl: answersFetch(0.2),
    });
    const out = await provider.judge(state);
    const v = out.find((j) => j.question === "policy_violation");
    expect(v?.answer).toBe("no");
    expect(v?.confidence).toBeCloseTo(0.8);
  });

  it("judgments carry no argument values (no secret leak)", async () => {
    const provider = new LayaJudgmentProvider({
      apiUrl: "http://laya",
      apiKey: "k",
      fetchImpl: answersFetch(0.9, 0.9),
    });
    const out = await provider.judge({
      ...state,
      arguments: { to: "x@y.com", api_key: "sk-live-abcdefgh12345678" },
    });
    expect(JSON.stringify(out)).not.toContain("sk-live");
    expect(JSON.stringify(out)).not.toContain("x@y.com");
  });

  it("rejects missing key in hosted mode at construction", async () => {
    const saved = process.env.LAYA_API_KEY;
    delete process.env.LAYA_API_KEY;
    try {
      expect(() => new LayaJudgmentProvider({ apiKey: "" })).toThrow(/LAYA_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.LAYA_API_KEY = saved;
    }
  });

  it("throws on malformed response (never invents permission)", async () => {
    const provider = new LayaJudgmentProvider({
      apiUrl: "http://laya",
      apiKey: "k",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ nope: true }), { status: 200 })) as typeof fetch,
    });
    await expect(provider.judge(state)).rejects.toThrow(/malformed/);
  });

  it("throws on missing answer for a focused question", async () => {
    const provider = new LayaJudgmentProvider({
      apiUrl: "http://laya",
      apiKey: "k",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({ answers: { policy_violation: { type: "noul", noul: 0.9 } } }),
          { status: 200 },
        )) as typeof fetch,
    });
    await expect(provider.judge(state)).rejects.toThrow(/missing answer/);
  });

  it("retries once then throws on HTTP 500", async () => {
    let calls = 0;
    const provider = new LayaJudgmentProvider({
      apiUrl: "http://laya",
      apiKey: "k",
      fetchImpl: (async () => {
        calls += 1;
        return new Response("err", { status: 500 });
      }) as typeof fetch,
    });
    await expect(provider.judge(state)).rejects.toThrow(/HTTP 500/);
    expect(calls).toBe(2);
  });

  it("redacts secrets from the outbound Laya request body", async () => {
    let sent = "";
    const answers: Record<string, unknown> = {};
    for (const qid of QIDS) {
      answers[qid] = { type: "noul", noul: 0.1, confidence: 0.9 };
    }
    const provider = new LayaJudgmentProvider({
      apiUrl: "http://laya",
      apiKey: "k",
      fetchImpl: (async (_url: string, init?: { body?: unknown }) => {
        sent = String(init?.body ?? "");
        return new Response(JSON.stringify({ answers }), { status: 200 });
      }) as typeof fetch,
    });
    await provider.judge({
      ...state,
      arguments: { to: "external@example.com", api_key: "sk-live-abcdefgh12345678", attachment: "customers.csv" },
    });
    expect(sent).not.toContain("sk-live");
    expect(sent).toContain("[REDACTED]");
    // customer-data shape passes through so exposure questions keep signal
    expect(sent).toContain("customers.csv");
    expect(sent).toContain("external@example.com");
  });
});
