import type { z } from "zod";
import type { DecisionOutcome } from "@sentinel/schemas";
export type Outcome = z.infer<typeof DecisionOutcome>;
import type { DeterministicFinding } from "@sentinel/policy-engine";
import type { JudgmentProvider, EvalState } from "@sentinel/judgment-provider";

export { riskScore, type RiskBand } from "./risk.js";

export type Thresholds = {
  highConfidence: number;
  reviewBelow: number;
};

export function thresholdsFromEnv(): Thresholds {
  return {
    highConfidence: Number(process.env.DECISION_HIGH_CONFIDENCE ?? 0.9),
    reviewBelow: Number(process.env.DECISION_REVIEW_BELOW ?? 0.8),
  };
}

export type DecideInput = {
  state: EvalState;
  deterministic: DeterministicFinding[];
  toolRisk?: "low" | "medium" | "high" | "critical";
  provider: JudgmentProvider;
  thresholds?: Thresholds;
};

export type DecideResult = {
  outcome: Outcome;
  confidence: number;
  reason: string;
  policyIds: string[];
  judgments: { question: string; answer: unknown; confidence?: number }[];
  fallbackUsed: boolean;
};

/**
 * Decision precedence BLOCK > REVIEW > ALLOW (AGENTS.md §19).
 * Never converts REVIEW→ALLOW automatically; provider outage fails closed (§18).
 */
export async function decide(input: DecideInput): Promise<DecideResult> {
  const thresholds = input.thresholds ?? thresholdsFromEnv();
  const detBlock = input.deterministic.find((f) => f.outcome === "block");
  if (detBlock) {
    return {
      outcome: "block",
      confidence: 1,
      reason: detBlock.reason,
      policyIds: input.deterministic.map((f) => f.policyId),
      judgments: [],
      fallbackUsed: false,
    };
  }
  const detReview = input.deterministic.find((f) => f.outcome === "review");

  const started = Date.now();
  void started;
  try {
    const raw = await input.provider.judge(input.state);
    const judgments = raw.map((j) => ({
      question: j.question,
      answer: j.answer,
      confidence: j.confidence,
    }));
    const violation = raw.find((j) => j.question === "policy_violation");
    const vConf =
      violation?.confidence ??
      Math.max(...raw.map((j) => j.confidence ?? 0), 0);
    const vYes = String(violation?.answer ?? "").toLowerCase() === "yes";

    if (vYes && vConf >= thresholds.highConfidence) {
      return {
        outcome: "block",
        confidence: vConf,
        reason: "Policy violation detected with high confidence.",
        policyIds: input.deterministic.map((f) => f.policyId),
        judgments,
        fallbackUsed: false,
      };
    }
    const needsHuman = raw.find((j) => j.question === "human_review_needed");
    const hConf = needsHuman?.confidence ?? 0;
    // A bare yes is not enough: like violation, the human-review signal only
    // counts at or above the review threshold (calibration: tune via harness).
    const hYes = String(needsHuman?.answer ?? "").toLowerCase() === "yes" && hConf >= thresholds.reviewBelow;
    if ((vYes && vConf >= thresholds.reviewBelow) || hYes || detReview) {
      return {
        outcome: "review",
        confidence: Math.max(vConf, hConf),
        reason: detReview?.reason ?? "Human review required by policy judgment.",
        policyIds: input.deterministic.map((f) => f.policyId),
        judgments,
        fallbackUsed: false,
      };
    }
    return {
      outcome: "allow",
      confidence: 1 - vConf >= 0 ? Math.max(0.5, 1 - vConf * 0) : 0.5,
      reason: "No policy violation detected.",
      policyIds: [],
      judgments,
      fallbackUsed: false,
    };
  } catch (err) {
    // Fail closed (TRD §11): high/critical → BLOCK, medium → REVIEW, low → REVIEW unless explicitly low-risk allow.
    const risk = input.toolRisk ?? "high";
    const reason = `Judgment provider unavailable (${err instanceof Error ? err.message : "unknown"}). Fail-closed fallback.`;
    if (risk === "high" || risk === "critical" || detReview) {
      const wantsBlock = risk === "critical" || detReview?.outcome === "block";
      return {
        outcome: wantsBlock ? "block" : "review",
        confidence: 0.5,
        reason,
        policyIds: input.deterministic.map((f) => f.policyId),
        judgments: [],
        fallbackUsed: true,
      };
    }
    if (risk === "medium") {
      return {
        outcome: "review",
        confidence: 0.5,
        reason,
        policyIds: [],
        judgments: [],
        fallbackUsed: true,
      };
    }
    // low-risk configurable: still REVIEW by default (never silent ALLOW)
    return {
      outcome: "review",
      confidence: 0.5,
      reason,
      policyIds: [],
      judgments: [],
      fallbackUsed: true,
    };
  }
}
