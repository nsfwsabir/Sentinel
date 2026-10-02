import { z } from "zod";
import type { Judgment } from "@sentinel/schemas";
import type { EvalState, FocusedQuestion, JudgmentProvider } from "./index.js";

// Laya /v1/systemone wire shape (laya.studio/docs, Jev-wire-compatible).
// Request:  { state, questions: { qid: { type, instructions?, criteria? } }, model? }
// Response: { id, model, answers: { qid: { type, choice?|noul?|score?, probabilities?, confidence? } } }
const LayaAnswerSchema = z.object({
  type: z.enum(["noul", "choice", "score"]),
  choice: z.string().optional(),
  noul: z.number().min(0).max(1).optional(),
  score: z.number().optional(),
  probabilities: z.record(z.number().min(0).max(1)).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const LayaResponseSchema = z.object({
  answers: z.record(LayaAnswerSchema),
});

const QUESTIONS: Record<FocusedQuestion, string> = {
  sensitive_exposure: "Does the action expose sensitive customer information or credentials to an external recipient?",
  policy_violation: "Does the action violate the supplied policy?",
  human_review_needed: "Should a human review this action before it proceeds?",
  destructive: "Is this action destructive or irreversible?",
  targets_production: "Does this action target production infrastructure or data?",
};

import { resolveLayaConfig } from "./config.js";

export type LayaProviderOptions = {
  apiUrl: string;
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class LayaJudgmentProvider implements JudgmentProvider {
  readonly name = "laya";
  private apiUrl: string;
  private apiKey: string;
  private model?: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(opts?: Partial<LayaProviderOptions>) {
    // Validated config: hosted default, custom endpoint via LAYA_API_URL.
    // Sentinel never hosts Laya; explicit opts merge over process env.
    const cfg = resolveLayaConfig({
      ...process.env,
      ...(opts?.apiUrl !== undefined ? { LAYA_API_URL: opts.apiUrl } : {}),
      ...(opts?.apiKey !== undefined ? { LAYA_API_KEY: opts.apiKey } : {}),
      ...(opts?.model !== undefined ? { LAYA_MODEL: opts.model } : {}),
      ...(opts?.timeoutMs !== undefined ? { LAYA_TIMEOUT_MS: String(opts.timeoutMs) } : {}),
    });
    this.apiUrl = cfg.apiUrl;
    this.apiKey = cfg.apiKey;
    this.model = cfg.model;
    this.timeoutMs = cfg.timeoutMs;
    this.fetchImpl = opts?.fetchImpl ?? fetch;
  }

  async judge(state: EvalState): Promise<Omit<Judgment, "id" | "decisionId">[]> {
    const questions: Record<string, { type: "noul"; instructions: string }> = {};
    for (const [qid, instructions] of Object.entries(QUESTIONS)) {
      questions[qid] = { type: "noul", instructions };
    }
    const body = JSON.stringify({
      state: {
        agent: state.agent,
        task: state.task ?? null,
        tool: state.tool,
        arguments: state.arguments,
        policies: state.policies,
        environment: state.environment ?? null,
      },
      questions,
      ...(this.model ? { model: this.model } : {}),
    });
    // One retry, then fallback policy (thrown → decision-engine fail-closed).
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const r = await this.fetchImpl(this.apiUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`,
          },
          body,
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error(`Laya unavailable: HTTP ${r.status}`);
        const parsed = LayaResponseSchema.safeParse(await r.json());
        if (!parsed.success) throw new Error("Laya unavailable: malformed response");
        return this.normalize(parsed.data.answers);
      } catch (err) {
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Laya unavailable: request failed");
  }

  /** Normalize Laya answers into Sentinel judgments. Missing qids fail safe. */
  private normalize(
    answers: Record<string, z.infer<typeof LayaAnswerSchema>>,
  ): Omit<Judgment, "id" | "decisionId">[] {
    return (Object.keys(QUESTIONS) as FocusedQuestion[]).map((qid) => {
      const a = answers[qid];
      if (!a) throw new Error(`Laya unavailable: missing answer for ${qid}`);
      if (a.type !== "noul" || a.noul === undefined) {
        throw new Error(`Laya unavailable: unexpected answer for ${qid}`);
      }
      const yes = a.noul >= 0.5;
      const confidence = a.confidence ?? Math.max(a.noul, 1 - a.noul);
      return {
        question: qid,
        type: "noul" as const,
        answer: yes ? "yes" : "no",
        probabilities: { yes: a.noul, no: 1 - a.noul },
        confidence,
      };
    });
  }
}
