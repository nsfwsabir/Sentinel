import { count, isNull, inArray, eq, lt, and, desc, ne, asc, or } from "drizzle-orm";
import { GENESIS_HASH, hashDecisionContent, signCheckpoint } from "@sentinel/schemas";
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
  ApiKey,
  Signal,
  AuditCheckpoint,
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
    scope: (r.scope === "agent" ? "agent" : "org") as Policy["scope"],
    agentIds: (Array.isArray(r.agentIds) ? r.agentIds : []) as string[],
  });

  const toSignal = (r: typeof s.signals.$inferSelect): Signal => ({
    id: r.id,
    source: r.source,
    rule: r.rule,
    priority: r.priority,
    summary: r.summary,
    fields: (r.fields ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt,
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

  const toDecision = (r: typeof s.decisions.$inferSelect, judgments: Judgment[]): StoredDecision => ({    id: r.id,
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
    prevHash: r.prevHash ?? undefined,
    hash: r.hash ?? undefined,
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
        scope: p.scope, agentIds: p.agentIds,
      }).onConflictDoUpdate({
        target: s.policies.id,
        set: { name: p.name, description: p.description, severity: p.severity, mode: p.mode, enabled: p.enabled, version: p.version, scope: p.scope, agentIds: p.agentIds },
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
      // Last N ascending, like memory: newest N, oldest first.
      const n = Math.min(Math.max(limit, 0), 5000);
      const rows = await d().select().from(s.actions).orderBy(desc(s.actions.createdAt)).limit(n);
      return rows.reverse().map(toAction);
    },
    async listActionsByAgent(agentId, limit) {
      // Newest first, like memory.
      const rows = await d().select().from(s.actions).where(eq(s.actions.agentId, agentId)).orderBy(desc(s.actions.createdAt)).limit(Math.min(Math.max(limit, 0), 5000));
      return rows.map(toAction);
    },

    async getDecision(id) {
      const rows = await d().select().from(s.decisions).where(eq(s.decisions.id, id));
      if (!rows[0]) return undefined;
      const jm = await judgmentsFor([id]);
      return toDecision(rows[0], jm.get(id) ?? []);
    },
    async saveDecision(dec) {
      // Append to the hash chain: preserve an existing link on updates
      // (approvals), otherwise link to the current head (excluding self).
      const [existing, head] = await Promise.all([
        d().select({ prevHash: s.decisions.prevHash }).from(s.decisions).where(eq(s.decisions.id, dec.id)),
        d().select({ hash: s.decisions.hash }).from(s.decisions).where(ne(s.decisions.id, dec.id)).orderBy(desc(s.decisions.createdAt), desc(s.decisions.id)).limit(1),
      ]);
      const prevHash = existing[0]?.prevHash ?? head[0]?.hash ?? GENESIS_HASH;
      const hash = hashDecisionContent({ ...dec, prevHash } as StoredDecision, prevHash);
      await d().insert(s.decisions).values({
        id: dec.id, actionId: dec.actionId, outcome: dec.outcome, confidence: dec.confidence,
        reason: dec.reason, policyIds: dec.policyIds, approvalStatus: dec.approvalStatus ?? null,
        fallbackUsed: dec.fallbackUsed ?? false, evaluationDurationMs: null, createdAt: dec.createdAt,
        prevHash, hash,
      }).onConflictDoUpdate({
        target: s.decisions.id,
        set: {
          outcome: dec.outcome, confidence: dec.confidence, reason: dec.reason, policyIds: dec.policyIds,
          approvalStatus: dec.approvalStatus ?? null, fallbackUsed: dec.fallbackUsed ?? false,
          prevHash, hash,
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
        ? await d().select().from(s.decisions).where(and(...conds)).orderBy(desc(s.decisions.createdAt)).limit(limit)
        : await d().select().from(s.decisions).orderBy(desc(s.decisions.createdAt)).limit(limit);
      const jm = await judgmentsFor(rows.map((r) => r.id));
      return rows.map((r) => toDecision(r, jm.get(r.id) ?? []));
    },
    async listReviewDecisions() {
      // Pending only: approved/rejected reviews leave the queue.
      const rows = await d().select().from(s.decisions).where(eq(s.decisions.outcome, "review")).orderBy(s.decisions.createdAt);
      const jm = await judgmentsFor(rows.map((r) => r.id));
      return rows
        .map((r) => toDecision(r, jm.get(r.id) ?? []))
        .filter((dd) => !dd.approvalStatus || dd.approvalStatus === "pending");
    },
    async listAllDecisionsAsc() {
      const rows = await d().select().from(s.decisions).orderBy(asc(s.decisions.createdAt), asc(s.decisions.id));
      const jm = await judgmentsFor(rows.map((r) => r.id));
      return rows.map((r) => toDecision(r, jm.get(r.id) ?? []));
    },
    async saveCheckpoint(c: AuditCheckpoint) {
      await d().insert(s.auditCheckpoints).values({
        id: c.id, headId: c.headId, headHash: c.headHash, deletedCount: c.deletedCount, signature: c.signature ?? null, createdAt: c.createdAt,
      }).onConflictDoNothing();
    },
    async listCheckpoints() {
      const rows = await d().select().from(s.auditCheckpoints).orderBy(asc(s.auditCheckpoints.createdAt));
      return rows.map((r) => ({
        id: r.id, headId: r.headId, headHash: r.headHash, deletedCount: r.deletedCount ?? 0, signature: r.signature ?? undefined, createdAt: r.createdAt,
      }));
    },
    async purgeDecisions(before, opts) {
      const old = await d()
        .select({ id: s.decisions.id, actionId: s.decisions.actionId, approvalStatus: s.decisions.approvalStatus, hash: s.decisions.hash, createdAt: s.decisions.createdAt })
        .from(s.decisions)
        .where(lt(s.decisions.createdAt, before));
      let deleted = 0;
      let skippedApprovals = 0;
      const removedActionIds: string[] = [];
      const removedHashes: { id: string; hash: string | null; createdAt: Date }[] = [];
      for (const r of old) {
        if (deleted >= opts.limit) break;
        if (!opts.includeApprovals && (r.approvalStatus === "approved" || r.approvalStatus === "rejected")) {
          skippedApprovals += 1;
          continue;
        }
        await d().delete(s.judgments).where(eq(s.judgments.decisionId, r.id));
        await d().delete(s.decisions).where(eq(s.decisions.id, r.id));
        removedActionIds.push(r.actionId);
        removedHashes.push({ id: r.id, hash: r.hash, createdAt: r.createdAt });
        deleted += 1;
      }
      // Checkpoint BEFORE the gap: newest deleted row bridges the chain.
      const head = removedHashes
        .filter((r) => r.hash)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .at(-1);
      if (head?.hash) {
        const checkpoint = signCheckpoint({
          id: `chk_${Date.now().toString(36)}`,
          headId: head.id,
          headHash: head.hash,
          deletedCount: removedHashes.length,
          createdAt: new Date(),
        });
        await d().insert(s.auditCheckpoints).values({
          id: checkpoint.id,
          headId: checkpoint.headId,
          headHash: checkpoint.headHash,
          deletedCount: checkpoint.deletedCount,
          signature: checkpoint.signature ?? null,
          createdAt: checkpoint.createdAt,
        }).onConflictDoNothing();
      }
      let actionsDeleted = 0;
      const remaining = await d().select({ actionId: s.decisions.actionId }).from(s.decisions);
      const referenced = new Set(remaining.map((r) => r.actionId));
      for (const actionId of new Set(removedActionIds)) {
        if (referenced.has(actionId)) continue;
        const gone = await d().delete(s.actions).where(eq(s.actions.id, actionId)).returning({ id: s.actions.id });
        if (gone.length > 0) actionsDeleted += 1;
      }
      const oldSignals = await d().delete(s.signals).where(lt(s.signals.createdAt, before)).returning({ id: s.signals.id });
      return { deleted, skippedApprovals, actionsDeleted, signalsDeleted: oldSignals.length };
    },
    async saveSignal(signal) {
      await d().insert(s.signals).values({
        id: signal.id,
        source: signal.source,
        rule: signal.rule,
        priority: signal.priority,
        summary: signal.summary,
        fields: signal.fields,
        createdAt: signal.createdAt,
      }).onConflictDoNothing();
    },
    async listSignals(source?: string, limit?: number) {
      // Newest first, like memory.
      const cap = Math.min(Number(limit ?? 100) || 100, 500);
      const rows = source
        ? await d().select().from(s.signals).where(eq(s.signals.source, source)).orderBy(desc(s.signals.createdAt)).limit(cap)
        : await d().select().from(s.signals).orderBy(desc(s.signals.createdAt)).limit(cap);
      return rows.map(toSignal);
    },
    async listApiKeys() {
      const rows = await d().select().from(s.apiKeys).orderBy(s.apiKeys.createdAt);
      return rows.map((r) => ({ id: r.id, label: r.label, boundAgentId: r.boundAgentId ?? undefined, createdAt: r.createdAt }));
    },
    async saveApiKey(k) {
      await d().insert(s.apiKeys).values({
        id: k.id, label: k.label, keyHash: k.keyHash, boundAgentId: k.boundAgentId ?? null, createdAt: k.createdAt,
      }).onConflictDoUpdate({
        target: s.apiKeys.id,
        set: { label: k.label, keyHash: k.keyHash, boundAgentId: k.boundAgentId ?? null },
      });
    },
    async findApiKeyByHash(keyHash) {
      const rows = await d().select().from(s.apiKeys).where(eq(s.apiKeys.keyHash, keyHash));
      const r = rows[0];
      return r ? { id: r.id, label: r.label, keyHash: r.keyHash, boundAgentId: r.boundAgentId ?? undefined, createdAt: r.createdAt } : undefined;
    },
    async deleteApiKey(id) {
      const rows = await d().delete(s.apiKeys).where(eq(s.apiKeys.id, id)).returning({ id: s.apiKeys.id });
      return rows.length > 0;
    },
    async savePolicyVersion(v) {
      await d().insert(s.policyVersions).values({
        policyId: v.policyId,
        version: v.version,
        name: v.name,
        description: v.description,
        severity: v.severity,
        mode: v.mode,
        enabled: v.enabled,
        createdAt: v.createdAt,
      }).onConflictDoNothing();
    },
    async listPolicyVersions(policyId) {
      const rows = await d().select().from(s.policyVersions).where(eq(s.policyVersions.policyId, policyId));
      return rows
        .map((r) => ({
          policyId: r.policyId,
          version: r.version,
          name: r.name,
          description: r.description,
          severity: r.severity,
          mode: r.mode,
          enabled: r.enabled,
          createdAt: r.createdAt,
        }))
        .sort((a, b) => b.version - a.version);
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
        n(or(eq(s.decisions.outcome, "allow"), eq(s.decisions.approvalStatus, "approved"))),
        n(and(eq(s.decisions.outcome, "review"), or(eq(s.decisions.approvalStatus, "pending"), isNull(s.decisions.approvalStatus)))),
        n(or(eq(s.decisions.outcome, "block"), eq(s.decisions.approvalStatus, "rejected"))),
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
