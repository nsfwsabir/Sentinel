import type { Judgment } from "@sentinel/schemas";

// AGENTS.md: Laya answers focused questions, never "should we allow this?"
// The provider is judgment-only; policy, precedence, and thresholds live in
// @sentinel/decision-engine. Laya must never become the policy engine.
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

export interface JudgmentProvider {
  judge(state: EvalState): Promise<Omit<Judgment, "id" | "decisionId">[]>;
  readonly name: string;
  /** Public, secret-free metadata for /v1/provider/status. Optional. */
  describeConfig?(): { mode?: string; warnings: string[] };
}

function textOf(state: EvalState): string {
  return JSON.stringify({ ...state.arguments, task: state.task ?? "" }).toLowerCase();
}

/**
 * Deterministic stand-in (JUDGMENT_PROVIDER=mock).
 * Mirrors the real question shapes so LayaJudgmentProvider can swap in.
 */
export class MockJudgmentProvider implements JudgmentProvider {
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
 * Laya over HTTP — see ./laya.ts. Re-exported here so consumers
 * keep a single import. Kept server-side only.
 */
export { LayaJudgmentProvider, type LayaProviderOptions } from "./laya.js";
export { resolveLayaConfig, HOSTED_API_URL, type LayaMode, type ResolvedLayaConfig } from "./config.js";
export { SystemOneJudgmentProvider, QUESTIONS, type SystemOneProviderOptions } from "./systemone.js";
export { OpenAIJudgmentProvider, OPENAI_API_URL, resolveOpenAIConfig, type OpenAIProviderOptions } from "./openai.js";
export { resolveSystemOneEnvConfig, type SystemOneEnvConfig } from "./config.js";
import { LayaJudgmentProvider } from "./laya.js";
import { OpenAIJudgmentProvider } from "./openai.js";
import { SystemOneJudgmentProvider } from "./systemone.js";
import { resolveSystemOneEnvConfig } from "./config.js";

export const MS_DECISION_API_URL = "https://openrouter.ai/api/alpha/decisions";
export const MS_DECISION_MODEL = "microsoft/microsoft-decision-1";

type ProviderFactory = (env: Record<string, string | undefined>) => JudgmentProvider;

const registry = new Map<string, ProviderFactory>();

/** Register a custom-wire model. Wire-compatibles need no code — see jev/ms-decision below. */
export function registerProvider(name: string, factory: ProviderFactory): void {
  registry.set(name, factory);
}

function msDecisionProvider(env: Record<string, string | undefined>): JudgmentProvider {
  const cfg = resolveSystemOneEnvConfig(env, {
    prefix: "MS_DECISION",
    defaultUrl: MS_DECISION_API_URL,
    defaultModel: MS_DECISION_MODEL,
    requireKey: true,
  });
  return new SystemOneJudgmentProvider("ms-decision", cfg);
}

function jevProvider(env: Record<string, string | undefined>): JudgmentProvider {
  const cfg = resolveSystemOneEnvConfig(env, {
    prefix: "JEV",
    requireKey: "when-remote",
  });
  return new SystemOneJudgmentProvider("jev", cfg);
}

registerProvider("mock", () => new MockJudgmentProvider());
registerProvider("laya", (env) => new LayaJudgmentProvider({ env }));
registerProvider("openai", (env) => new OpenAIJudgmentProvider({ env }));
registerProvider("ms-decision", msDecisionProvider);
registerProvider("jev", jevProvider);

export function providerNames(): string[] {
  return [...registry.keys()];
}

export function providerFromEnv(env: Record<string, string | undefined> = process.env): JudgmentProvider {
  const name = (env.JUDGMENT_PROVIDER ?? "").trim() || "mock";
  const factory = registry.get(name);
  // Unknown names refuse to boot: a typo must never silently evaluate
  // against the mock. Factory errors (missing keys, bad URLs) also throw.
  if (!factory) {
    throw new Error(
      `Unknown JUDGMENT_PROVIDER "${name}"; registered providers: ${providerNames().join(", ")}`,
    );
  }
  return factory(env);
}
