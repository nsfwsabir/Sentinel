import { z } from "zod";

// TRD §3 — Core Domain Model. Zod is the single source of truth;
// infer TS types from schemas (search-first: reuse zod, no hand validators).

export const AgentStatus = z.enum(["active", "disabled"]);
export const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  status: AgentStatus,
  createdAt: z.coerce.date(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const RiskLevel = z.enum(["low", "medium", "high", "critical"]);
export const ToolSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  riskLevel: RiskLevel,
});
export type Tool = z.infer<typeof ToolSchema>;

export const Severity = z.enum(["low", "medium", "high", "critical"]);
export const PolicyMode = z.enum(["block", "review", "audit"]);
export const PolicyScope = z.enum(["org", "agent"]);
export const PolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  severity: Severity,
  mode: PolicyMode,
  enabled: z.boolean(),
  version: z.number().int().positive(),
  // Missing scope = org: preserves current behavior for existing policies.
  scope: PolicyScope.default("org"),
  agentIds: z.array(z.string().min(1)).default([]),
});
export type Policy = z.infer<typeof PolicySchema>;

export const ActionSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  toolId: z.string().min(1),
  // AGENTS.md §21 data minimization: args validated but redaction happens at API boundary
  arguments: z.record(z.unknown()),
  context: z.record(z.unknown()),
  createdAt: z.coerce.date(),
});
export type Action = z.infer<typeof ActionSchema>;

export const DecisionOutcome = z.enum(["allow", "review", "block"]);
export const DecisionSchema = z.object({
  id: z.string().min(1),
  actionId: z.string().min(1),
  outcome: DecisionOutcome,
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  policyIds: z.array(z.string()),
  createdAt: z.coerce.date(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const JudgmentType = z.enum(["noul", "choice", "score"]);
export const JudgmentSchema = z.object({
  id: z.string().min(1),
  decisionId: z.string().min(1),
  question: z.string().min(1),
  type: JudgmentType,
  answer: z.unknown(),
  probabilities: z.record(z.number().min(0).max(1)).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type Judgment = z.infer<typeof JudgmentSchema>;

// API envelopes (TRD §9)
export const EvaluateRequestSchema = z.object({
  agentId: z.string().min(1),
  toolId: z.string().min(1),
  task: z.string().min(1).optional(),
  arguments: z.record(z.unknown()).default({}),
  context: z.record(z.unknown()).default({}),
});
export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;

export const EvaluateResponseSchema = z.object({
  decision: DecisionOutcome,
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  decisionId: z.string().min(1),
});
export type EvaluateResponse = z.infer<typeof EvaluateResponseSchema>;

export * from "./store.js";
export * from "./audit.js";
