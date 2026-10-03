import { describe, it, expect } from "vitest";
import { riskScore } from "./risk.js";

describe("riskScore", () => {
  it("scores low tool + no severities as low", () => {
    expect(riskScore({ toolRisk: "low", severities: [] })).toEqual({ score: 10, band: "low" });
  });

  it("bumps for high/critical severities and caps at 100", () => {
    expect(riskScore({ toolRisk: "critical", severities: ["critical", "critical"] })).toEqual({
      score: 100,
      band: "critical",
    });
    expect(riskScore({ toolRisk: "high", severities: ["high"] })).toEqual({ score: 70, band: "high" });
  });

  it("defaults unknown tool risk to medium base", () => {
    expect(riskScore({ severities: [] })).toEqual({ score: 30, band: "medium" });
  });
});
