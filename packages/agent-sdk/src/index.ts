import { EvaluateResponseSchema, type EvaluateRequest } from "@sentinel/schemas";

// Minimal agent SDK: wraps POST /v1/actions/evaluate.
// External content is untrusted (§11) — SDK never interprets tool output as policy.
export type SentinelClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
};

export class SentinelClient {
  constructor(private opts: SentinelClientOptions) {}

  async evaluateAction(req: EvaluateRequest) {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const r = await fetchImpl(`${this.opts.baseUrl}/v1/actions/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.opts.apiKey },
      body: JSON.stringify(req),
    });
    const body = await r.json();
    if (!r.ok) throw new Error((body as { error?: string }).error ?? "evaluate failed");
    return EvaluateResponseSchema.parse(body);
  }
}
