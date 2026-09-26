import { describe, it, expect } from "vitest";
import { MockJevClient } from "@sentinel/jev-client";
import { decide } from "./index.js";

describe("decision-engine", () => {
  it("blocks hero exfil via Jev high-confidence violation", async () => {
    const r = await decide({
      state: {
        agent: "research-agent",
        task: "Research competitors",
        tool: "send_email",
        arguments: { to: "external@example.com", attachment: "customers.csv" },
        policies: ["Customer data must never be sent externally."],
      },
      deterministic: [],
      jev: new MockJevClient(),
    });
    expect(r.outcome).toBe("block");
    expect(r.fallbackUsed).toBe(false);
  });

  it("deterministic block wins without Jev", async () => {
    const r = await decide({
      state: { agent: "a", tool: "send_email", arguments: {}, policies: [] },
      deterministic: [{ policyId: "p1", outcome: "block", reason: "cred leak" }],
      jev: new MockJevClient(),
    });
    expect(r.outcome).toBe("block");
    expect(r.judgments).toHaveLength(0);
  });

  it("fails closed to REVIEW when Jev throws", async () => {
    const r = await decide({
      state: { agent: "a", tool: "query_database", arguments: {}, policies: [] },
      deterministic: [],
      toolRisk: "medium",
      jev: {
        name: "broken",
        judge: async () => {
          throw new Error("Jev unavailable");
        },
      },
    });
    expect(r.outcome).toBe("review");
    expect(r.fallbackUsed).toBe(true);
  });

  it("never auto-allows on Jev outage for critical tools", async () => {
    const r = await decide({
      state: { agent: "a", tool: "delete_database", arguments: {}, policies: [] },
      deterministic: [],
      toolRisk: "critical",
      jev: {
        name: "broken",
        judge: async () => {
          throw new Error("timeout");
        },
      },
    });
    expect(["block", "review"]).toContain(r.outcome);
    expect(r.fallbackUsed).toBe(true);
  });
});
