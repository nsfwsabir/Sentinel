// Deterministic risk score: a presentation of data Sentinel already has
// (tool risk + matched-policy severities). It never decides anything —
// ALLOW/REVIEW/BLOCK still comes from decide(). Bands: low <25,
// medium <50, high <75, critical >=75.
export type RiskBand = "low" | "medium" | "high" | "critical";

const TOOL_BASE: Record<string, number> = {
  low: 10,
  medium: 30,
  high: 60,
  critical: 85,
};

export function riskScore(input: {
  toolRisk?: string;
  severities: string[];
}): { score: number; band: RiskBand } {
  const base = TOOL_BASE[input.toolRisk ?? ""] ?? 30;
  let bump = 0;
  for (const s of input.severities) {
    if (s === "critical") bump += 15;
    else if (s === "high") bump += 10;
  }
  const score = Math.min(100, Math.round(base + bump));
  const band: RiskBand = score < 25 ? "low" : score < 50 ? "medium" : score < 75 ? "high" : "critical";
  return { score, band };
}
