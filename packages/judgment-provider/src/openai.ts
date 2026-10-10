import { z } from "zod";
import type { Judgment } from "@sentinel/schemas";
import { redactSecrets } from "@sentinel/policy-engine";
import type { EvalState, JudgmentProvider } from "./index.js";
import { QUESTIONS } from "./systemone.js";
import { isLocalhost } from "./config.js";

// OpenAI Decisions API (public beta): typed predicate answers with
// calibrated probabilities instead of generated text.
// Request:  { model, input, questions: { qid: { type: "predicate", instructions } } }
// Response: { predicates: { qid: { probability } }, refusals?: { qid: … }, model, usage }
// Our five noul questions map 1:1 onto predicates. Refusals and missing
// answers throw → decision-engine fail-closed (same contract as Laya).
const PredicateSchema = z.object({
  probability: z.number().min(0).max(1),
});

const OpenAIResponseSchema = z.object({
  predicates: z.record(PredicateSchema),
  refusals: z.record(z.unknown()).optional(),
});

export const OPENAI_API_URL = "https://api.openai.com/v1/decisions";

export type OpenAIProviderOptions = {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export function resolveOpenAIConfig(env: Record<string, string | undefined> = process.env): {
  mode: "hosted" | "custom";
  apiUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  warnings: string[];
} {
  const apiUrl = env.OPENAI_API_URL ?? OPENAI_API_URL;
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error(`Invalid OPENAI_API_URL: not a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Invalid OPENAI_API_URL: only http(s) endpoints are allowed`);
  }
  const warnings: string[] = [];
  if (url.protocol === "http:" && !isLocalhost(url.hostname)) {
    warnings.push("OPENAI_API_URL uses plain HTTP for a non-localhost endpoint; prefer HTTPS");
  }
  const apiKey = env.OPENAI_API_KEY ?? "";
  if (!apiKey) throw new Error(`OPENAI_API_KEY is required`);
  const model = env.OPENAI_MODEL ?? "";
  if (!model) throw new Error(`OPENAI_MODEL is required (e.g. a decisions model name)`);
  const timeoutMs = Number(env.OPENAI_TIMEOUT_MS ?? 8000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid OPENAI_TIMEOUT_MS: must be a positive number`);
  }
  return { mode: env.OPENAI_API_URL !== undefined ? "custom" : "hosted", apiUrl, apiKey, model, timeoutMs, warnings };
}

export class OpenAIJudgmentProvider implements JudgmentProvider {
  readonly name = "openai";
  private apiUrl: string;
  private apiKey: string;
  private model: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;
  private warnings: string[];

  constructor(opts?: Partial<OpenAIProviderOptions> & { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> }) {
    const cfg = resolveOpenAIConfig({
      ...(opts?.env ?? process.env),
      ...(opts?.apiUrl !== undefined ? { OPENAI_API_URL: opts.apiUrl } : {}),
      ...(opts?.apiKey !== undefined ? { OPENAI_API_KEY: opts.apiKey } : {}),
      ...(opts?.model !== undefined ? { OPENAI_MODEL: opts.model } : {}),
      ...(opts?.timeoutMs !== undefined ? { OPENAI_TIMEOUT_MS: String(opts.timeoutMs) } : {}),
    });
    this.apiUrl = cfg.apiUrl;
    this.apiKey = cfg.apiKey;
    this.model = cfg.model;
    this.timeoutMs = cfg.timeoutMs;
    this.fetchImpl = opts?.fetchImpl ?? fetch;
    this.warnings = cfg.warnings;
  }

  describeConfig(): { mode?: string; warnings: string[] } {
    return { warnings: this.warnings };
  }

  async judge(state: EvalState): Promise<Omit<Judgment, "id" | "decisionId">[]> {
    // Same minimization as the System-One path: redacted args only.
    const questions: Record<string, { type: "predicate"; instructions: string }> = {};
    for (const [qid, instructions] of Object.entries(QUESTIONS)) {
      questions[qid] = { type: "predicate", instructions };
    }
    const body = JSON.stringify({
      model: this.model,
      input: {
        agent: state.agent,
        task: state.task ?? null,
        tool: state.tool,
        arguments: redactSecrets(state.arguments),
        policies: state.policies,
        environment: state.environment ?? null,
      },
      questions,
    });
    // One retry, then fail-closed upstream.
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
        if (!r.ok) throw new Error(`openai unavailable: HTTP ${r.status}`);
        const parsed = OpenAIResponseSchema.safeParse(await r.json());
        if (!parsed.success) throw new Error("openai unavailable: malformed response");
        return this.normalize(parsed.data);
      } catch (err) {
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("openai unavailable: request failed");
  }

  private normalize(
    data: z.infer<typeof OpenAIResponseSchema>,
  ): Omit<Judgment, "id" | "decisionId">[] {
    return (Object.keys(QUESTIONS) as (keyof typeof QUESTIONS)[]).map((qid) => {
      if (data.refusals?.[qid] !== undefined) {
        throw new Error(`openai unavailable: refused to answer ${qid}`);
      }
      const a = data.predicates[qid];
      if (!a) throw new Error(`openai unavailable: missing answer for ${qid}`);
      const p = a.probability;
      const yes = p >= 0.5;
      // Predicates carry no confidence field; the probability is the answer.
      const confidence = Math.max(p, 1 - p);
      return {
        question: qid,
        type: "noul" as const,
        answer: yes ? "yes" : "no",
        probabilities: { yes: p, no: 1 - p },
        confidence,
      };
    });
  }
}
