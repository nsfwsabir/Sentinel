import type { Agent, Tool, Policy, Decision, Judgment } from "./index.js";

// Shared persistence contract. Memory and Postgres implementations are
// interchangeable; routes depend only on this interface so any number of
// API instances can share one Postgres as the source of truth.
export type ApprovalStatus = "pending" | "approved" | "rejected";

export type StoredAction = {
  id: string;
  agentId: string;
  toolId: string;
  task?: string;
  arguments: Record<string, unknown>;
  createdAt: Date;
};

export type StoredDecision = Decision & {
  judgments: Judgment[];
  reason: string;
  confidence: number;
  approvalStatus?: ApprovalStatus;
  fallbackUsed?: boolean;
};

export type DecisionFilter = {
  outcome?: string;
  agentId?: string;
  toolId?: string;
  limit?: number;
};

export type PurgeResult = {
  deleted: number;
  skippedApprovals: number;
  actionsDeleted: number;
};

export interface Store {
  // Agents
  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  saveAgent(agent: Agent): Promise<void>;
  deleteAgent(id: string): Promise<boolean>;
  // Tools
  listTools(): Promise<Tool[]>;
  getTool(id: string): Promise<Tool | undefined>;
  saveTool(tool: Tool): Promise<void>;
  deleteTool(id: string): Promise<boolean>;
  // Policies
  listPolicies(): Promise<Policy[]>;
  getPolicy(id: string): Promise<Policy | undefined>;
  savePolicy(policy: Policy): Promise<void>;
  deletePolicy(id: string): Promise<boolean>;
  // Actions
  getAction(id: string): Promise<StoredAction | undefined>;
  saveAction(action: StoredAction): Promise<void>;
  deleteAction(id: string): Promise<boolean>;
  listRecentActions(limit: number): Promise<StoredAction[]>;
  listActionsByAgent(agentId: string, limit: number): Promise<StoredAction[]>;
  // Decisions
  getDecision(id: string): Promise<StoredDecision | undefined>;
  saveDecision(decision: StoredDecision): Promise<void>;
  deleteDecision(id: string): Promise<boolean>;
  listDecisions(filter: DecisionFilter): Promise<StoredDecision[]>;
  listReviewDecisions(): Promise<StoredDecision[]>;
  /** Delete decisions before `before`; approvals kept unless included. */
  purgeDecisions(before: Date, opts: { includeApprovals: boolean; limit: number }): Promise<PurgeResult>;
  /** TRD §12 counters, computed over the full store (no list truncation). */
  metrics(): Promise<{
    decisions_total: number;
    allow_total: number;
    review_total: number;
    block_total: number;
    fallback_total: number;
    approvals_total: number;
    pending_total: number;
  }>;
}
