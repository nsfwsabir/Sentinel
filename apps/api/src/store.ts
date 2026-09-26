import type { Agent, Decision, Judgment, Policy, Tool } from "@sentinel/schemas";

// Store interface — in-memory now, Drizzle PG + Redis in Phase 5.
// Keeps API decoupled so persistence swaps without route changes.
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
};

export interface Store {
  agents: Map<string, Agent>;
  tools: Map<string, Tool>;
  policies: Map<string, Policy>;
  actions: Map<string, StoredAction>;
  decisions: Map<string, StoredDecision>;
}

export function createMemoryStore(): Store {
  return { agents: new Map(), tools: new Map(), policies: new Map(), actions: new Map(), decisions: new Map() };
}

export function seedDefaults(store: Store) {
  const now = new Date();
  if (store.agents.size === 0) {
    store.agents.set("research-agent", {
      id: "research-agent",
      name: "Research Agent",
      status: "active",
      createdAt: now,
    });
    store.agents.set("deploy-agent", {
      id: "deploy-agent",
      name: "Deploy Agent",
      status: "active",
      createdAt: now,
    });
  }
  if (store.tools.size === 0) {
    store.tools.set("send_email", {
      id: "send_email",
      name: "send_email",
      description: "Send email with optional attachments",
      riskLevel: "high",
    });
    store.tools.set("query_database", {
      id: "query_database",
      name: "query_database",
      description: "Read-only database query",
      riskLevel: "medium",
    });
    store.tools.set("delete_resource", {
      id: "delete_resource",
      name: "delete_resource",
      description: "Delete infrastructure resource",
      riskLevel: "critical",
    });
    store.tools.set("refund", {
      id: "refund",
      name: "refund",
      description: "Issue payment refund",
      riskLevel: "high",
    });
  }
  if (store.policies.size === 0) {
    const mk = (
      id: string,
      name: string,
      description: string,
      mode: Policy["mode"],
    ): Policy => ({ id, name, description, severity: "high", mode, enabled: true, version: 1 });
    store.policies.set(
      "pol_exfil",
      mk("pol_exfil", "Customer data", "Customer data must never be sent externally.", "block"),
    );
    store.policies.set(
      "pol_creds",
      mk("pol_creds", "Credentials", "Credentials must never be transmitted externally.", "block"),
    );
    store.policies.set(
      "pol_prod",
      mk("pol_prod", "Production deletion", "Production deletion requires human approval.", "review"),
    );
    store.policies.set(
      "pol_pay",
      mk("pol_pay", "Payments", "Payments above $100 require human approval.", "review"),
    );
  }
}
