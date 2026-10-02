import pino from "pino";

// Reuse pino (AGENTS.md §4: do not reinvent logging).
// Emits TRD §12 observability fields as structured keys.

export type LogFields = {
  request_id?: string;
  decision_id?: string;
  agent_id?: string;
  tool?: string;
  policy_ids?: string[];
  evaluation_duration_ms?: number;
  provider_duration_ms?: number;
  decision?: string;
  confidence?: number;
  fallback_used?: boolean;
};

const base = pino({
  level: process.env.LOG_LEVEL ?? "info",
});

export const logger = base;

export function childLogger(fields: LogFields) {
  return base.child(fields);
}
