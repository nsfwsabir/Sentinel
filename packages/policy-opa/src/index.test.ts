import { describe, it, expect } from "vitest";
import { mapOpaFindings, evaluatePolicies, isOpaAvailable } from "./index.js";

describe("policy-opa mapping", () => {
  it("maps wasm-shaped output to TS findings", () => {
    const out = mapOpaFindings([
      { result: [{ policy_id: "pol_exfil", outcome: "block", reason: "exfil" }] },
    ]);
    expect(out).toEqual([{ policyId: "pol_exfil", outcome: "block", reason: "exfil" }]);
  });

  it("throws on malformed output (fail safe to TS engine)", () => {
    expect(() => mapOpaFindings([{ result: [{ nope: 1 }] }])).toThrow(/malformed/);
    expect(() => mapOpaFindings({ nope: 1 })).toThrow(/unexpected/);
    expect(() => mapOpaFindings([{ result: [{ policy_id: "p", outcome: "allow", reason: "x" }] }])).toThrow(
      /unknown outcome/,
    );
  });

  it("evaluates the hero case through OPA when bundled, else TS fallback", async () => {
    const action = {
      agentId: "a",
      toolId: "send_email",
      arguments: { to: "external@example.com", attachment: "customers.csv" },
      context: {},
    };
    const policies = [
      {
        id: "pol_exfil",
        name: "Customer data",
        description: "Customer data must never be sent externally.",
        severity: "high" as const,
        mode: "block" as const,
        enabled: true,
        version: 1,
      },
    ];
    const r = await evaluatePolicies(action, policies);
    expect(r.findings[0]?.outcome).toBe("block");
    expect(r.engine).toBe(isOpaAvailable() ? "opa" : "typescript");
  });
});
