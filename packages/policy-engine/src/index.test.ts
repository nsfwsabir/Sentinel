import { describe, it, expect } from "vitest";
import { evaluateDeterministic } from "./index.js";
import type { Policy } from "@sentinel/schemas";

const base: Policy = {
  id: "p1",
  name: "x",
  description: "y",
  severity: "high",
  mode: "block",
  enabled: true,
  version: 1,
};

describe("policy-engine deterministic", () => {
  it("blocks customer data exfiltration (hero demo)", () => {
    const { findings } = evaluateDeterministic(
      {
        agentId: "a",
        toolId: "send_email",
        arguments: { to: "external@example.com", attachment: "customers.csv" },
        context: {},
      },
      [{ ...base, name: "Customer data", description: "Customer data must never be sent externally." }],
    );
    expect(findings[0]?.outcome).toBe("block");
    expect(findings[0]?.reason).toMatch(/external/i);
  });

  it("blocks credential transmission", () => {
    const { findings } = evaluateDeterministic(
      {
        agentId: "a",
        toolId: "send_email",
        arguments: { to: "external@example.com", body: "key sk-live-abcdefgh12345678" },
        context: {},
      },
      [{ ...base, name: "Credentials", description: "Credentials must never be transmitted externally." }],
    );
    expect(findings[0]?.outcome).toBe("block");
  });

  it("reviews production deletion", () => {
    const { findings } = evaluateDeterministic(
      { agentId: "a", toolId: "delete_resource", arguments: { id: "db" }, context: { env: "production" } },
      [
        {
          ...base,
          mode: "review",
          name: "Production deletion",
          description: "Production deletion requires human approval.",
        },
      ],
    );
    expect(findings[0]?.outcome).toBe("review");
  });

  it("reviews payments above $100, allows small ones", () => {
    const big = evaluateDeterministic(
      { agentId: "a", toolId: "refund", arguments: { amount: 500 }, context: {} },
      [{ ...base, mode: "review", name: "Payments", description: "Payments above $100 require approval." }],
    );
    expect(big.findings[0]?.outcome).toBe("review");

    const small = evaluateDeterministic(
      { agentId: "a", toolId: "refund", arguments: { amount: 20 }, context: {} },
      [{ ...base, mode: "review", name: "Payments", description: "Payments above $100 require approval." }],
    );
    expect(small.findings).toHaveLength(0);
  });

  it("ignores disabled policies and allows dev infra", () => {
    const { findings } = evaluateDeterministic(
      { agentId: "a", toolId: "deploy_app", arguments: {}, context: { env: "development" } },
      [{ ...base, enabled: false, name: "Production deletion", description: "Production deletion requires approval." }],
    );
    expect(findings).toHaveLength(0);
  });
});
