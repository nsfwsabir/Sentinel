import { describe, it, expect } from "vitest";
import { MockJudgmentProvider } from "@sentinel/judgment-provider";
import { decide } from "./index.js";

const broken = {
  name: "broken",
  judge: async () => {
    throw new Error("provider down");
  },
};

describe("decision-engine", () => {
  it("blocks hero exfil via high-confidence contextual violation", async () => {
    const r = await decide({
      state: {
        agent: "research-agent",
        task: "Research competitors",
        tool: "send_email",
        arguments: { to: "external@example.com", attachment: "customers.csv" },
        policies: ["Customer data must never be sent externally."],
      },
      deterministic: [],
      provider: new MockJudgmentProvider(),
    });
    expect(r.outcome).toBe("block");
    expect(r.fallbackUsed).toBe(false);
  });

  it("deterministic BLOCK overrides contextual judgment", async () => {
    const r = await decide({
      state: { agent: "a", tool: "send_email", arguments: {}, policies: [] },
      deterministic: [{ policyId: "p1", outcome: "block", reason: "cred leak" }],
      provider: new MockJudgmentProvider(),
    });
    expect(r.outcome).toBe("block");
    expect(r.judgments).toHaveLength(0);
  });

  it("policy-required REVIEW stays REVIEW even when provider allows", async () => {
    const r = await decide({
      state: { agent: "a", tool: "refund", arguments: { amount: 20 }, policies: [] },
      deterministic: [{ policyId: "p1", outcome: "review", reason: "needs approval" }],
      toolRisk: "low",
      provider: {
        name: "permissive",
        judge: async () => [
          { question: "policy_violation", type: "noul", answer: "no", confidence: 0.9 },
          { question: "human_review_needed", type: "noul", answer: "no", confidence: 0.9 },
        ],
      },
    });
    expect(r.outcome).toBe("review");
  });

  it("safe action with clean judgment reaches ALLOW", async () => {
    const r = await decide({
      state: { agent: "a", tool: "query_database", arguments: { q: "select 1" }, policies: [] },
      deterministic: [],
      toolRisk: "low",
      provider: {
        name: "permissive",
        judge: async () => [
          { question: "policy_violation", type: "noul", answer: "no", confidence: 0.9 },
          { question: "human_review_needed", type: "noul", answer: "no", confidence: 0.7 },
        ],
      },
    });
    expect(r.outcome).toBe("allow");
  });

  it("fails closed to REVIEW when provider throws", async () => {
    const r = await decide({
      state: { agent: "a", tool: "query_database", arguments: {}, policies: [] },
      deterministic: [],
      toolRisk: "medium",
      provider: broken,
    });
    expect(r.outcome).toBe("review");
    expect(r.fallbackUsed).toBe(true);
  });

  it("ignores sub-threshold human-review signals", async () => {
    const r = await decide({
      state: { agent: "a", tool: "query_database", arguments: { q: "select 1" }, policies: [] },
      deterministic: [],
      toolRisk: "low",
      provider: {
        name: "cautious",
        judge: async () => [
          { question: "policy_violation", type: "noul", answer: "no", confidence: 0.9 },
          { question: "human_review_needed", type: "noul", answer: "yes", confidence: 0.6 },
        ],
      },
    });
    expect(r.outcome).toBe("allow");
  });

  it("honors above-threshold human-review signals", async () => {
    const r = await decide({
      state: { agent: "a", tool: "query_database", arguments: { q: "select 1" }, policies: [] },
      deterministic: [],
      toolRisk: "low",
      provider: {
        name: "cautious",
        judge: async () => [
          { question: "policy_violation", type: "noul", answer: "no", confidence: 0.9 },
          { question: "human_review_needed", type: "noul", answer: "yes", confidence: 0.92 },
        ],
      },
    });
    expect(r.outcome).toBe("review");
  });

  it("never auto-allows on provider outage for critical tools", async () => {
    const r = await decide({
      state: { agent: "a", tool: "delete_database", arguments: {}, policies: [] },
      deterministic: [],
      toolRisk: "critical",
      provider: broken,
    });
    expect(["block", "review"]).toContain(r.outcome);
    expect(r.fallbackUsed).toBe(true);
  });
});
