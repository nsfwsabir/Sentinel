import { AgentSchema, PolicySchema, DecisionSchema, EvaluateRequestSchema } from "./index.js";
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
});
