import type { Judgment } from "@sentinel/schemas";

// AGENTS.md §9: Jev answers focused questions, never "should we allow this?"
export type EvalState = {
  agent: string;
  task?: string;
  tool: string;
  arguments: Record<string, unknown>;
  policies: string[];
  environment?: string;
};

export type FocusedQuestion =
  | "sensitive_exposure"
  | "policy_violation"
  | "human_review_needed"
  | "destructive"
  | "targets_production";

export interface JevClient {
  judge(state: EvalState): Promise<Omit<Judgment, "id" | "decisionId">[]>;
  readonly name: string;
}

function textOf(state: EvalState): string {
  return JSON.stringify({ ...state.arguments, task: state.task ?? "" }).toLowerCase();
}

/**
 * Deterministic stand-in for Jev (JEV_PROVIDER=mock).
 * Mirrors the real question shapes so HttpJevClient can swap in later.
 */
export class MockJevClient implements JevClient {
  readonly name = "mock";

  async judge(state: EvalState): Promise<Omit<Judgment, "id" | "decisionId">[]> {
    const text = textOf(state);
    const to = String(
      (state.arguments["to"] ?? state.arguments["recipient"] ?? "") as string,
    ).toLowerCase();
    const external = to.length > 0;
    const sensitive =
      /customers\.csv|customer|ssn|passport|api_key|secret|password|sk-live|akia/i.test(text);
    const destructive = /delete|destroy|drop|deploy_app/i.test(state.tool + " " + text);
    const prod = (state.environment ?? "").toLowerCase().startsWith("prod");
    const violation =
      (sensitive && external) ||
      state.policies.some((p) => /never.*external|customer data/i.test(p) && sensitive && external);

    const mk = (
      question: FocusedQuestion,
      yes: boolean,
      confidence: number,
    ): Omit<Judgment, "id" | "decisionId"> => ({
      question,
      type: "noul",
      answer: yes ? "yes" : "no",
      probabilities: { yes: yes ? confidence : 1 - confidence, no: yes ? 1 - confidence : confidence },
      confidence,
    });

    return [
      mk("sensitive_exposure", sensitive, sensitive ? 0.98 : 0.9),
      mk("policy_violation", violation, violation ? 0.94 : 0.88),
      mk("destructive", destructive, destructive ? 0.95 : 0.9),
      mk("targets_production", prod && destructive, prod && destructive ? 0.96 : 0.85),
      mk(
        "human_review_needed",
        violation || (destructive && prod),
        violation ? 0.92 : destructive && prod ? 0.9 : 0.7,
      ),
    ];
  }
}

/**
 * Real Jev over HTTP — stub behind JEV_API_URL/JEV_API_KEY.
 * Kept server-side only (TRD §6). Throws on missing config so
 * decision-engine fails closed instead of inventing a judgment.
 */
export class HttpJevClient implements JevClient {
  readonly name = "http";
  constructor(
    private apiUrl: string = process.env.JEV_API_URL ?? "",
    private apiKey: string = process.env.JEV_API_KEY ?? "",
  ) {}

  async judge(_state: EvalState): Promise<Omit<Judgment, "id" | "decisionId">[]> {
    if (!this.apiUrl || !this.apiKey) {
      throw new Error("Jev unavailable: JEV_API_URL/JEV_API_KEY not configured");
    }
    // Real HTTP call lands here in V1.5; fail closed until wired.
    throw new Error("Jev unavailable: HttpJevClient not yet wired to endpoint");
  }
}

export function jevClientFromEnv(): JevClient {
  return process.env.JEV_PROVIDER === "http" ? new HttpJevClient() : new MockJevClient();
}
