import {
  EvaluateResponseSchema,
  AgentSchema,
  ToolSchema,
  PolicySchema,
  DecisionSchema,
  type EvaluateRequest,
  type Agent,
  type Tool,
  type Policy,
} from "@sentinel/schemas";
import { z } from "zod";

// Minimal agent SDK: wraps the Sentinel API. External content is
// untrusted (§11) — the SDK never interprets tool output as policy.
export type SentinelClientOptions = {
  baseUrl: string;
  apiKey: string;
  admin?: { user: string; pass: string };
  fetchImpl?: typeof fetch;
};

const DecisionDetailSchema = DecisionSchema.extend({
  action: z.unknown().optional(),
  judgments: z.array(z.unknown()).optional(),
});
export type DecisionDetail = z.infer<typeof DecisionDetailSchema>;

const PurgeResultSchema = z.object({
  deleted: z.number(),
  skippedApprovals: z.number(),
  actionsDeleted: z.number(),
  signalsDeleted: z.number().default(0),
});

export class SentinelClient {
  constructor(private opts: SentinelClientOptions) {}

  private async call<T>(path: string, init: { method?: string; admin?: boolean; body?: unknown }, schema: z.ZodType<T>): Promise<T> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const headers: Record<string, string> = {};
    if (init.admin) {
      if (!this.opts.admin) throw new Error("admin credentials required");
      headers.authorization = "Basic " + Buffer.from(`${this.opts.admin.user}:${this.opts.admin.pass}`).toString("base64");
    } else {
      headers["x-api-key"] = this.opts.apiKey;
    }
    const hasBody = init.body !== undefined;
    if (hasBody) headers["content-type"] = "application/json";
    const r = await fetchImpl(`${this.opts.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });
    if (r.status === 204) return undefined as T;
    const body = await r.json();
    if (!r.ok) throw new Error((body as { error?: string }).error ?? `request failed: ${path}`);
    return schema.parse(body);
  }

  async evaluateAction(req: EvaluateRequest) {
    return this.call("/v1/actions/evaluate", { method: "POST", body: req }, EvaluateResponseSchema);
  }

  async registerAgent(agent: Agent) {
    return this.call("/v1/agents", { method: "POST", body: agent }, AgentSchema);
  }

  async registerTool(tool: Tool) {
    return this.call("/v1/tools", { method: "POST", body: tool }, ToolSchema);
  }

  async getDecision(id: string): Promise<DecisionDetail> {
    return this.call(`/v1/decisions/${id}`, {}, DecisionDetailSchema);
  }

  async listDecisions(filters: { outcome?: string; agentId?: string; toolId?: string; limit?: number } = {}) {
    const q = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== undefined) as [string, string][],
    ).toString();
    return this.call(`/v1/decisions${q ? `?${q}` : ""}`, {}, z.array(DecisionSchema));
  }

  async approveDecision(id: string) {
    return this.call(
      `/v1/approvals/${id}/approve`,
      { method: "POST", admin: true },
      z.object({ approvalStatus: z.string() }).passthrough(),
    );
  }

  async rejectDecision(id: string) {
    return this.call(
      `/v1/approvals/${id}/reject`,
      { method: "POST", admin: true },
      z.object({ approvalStatus: z.string() }).passthrough(),
    );
  }

  async replayAction(actionId: string) {
    return this.call(`/v1/actions/${actionId}/replay`, { method: "POST" }, EvaluateResponseSchema);
  }

  async dryRunPolicy(policy: Policy) {
    return this.call(
      "/v1/policies/dry-run",
      { method: "POST", body: policy },
      z.object({
        evaluated: z.number(),
        would_block: z.number(),
        would_review: z.number(),
        would_remain_allowed: z.number(),
      }).passthrough(),
    );
  }

  async purgeDecisions(before: string, includeApprovals = false) {
    return this.call(
      `/v1/decisions?before=${encodeURIComponent(before)}&includeApprovals=${includeApprovals}`,
      { method: "DELETE", admin: true },
      PurgeResultSchema,
    );
  }
}
