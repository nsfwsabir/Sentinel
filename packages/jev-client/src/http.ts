import { z } from "zod";
import type { Judgment } from "@sentinel/schemas";
import type { EvalState, FocusedQuestion, JevClient } from "./index.js";

// Real Jev over HTTP. Kept server-side only (TRD §6).
// Contract: POST { state, questions } → { judgments: [...] }.
// Any transport failure, timeout, or malformed response throws so the
// decision-engine fails closed instead of inventing a judgment (§18).
const JevJudgmentSchema = z.object({
  question: z.string().min(1),
  type: z.enum(["noul", "choice", "score"]).default("noul"),
  answer: z.unknown(),
  probabilities: z.record(z.number().min(0).max(1)).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const JevResponseSchema = z.object({
  judgments: z.array(JevJudgmentSchema).min(1),
});

export type HttpJevOptions = {
  apiUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class HttpJevClient implements JevClient {
  readonly name = "http";
  private apiUrl: string;
  private apiKey: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(opts?: Partial<HttpJevOptions>) {
    this.apiUrl = opts?.apiUrl ?? process.env.JEV_API_URL ?? "";
    this.apiKey = opts?.apiKey ?? process.env.JEV_API_KEY ?? "";
    this.timeoutMs = opts?.timeoutMs ?? Number(process.env.JEV_TIMEOUT_MS ?? 8000);
    this.fetchImpl = opts?.fetchImpl ?? fetch;
  }

  async judge(state: EvalState): Promise<Omit<Judgment, "id" | "decisionId">[]> {
    if (!this.apiUrl || !this.apiKey) {
      throw new Error("Jev unavailable: JEV_API_URL/JEV_API_KEY not configured");
    }
    const body = JSON.stringify({
      state,
      questions: [
        "sensitive_exposure",
        "policy_violation",
        "human_review_needed",
        "destructive",
        "targets_production",
      ] satisfies FocusedQuestion[],
    });
    // TRD §11: one retry, then fallback policy (thrown → decision-engine fail-closed).
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
        if (!r.ok) throw new Error(`Jev unavailable: HTTP ${r.status}`);
        const parsed = JevResponseSchema.safeParse(await r.json());
        if (!parsed.success) throw new Error("Jev unavailable: malformed response");
        return parsed.data.judgments.map((j) => ({
          question: j.question,
          type: j.type,
          answer: j.answer,
          probabilities: j.probabilities,
          confidence: j.confidence,
        }));
      } catch (err) {
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Jev unavailable: request failed");
  }
}
