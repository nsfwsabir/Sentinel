import { describe, it, expect } from "vitest";
import { MockJudgmentProvider, providerFromEnv, providerNames, registerProvider } from "./index.js";

describe("mock provider", () => {
  it("flags exfil as violation with high confidence", async () => {
    const provider = new MockJudgmentProvider();
    const out = await provider.judge({
      agent: "research-agent",
      tool: "send_email",
      arguments: { to: "external@example.com", attachment: "customers.csv" },
      policies: ["Customer data must never be sent externally."],
    });
    const v = out.find((j) => j.question === "policy_violation");
    expect(v?.answer).toBe("yes");
    expect(v?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("does not flag benign dev query", async () => {
    const provider = new MockJudgmentProvider();
    const out = await provider.judge({
      agent: "a",
      tool: "query_database",
      arguments: { q: "select 1" },
      policies: [],
      environment: "development",
    });
    expect(out.find((j) => j.question === "policy_violation")?.answer).toBe("no");
  });
});

describe("provider registry", () => {
  it("defaults to mock and refuses unknown names", () => {
    expect(providerFromEnv({}).name).toBe("mock");
    expect(providerFromEnv({ JUDGMENT_PROVIDER: "" }).name).toBe("mock");
    expect(() => providerFromEnv({ JUDGMENT_PROVIDER: "jeva" })).toThrow(/Unknown JUDGMENT_PROVIDER/);
    expect(providerNames()).toEqual(expect.arrayContaining(["mock", "laya", "openai", "ms-decision", "jev"]));
  });

  it("builds wire-compatible models from env", () => {
    expect(
      providerFromEnv({ JUDGMENT_PROVIDER: "jev", JEV_API_URL: "http://localhost:8000/x", JEV_MODEL: "m" }).name,
    ).toBe("jev");
    expect(
      providerFromEnv({ JUDGMENT_PROVIDER: "ms-decision", MS_DECISION_API_KEY: "k" }).name,
    ).toBe("ms-decision");
    expect(() => providerFromEnv({ JUDGMENT_PROVIDER: "ms-decision" })).toThrow(/MS_DECISION_API_KEY/);
    expect(() => providerFromEnv({ JUDGMENT_PROVIDER: "openai", OPENAI_API_KEY: "k" })).toThrow(/OPENAI_MODEL/);
  });

  it("accepts custom-wire models via registerProvider", async () => {
    registerProvider("test-echo", () => ({
      name: "test-echo",
      judge: async () => [],
    }));
    expect(providerFromEnv({ JUDGMENT_PROVIDER: "test-echo" }).name).toBe("test-echo");
  });
});
