import type {
  Agent,
  Tool,
  Policy,
  Store,
  StoredAction,
  StoredDecision,
  DecisionFilter,
  ApiKey,
  PolicyVersion,
  Signal,
} from "@sentinel/schemas";
// In-memory Store: hermetic default for tests and zero-dependency dev.
// Postgres (@sentinel/db PgStore) implements the same interface for
// multi-instance deployments.
export function createMemoryStore(): Store {
  const agents = new Map<string, Agent>();
  const tools = new Map<string, Tool>();
  const policies = new Map<string, Policy>();
  const actions = new Map<string, StoredAction>();
  const decisions = new Map<string, StoredDecision>();
  const apiKeys = new Map<string, ApiKey>();
  const policyVersions = new Map<string, PolicyVersion[]>();
  const signals = new Map<string, Signal>();
  const SIGNAL_CAP = 500;

  const assertLimit = (limit: number) => Math.min(Math.max(limit, 0), 5000);

  return {
    async listAgents() {
      return [...agents.values()];
    },
    async getAgent(id) {
      return agents.get(id);
    },
    async saveAgent(a) {
      agents.set(a.id, a);
    },
    async deleteAgent(id) {
      return agents.delete(id);
    },

    async listTools() {
      return [...tools.values()];
    },
    async getTool(id) {
      return tools.get(id);
    },
    async saveTool(t) {
      tools.set(t.id, t);
    },
    async deleteTool(id) {
      return tools.delete(id);
    },

    async listPolicies() {
      return [...policies.values()];
    },
    async getPolicy(id) {
      return policies.get(id);
    },
    async savePolicy(p) {
      policies.set(p.id, p);
    },
    async deletePolicy(id) {
      return policies.delete(id);
    },

    async getAction(id) {
      return actions.get(id);
    },
    async saveAction(a) {
      actions.set(a.id, a);
    },
    async deleteAction(id) {
      return actions.delete(id);
    },
    async listRecentActions(limit) {
      return [...actions.values()].slice(-assertLimit(limit));
    },
    async listActionsByAgent(agentId, limit) {
      return [...actions.values()].filter((a) => a.agentId === agentId).slice(-assertLimit(limit)).reverse();
    },

    async getDecision(id) {
      return decisions.get(id);
    },
    async saveDecision(d) {
      decisions.set(d.id, d);
    },
    async deleteDecision(id) {
      return decisions.delete(id);
    },
    async listDecisions(filter: DecisionFilter) {
      let list = [...decisions.values()];
      if (filter.outcome) list = list.filter((d) => d.outcome === filter.outcome);
      if (filter.agentId || filter.toolId) {
        const actionIds = new Set(
          [...actions.values()]
            .filter((a) => (!filter.agentId || a.agentId === filter.agentId) && (!filter.toolId || a.toolId === filter.toolId))
            .map((a) => a.id),
        );
        list = list.filter((d) => actionIds.has(d.actionId));
      }
      const limit = Math.min(Number(filter.limit ?? 100) || 100, 500);
      return list.slice(-limit).reverse();
    },
    async listReviewDecisions() {
      return [...decisions.values()].filter((d) => d.outcome === "review");
    },
    async listApiKeys() {
      return [...apiKeys.values()].map(({ keyHash: _h, ...meta }) => meta);
    },
    async saveApiKey(k) {
      apiKeys.set(k.id, k);
    },
    async findApiKeyByHash(keyHash) {
      return [...apiKeys.values()].find((k) => k.keyHash === keyHash);
    },
    async deleteApiKey(id) {
      return apiKeys.delete(id);
    },
    async savePolicyVersion(v) {
      const list = policyVersions.get(v.policyId) ?? [];
      list.push(v);
      policyVersions.set(v.policyId, list);
    },
    async listPolicyVersions(policyId) {
      return [...(policyVersions.get(policyId) ?? [])].sort((a, b) => b.version - a.version);
    },
    async saveSignal(signal: Signal) {
      signals.set(signal.id, signal);
      if (signals.size > SIGNAL_CAP) {
        const oldest = [...signals.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
        if (oldest) signals.delete(oldest.id);
      }
    },
    async listSignals(source?: string, limit?: number) {
      const all = [...signals.values()]
        .filter((s) => !source || s.source === source)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return all.slice(0, Math.min(Number(limit ?? 100) || 100, SIGNAL_CAP));
    },
    async metrics() {      const all = [...decisions.values()];
      const count = (f: (d: StoredDecision) => boolean) => all.filter(f).length;
      return {
        decisions_total: all.length,
        allow_total: count((d) => d.outcome === "allow"),
        review_total: count((d) => d.outcome === "review"),
        block_total: count((d) => d.outcome === "block"),
        fallback_total: count((d) => d.fallbackUsed === true),
        approvals_total: count((d) => d.approvalStatus === "approved" || d.approvalStatus === "rejected"),
        pending_total: count((d) => d.outcome === "review" && (!d.approvalStatus || d.approvalStatus === "pending")),
      };
    },
    async purgeDecisions(before, opts) {      let deleted = 0;
      let skippedApprovals = 0;
      const removedActionIds: string[] = [];
      for (const d of [...decisions.values()]) {
        if (deleted >= opts.limit) break;
        if (d.createdAt >= before) continue;
        if (!opts.includeApprovals && (d.approvalStatus === "approved" || d.approvalStatus === "rejected")) {
          skippedApprovals += 1;
          continue;
        }
        decisions.delete(d.id);
        removedActionIds.push(d.actionId);
        deleted += 1;
      }
      // Replay links several decisions to one action: delete only orphans.
      let actionsDeleted = 0;
      const referenced = new Set([...decisions.values()].map((d) => d.actionId));
      for (const actionId of new Set(removedActionIds)) {
        if (!referenced.has(actionId) && actions.delete(actionId)) actionsDeleted += 1;
      }
      let signalsDeleted = 0;
      for (const s of [...signals.values()]) {
        if (s.createdAt < before) {
          signals.delete(s.id);
          signalsDeleted += 1;
        }
      }
      return { deleted, skippedApprovals, actionsDeleted, signalsDeleted };
    },
  };
}

export async function seedStore(store: Store) {
  if ((await store.listAgents()).length === 0) {
    const now = new Date();
    for (const a of [
      { id: "research-agent", name: "Research Agent", status: "active", createdAt: now },
      { id: "deploy-agent", name: "Deploy Agent", status: "active", createdAt: now },
    ] as Agent[]) {
      await store.saveAgent(a);
    }
  }
  if ((await store.listTools()).length === 0) {
    for (const t of [
      { id: "send_email", name: "send_email", description: "Send email with optional attachments", riskLevel: "high" },
      { id: "query_database", name: "query_database", description: "Read-only database query", riskLevel: "medium" },
      { id: "delete_resource", name: "delete_resource", description: "Delete infrastructure resource", riskLevel: "critical" },
      { id: "refund", name: "refund", description: "Issue payment refund", riskLevel: "high" },
    ] as Tool[]) {
      await store.saveTool(t);
    }
  }
  if ((await store.listPolicies()).length === 0) {
    const mk = (id: string, name: string, description: string, mode: Policy["mode"]): Policy => ({
      id, name, description, severity: "high", mode, enabled: true, version: 1,
      scope: "org", agentIds: [],
    });
    for (const p of [
      mk("pol_exfil", "Customer data", "Customer data must never be sent externally.", "block"),
      mk("pol_creds", "Credentials", "Credentials must never be transmitted externally.", "block"),
      mk("pol_prod", "Production deletion", "Production deletion requires human approval.", "review"),
      mk("pol_pay", "Payments", "Payments above $100 require human approval.", "review"),
    ]) {
      await store.savePolicy(p);
    }
  }
}
