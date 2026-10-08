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
  scope: text("scope").notNull().default("org"),
  agentIds: jsonb("agent_ids").notNull().default([]),
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
  prevHash: text("prev_hash"),
  hash: text("hash"),
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

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  boundAgentId: text("bound_agent_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const policyVersions = pgTable("policy_versions", {
  policyId: text("policy_id").notNull(),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull(),
  mode: text("mode").notNull(),
  enabled: boolean("enabled").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const signals = pgTable("signals", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  rule: text("rule").notNull(),
  priority: text("priority").notNull(),
  summary: text("summary").notNull(),
  fields: jsonb("fields").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditCheckpoints = pgTable("audit_checkpoints", {
  id: text("id").primaryKey(),
  headId: text("head_id").notNull(),
  headHash: text("head_hash").notNull(),
  deletedCount: integer("deleted_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
