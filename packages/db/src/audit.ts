import { redactSecrets } from "@sentinel/policy-engine";

// TRD §12 observability + AGENTS.md §21 data minimization.
// Audit rows store metadata + redacted args, never raw secrets.
export type AuditRecord = {
  request_id: string;
  decision_id: string;
  agent_id: string;
  tool: string;
  policy_ids: string[];
  evaluation_duration_ms: number;
  jev_duration_ms?: number;
  decision: string;
  confidence?: number;
  fallback_used: boolean;
  redacted_arguments: Record<string, unknown>;
};

export function buildAuditRecord(input: {
  requestId: string;
  decisionId: string;
  agentId: string;
  tool: string;
  policyIds: string[];
  evaluationDurationMs: number;
  jevDurationMs?: number;
  decision: string;
  confidence?: number;
  fallbackUsed: boolean;
  args: Record<string, unknown>;
}): AuditRecord {
  return {
    request_id: input.requestId,
    decision_id: input.decisionId,
    agent_id: input.agentId,
    tool: input.tool,
    policy_ids: input.policyIds,
    evaluation_duration_ms: input.evaluationDurationMs,
    jev_duration_ms: input.jevDurationMs,
    decision: input.decision,
    confidence: input.confidence,
    fallback_used: input.fallbackUsed,
    redacted_arguments: redactSecrets(input.args),
  };
}
