import { AgentSchema, PolicySchema, DecisionSchema, EvaluateRequestSchema } from "./index.js";
import type { StoredDecision } from "./index.js";
import { GENESIS_HASH, hashDecisionContent, verifyDecisions } from "./audit.js";
import { describe, it, expect } from "vitest";

describe("schemas", () => {
  it("accepts a valid agent", () => {
    const r = AgentSchema.safeParse({
      id: "ag_1",
      name: "research",
      status: "active",
      createdAt: new Date().toISOString(),
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid policy mode", () => {
    const r = PolicySchema.safeParse({
      id: "p1",
      name: "x",
      description: "y",
      severity: "high",
      mode: "delete",
      enabled: true,
      version: 1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects confidence > 1 on decisions", () => {
    const r = DecisionSchema.safeParse({
      id: "dec_1",
      actionId: "act_1",
      outcome: "block",
      confidence: 1.5,
      policyIds: [],
      createdAt: new Date().toISOString(),
    });
    expect(r.success).toBe(false);
  });

  it("defaults evaluate args/context to {}", () => {
    const r = EvaluateRequestSchema.parse({ agentId: "a", toolId: "t" });
    expect(r.arguments).toEqual({});
    expect(r.context).toEqual({});
  });

  it("verifies a hash chain, detects tampering, bridges checkpoints", () => {
    const link = (id: string, prevHash: string, reason: string): StoredDecision => {
      const base = {
        id, actionId: "act_1", outcome: "block", confidence: 0.9, reason,
        policyIds: [], createdAt: new Date("2026-01-01T00:00:00Z"), judgments: [],
      } as StoredDecision;
      return { ...base, prevHash, hash: hashDecisionContent({ ...base, prevHash }, prevHash) };
    };
    const d1 = link("d1", GENESIS_HASH, "r1");
    const d2 = link("d2", d1.hash!, "r2");
    expect(verifyDecisions([d1, d2], [])).toMatchObject({ ok: true, checked: 2 });
    expect(verifyDecisions([d1, { ...d2, reason: "evil" }], []).ok).toBe(false);
    // Retention deleted d1..d2: checkpoint anchors the next survivor.
    const chk = { id: "chk_1", createdAt: new Date(), headId: d2.id, headHash: d2.hash!, deletedCount: 2 };
    const d3 = link("d3", d2.hash!, "r3");
    expect(verifyDecisions([d3], [chk])).toMatchObject({ ok: true, checked: 1, bridged: ["chk_1"] });
    expect(verifyDecisions([d3], []).ok).toBe(false);
  });
});
