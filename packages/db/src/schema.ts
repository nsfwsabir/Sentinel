import { pgTable, text, boolean, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";

// TRD §3 domain → Postgres tables. Managed PG via DATABASE_URL (Neon).
// IDs are app-assigned strings (act_/dec_/ag_) to match API envelopes.

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tools = pgTable("tools", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  riskLevel: text("risk_level").notNull().default("medium"),
});

export const policies = pgTable("policies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull().default("medium"),
  mode: text("mode").notNull().default("review"),
  enabled: boolean("enabled").notNull().default(true),
  version: integer("version").notNull().default(1),
});

export const actions = pgTable("actions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  toolId: text("tool_id").notNull().references(() => tools.id),
  task: text("task"),
  // AGENTS.md §21: arguments stored REDACTED (see policy-engine redactSecrets)
  arguments: jsonb("arguments").notNull().default({}),
  context: jsonb("context").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: text("id").primaryKey(),
  actionId: text("action_id").notNull().references(() => actions.id),
  outcome: text("outcome").notNull(),
  confidence: real("confidence"),
  reason: text("reason"),
  policyIds: jsonb("policy_ids").notNull().default([]),
  approvalStatus: text("approval_status"),
  fallbackUsed: boolean("fallback_used").notNull().default(false),
  evaluationDurationMs: integer("evaluation_duration_ms"),
  providerDurationMs: integer("provider_duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const judgments = pgTable("judgments", {
  id: text("id").primaryKey(),
  decisionId: text("decision_id").notNull().references(() => decisions.id),
  question: text("question").notNull(),
  type: text("type").notNull().default("noul"),
  answer: jsonb("answer"),
  probabilities: jsonb("probabilities"),
  confidence: real("confidence"),
});
