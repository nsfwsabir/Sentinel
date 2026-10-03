import { count, isNull, inArray, eq, lt, and } from "drizzle-orm";
import { db } from "./client.js";
import * as s from "./schema.js";
import type {
  Agent,
  Tool,
  Policy,
  Store,
  StoredAction,
  StoredDecision,
  DecisionFilter,
  Judgment,
} from "@sentinel/schemas";

// Postgres Store: the shared source of truth for multi-instance
// deployments. Same interface as the memory store; routes are unchanged.
export function createPgStore(): Store {
  const d = () => db();

  const toAction = (r: typeof s.actions.$inferSelect): StoredAction => ({
    id: r.id,
    agentId: r.agentId,
    toolId: r.toolId,
    task: r.task ?? undefined,
    arguments: (r.arguments ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt,
  });

  const toAgent = (r: typeof s.agents.$inferSelect): Agent => ({
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    status: r.status === "disabled" ? "disabled" : "active",
    createdAt: r.createdAt,
  });

  const toTool = (r: typeof s.tools.$inferSelect): Tool => ({
    id: r.id,
    name: r.name,
    description: r.description,
    riskLevel: (["low", "medium", "high", "critical"].includes(r.riskLevel ?? "") ? r.riskLevel : "medium") as Tool["riskLevel"],
  });

  const toPolicy = (r: typeof s.policies.$inferSelect): Policy => ({
    id: r.id,
    name: r.name,
    description: r.description,
    severity: (["low", "medium", "high", "critical"].includes(r.severity ?? "") ? r.severity : "medium") as Policy["severity"],
    mode: (["block", "review", "audit"].includes(r.mode ?? "") ? r.mode : "review") as Policy["mode"],
    enabled: r.enabled,
    version: r.version,
  });

  const toJudgment = (r: typeof s.judgments.$inferSelect): Judgment => ({
    id: r.id,
    decisionId: r.decisionId,
    question: r.question,
    type: (["noul", "choice", "score"].includes(r.type ?? "") ? r.type : "noul") as Judgment["type"],
    answer: r.answer,
    probabilities: (r.probabilities ?? undefined) as Record<string, number> | undefined,
    confidence: r.confidence ?? undefined,
  });

  const toDecision = (r: typeof s.decisions.$inferSelect, judgments: Judgment[]): StoredDecision => ({
    id: r.id,
    actionId: r.actionId,
    outcome: (["allow", "review", "block"].includes(r.outcome ?? "") ? r.outcome : "review") as StoredDecision["outcome"],
    confidence: r.confidence ?? 0,
    reason: r.reason ?? "",
    policyIds: (r.policyIds ?? []) as string[],
    createdAt: r.createdAt,
    judgments,
    approvalStatus: (["pending", "approved", "rejected"].includes(r.approvalStatus ?? "")
      ? r.approvalStatus
      : undefined) as StoredDecision["approvalStatus"],
    fallbackUsed: r.fallbackUsed,
  });

  const judgmentsFor = async (decisionIds: string[]): Promise<Map<string, Judgment[]>> => {
    const map = new Map<string, Judgment[]>();
    if (decisionIds.length === 0) return map;
    const rows = await d().select().from(s.judgments).where(inArray(s.judgments.decisionId, decisionIds));
    for (const r of rows) {
      const list = map.get(r.decisionId) ?? [];
      list.push(toJudgment(r));
      map.set(r.decisionId, list);
    }
    return map;
  };

  return {
    async listAgents() {
      return (await d().select().from(s.agents)).map(toAgent);
    },
    async getAgent(id) {
      const rows = await d().select().from(s.agents).where(eq(s.agents.id, id));
      return rows[0] ? toAgent(rows[0]) : undefined;
    },
    async saveAgent(a) {
      await d().insert(s.agents).values({
        id: a.id, name: a.name, description: a.description ?? null, status: a.status, createdAt: a.createdAt,
      }).onConflictDoUpdate({
        target: s.agents.id,
        set: { name: a.name, description: a.description ?? null, status: a.status },
      });
    },
    async deleteAgent(id) {
      const rows = await d().delete(s.agents).where(eq(s.agents.id, id)).returning({ id: s.agents.id });
      return rows.length > 0;
    },

    async listTools() {
      return (await d().select().from(s.tools)).map(toTool);
    },
    async getTool(id) {
      const rows = await d().select().from(s.tools).where(eq(s.tools.id, id));
      return rows[0] ? toTool(rows[0]) : undefined;
    },
    async saveTool(t) {
      await d().insert(s.tools).values({
        id: t.id, name: t.name, description: t.description, riskLevel: t.riskLevel,
      }).onConflictDoUpdate({
        target: s.tools.id,
        set: { name: t.name, description: t.description, riskLevel: t.riskLevel },
      });
    },
    async deleteTool(id) {
      const rows = await d().delete(s.tools).where(eq(s.tools.id, id)).returning({ id: s.tools.id });
      return rows.length > 0;
    },

    async listPolicies() {
      return (await d().select().from(s.policies)).map(toPolicy);
    },
    async getPolicy(id) {
      const rows = await d().select().from(s.policies).where(eq(s.policies.id, id));
      return rows[0] ? toPolicy(rows[0]) : undefined;
    },
    async savePolicy(p) {
      await d().insert(s.policies).values({
        id: p.id, name: p.name, description: p.description, severity: p.severity,
        mode: p.mode, enabled: p.enabled, version: p.version,
      }).onConflictDoUpdate({
        target: s.policies.id,
        set: { name: p.name, description: p.description, severity: p.severity, mode: p.mode, enabled: p.enabled, version: p.version },
      });
    },
    async deletePolicy(id) {
      const rows = await d().delete(s.policies).where(eq(s.policies.id, id)).returning({ id: s.policies.id });
      return rows.length > 0;
    },

    async getAction(id) {
      const rows = await d().select().from(s.actions).where(eq(s.actions.id, id));
      return rows[0] ? toAction(rows[0]) : undefined;
    },
    async saveAction(a) {
      await d().insert(s.actions).values({
        id: a.id, agentId: a.agentId, toolId: a.toolId, task: a.task ?? null,
        arguments: a.arguments, context: {}, createdAt: a.createdAt,
      }).onConflictDoNothing();
    },
    async deleteAction(id) {
      const rows = await d().delete(s.actions).where(eq(s.actions.id, id)).returning({ id: s.actions.id });
      return rows.length > 0;
    },
    async listRecentActions(limit) {
      // Ascending, like memory (oldest of the last N first).
      const rows = await d().select().from(s.actions).orderBy(s.actions.createdAt).limit(Math.min(Math.max(limit, 0), 5000));
      return rows.slice(-Math.min(Math.max(limit, 0), 5000)).map(toAction);
    },
    async listActionsByAgent(agentId, limit) {
      // Newest first, like memory.
      const rows = await d().select().from(s.actions).where(eq(s.actions.agentId, agentId)).orderBy(s.actions.createdAt).limit(Math.min(Math.max(limit, 0), 5000));
      return rows.reverse().map(toAction);
    },

    async getDecision(id) {
      const rows = await d().select().from(s.decisions).where(eq(s.decisions.id, id));
      if (!rows[0]) return undefined;
      const jm = await judgmentsFor([id]);
      return toDecision(rows[0], jm.get(id) ?? []);
    },
    async saveDecision(dec) {
      await d().insert(s.decisions).values({
        id: dec.id, actionId: dec.actionId, outcome: dec.outcome, confidence: dec.confidence,
        reason: dec.reason, policyIds: dec.policyIds, approvalStatus: dec.approvalStatus ?? null,
        fallbackUsed: dec.fallbackUsed ?? false, evaluationDurationMs: null, createdAt: dec.createdAt,
      }).onConflictDoUpdate({
        target: s.decisions.id,
        set: {
          outcome: dec.outcome, confidence: dec.confidence, reason: dec.reason, policyIds: dec.policyIds,
          approvalStatus: dec.approvalStatus ?? null, fallbackUsed: dec.fallbackUsed ?? false,
        },
      });
      await d().delete(s.judgments).where(eq(s.judgments.decisionId, dec.id));
      for (const j of dec.judgments) {
        await d().insert(s.judgments).values({
          id: j.id, decisionId: dec.id, question: j.question, type: j.type,
          answer: j.answer as object, probabilities: j.probabilities ?? null, confidence: j.confidence ?? null,
        });
      }
    },
    async deleteDecision(id) {
      await d().delete(s.judgments).where(eq(s.judgments.decisionId, id));
      const rows = await d().delete(s.decisions).where(eq(s.decisions.id, id)).returning({ id: s.decisions.id });
      return rows.length > 0;
    },
    async listDecisions(filter: DecisionFilter) {
      // Newest first, like memory.
      let actionIds: string[] | undefined;
      if (filter.agentId || filter.toolId) {
        const conds = [];
        if (filter.agentId) conds.push(eq(s.actions.agentId, filter.agentId));
        if (filter.toolId) conds.push(eq(s.actions.toolId, filter.toolId));
        const found = await d().select({ id: s.actions.id }).from(s.actions).where(and(...conds));
        actionIds = found.map((r) => r.id);
        if (actionIds.length === 0) return [];
      }
      const conds = [];
      if (filter.outcome) conds.push(eq(s.decisions.outcome, filter.outcome));
      if (actionIds) conds.push(inArray(s.decisions.actionId, actionIds));
      const limit = Math.min(Number(filter.limit ?? 100) || 100, 500);
      const rows = conds.length > 0
        ? await d().select().from(s.decisions).where(and(...conds)).orderBy(s.decisions.createdAt).limit(limit)
        : await d().select().from(s.decisions).orderBy(s.decisions.createdAt).limit(limit);
      const jm = await judgmentsFor(rows.map((r) => r.id));
      return rows.reverse().map((r) => toDecision(r, jm.get(r.id) ?? []));
    },
    async listReviewDecisions() {
      const rows = await d().select().from(s.decisions).where(eq(s.decisions.outcome, "review")).orderBy(s.decisions.createdAt);
      const jm = await judgmentsFor(rows.map((r) => r.id));
      return rows.map((r) => toDecision(r, jm.get(r.id) ?? []));
    },
    async purgeDecisions(before, opts) {
      const old = await d()
        .select({ id: s.decisions.id, actionId: s.decisions.actionId, approvalStatus: s.decisions.approvalStatus, createdAt: s.decisions.createdAt })
        .from(s.decisions)
        .where(lt(s.decisions.createdAt, before));
      let deleted = 0;
      let skippedApprovals = 0;
      const removedActionIds: string[] = [];
      for (const r of old) {
        if (deleted >= opts.limit) break;
        if (!opts.includeApprovals && (r.approvalStatus === "approved" || r.approvalStatus === "rejected")) {
          skippedApprovals += 1;
          continue;
        }
        await d().delete(s.judgments).where(eq(s.judgments.decisionId, r.id));
        await d().delete(s.decisions).where(eq(s.decisions.id, r.id));
        removedActionIds.push(r.actionId);
        deleted += 1;
      }
      let actionsDeleted = 0;
      const remaining = await d().select({ actionId: s.decisions.actionId }).from(s.decisions);
      const referenced = new Set(remaining.map((r) => r.actionId));
      for (const actionId of new Set(removedActionIds)) {
        if (referenced.has(actionId)) continue;
        const gone = await d().delete(s.actions).where(eq(s.actions.id, actionId)).returning({ id: s.actions.id });
        if (gone.length > 0) actionsDeleted += 1;
      }
      return { deleted, skippedApprovals, actionsDeleted };
    },
    async metrics() {
      const n = async (where?: ReturnType<typeof eq>) => {
        const rows = where
          ? await d().select({ n: count() }).from(s.decisions).where(where)
          : await d().select({ n: count() }).from(s.decisions);
        return rows[0]?.n ?? 0;
      };
      const [total, allow, review, block, fallback, approved, rejected, pending, pendingNull] = await Promise.all([
        n(),
        n(eq(s.decisions.outcome, "allow")),
        n(eq(s.decisions.outcome, "review")),
        n(eq(s.decisions.outcome, "block")),
        n(eq(s.decisions.fallbackUsed, true)),
        n(eq(s.decisions.approvalStatus, "approved")),
        n(eq(s.decisions.approvalStatus, "rejected")),
        n(and(eq(s.decisions.outcome, "review"), eq(s.decisions.approvalStatus, "pending"))),
        n(and(eq(s.decisions.outcome, "review"), isNull(s.decisions.approvalStatus))),
      ]);
      return {
        decisions_total: total,
        allow_total: allow,
        review_total: review,
        block_total: block,
        fallback_total: fallback,
        approvals_total: approved + rejected,
        pending_total: pending + pendingNull,
      };
    },
  };
}
