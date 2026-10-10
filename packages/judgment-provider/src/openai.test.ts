import { describe, it, expect } from "vitest";
import { OpenAIJudgmentProvider, resolveOpenAIConfig } from "./openai.js";
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

function predicatesFetch(p: number, opts?: { refuse?: string; drop?: string; seenBody?: { body: string } }) {
  const predicates: Record<string, unknown> = {};
  for (const qid of QIDS) {
    if (qid !== opts?.drop) predicates[qid] = { probability: p };
  }
  const refusals = opts?.refuse ? { [opts.refuse]: { reason: "declined" } } : undefined;
  return (async (url: unknown, init?: { body?: unknown }) => {
    if (opts?.seenBody && typeof init?.body === "string") opts.seenBody.body = init.body;
    return new Response(JSON.stringify({ predicates, ...(refusals ? { refusals } : {}) }), { status: 200 });
  }) as typeof fetch;
}

const baseOpts = { apiUrl: "http://openai", apiKey: "k", model: "m" };

describe("openai provider", () => {
  it("maps predicates to yes/no judgments with derived confidence", async () => {
    const provider = new OpenAIJudgmentProvider({ ...baseOpts, fetchImpl: predicatesFetch(0.94) });
    const out = await provider.judge(state);
    expect(out).toHaveLength(5);
    expect(out.map((j) => j.question)).toEqual(QIDS);
    const v = out.find((j) => j.question === "policy_violation");
    expect(v?.answer).toBe("yes");
    expect(v?.type).toBe("noul");
    expect(v?.confidence).toBeCloseTo(0.94);
    expect(v?.probabilities?.yes).toBe(0.94);
    expect(v?.probabilities?.no).toBeCloseTo(0.06);
  });

  it("answers no below 0.5", async () => {
    const provider = new OpenAIJudgmentProvider({ ...baseOpts, fetchImpl: predicatesFetch(0.2) });
    const out = await provider.judge(state);
    const v = out.find((j) => j.question === "policy_violation");
    expect(v?.answer).toBe("no");
    expect(v?.confidence).toBeCloseTo(0.8);
  });

  it("fails closed on refusals and missing answers", async () => {
    const refused = new OpenAIJudgmentProvider({ ...baseOpts, fetchImpl: predicatesFetch(0.9, { refuse: "policy_violation" }) });
    await expect(refused.judge(state)).rejects.toThrow(/refused/);
    const dropped = new OpenAIJudgmentProvider({ ...baseOpts, fetchImpl: predicatesFetch(0.9, { drop: "policy_violation" }) });
    await expect(dropped.judge(state)).rejects.toThrow(/missing answer/);
  });

  it("redacts secrets before sending", async () => {
    const seenBody: { body: string } = { body: "" };
    const provider = new OpenAIJudgmentProvider({ ...baseOpts, fetchImpl: predicatesFetch(0.1, { seenBody }) });
    await provider.judge({ ...state, arguments: { api_key: "sk-live-abcdef1234567890", q: "hi" } });
    expect(seenBody.body).not.toContain("sk-live");
    expect(seenBody.body).toContain("q");
  });

  it("requires key and model", () => {
    expect(() => resolveOpenAIConfig({})).toThrow(/OPENAI_API_KEY/);
    expect(() => resolveOpenAIConfig({ OPENAI_API_KEY: "k" })).toThrow(/OPENAI_MODEL/);
    const cfg = resolveOpenAIConfig({ OPENAI_API_KEY: "k", OPENAI_MODEL: "m" });
    expect(cfg.apiUrl).toBe("https://api.openai.com/v1/decisions");
    expect(cfg.mode).toBe("hosted");
  });
});
