import { db, isDbConfigured } from "./client.js";
import * as s from "./schema.js";

// Hydrates an in-memory store from Postgres at boot, completing the
// write-through pattern (writes already mirror via persistAudit).
// Single-writer assumption for V1: memory is the read cache, PG the
// durable primary. Multi-writer sync is a later problem.
// ponytail: full-table load on boot; paginate if decisions grow large.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapLike = { set(k: string, v: any): unknown; size: number };

export type HydrateJudgment = {
  id: string;
  decisionId: string;
  question: string;
  type: "noul" | "choice" | "score";
  answer: unknown;
  confidence?: number;
};

export type HydrateTarget = {
  agents: MapLike;
  tools: MapLike;
  policies: MapLike;
  actions: MapLike;
  decisions: MapLike;
};

/** Returns true when hydration ran; false when PG unconfigured (memory-only mode). Throws on query failure. */
export async function hydrateFromPg(target: HydrateTarget): Promise<boolean> {
  if (!isDbConfigured()) return false;
  const d = db();
  const [agentRows, toolRows, policyRows, actionRows, decisionRows, judgmentRows] = await Promise.all([
    d.select().from(s.agents),
    d.select().from(s.tools),
    d.select().from(s.policies),
    d.select().from(s.actions),
    d.select().from(s.decisions),
    d.select().from(s.judgments),
  ]);

  for (const a of agentRows) {
    target.agents.set(a.id, {
      id: a.id,
      name: a.name,
      description: a.description ?? undefined,
      status: a.status === "disabled" ? "disabled" : "active",
      createdAt: a.createdAt,
    });
  }
  for (const t of toolRows) {
    target.tools.set(t.id, {
      id: t.id,
      name: t.name,
      description: t.description,
      riskLevel: (["low", "medium", "high", "critical"].includes(t.riskLevel ?? "")
        ? t.riskLevel
        : "medium") as "low" | "medium" | "high" | "critical",
    });
  }
  for (const p of policyRows) {
    target.policies.set(p.id, {
      id: p.id,
      name: p.name,
      description: p.description,
      severity: (["low", "medium", "high", "critical"].includes(p.severity ?? "")
        ? p.severity
        : "medium") as "low" | "medium" | "high" | "critical",
      mode: (["block", "review", "audit"].includes(p.mode ?? "") ? p.mode : "review") as
        | "block"
        | "review"
        | "audit",
      enabled: p.enabled,
      version: p.version,
    });
  }
  const judgmentsByDecision = new Map<string, HydrateJudgment[]>();
  for (const j of judgmentRows) {
    const list = judgmentsByDecision.get(j.decisionId) ?? [];
    list.push({
      id: j.id,
      decisionId: j.decisionId,
      question: j.question,
      type: (["noul", "choice", "score"].includes(j.type ?? "") ? j.type : "noul") as
        | "noul"
        | "choice"
        | "score",
      answer: j.answer,
      confidence: j.confidence ?? undefined,
    });
    judgmentsByDecision.set(j.decisionId, list);
  }
  for (const a of actionRows) {
    target.actions.set(a.id, {
      id: a.id,
      agentId: a.agentId,
      toolId: a.toolId,
      task: a.task ?? undefined,
      arguments: (a.arguments ?? {}) as Record<string, unknown>,
      createdAt: a.createdAt,
    });
  }
  for (const dec of decisionRows) {
    target.decisions.set(dec.id, {
      id: dec.id,
      actionId: dec.actionId,
      outcome: (["allow", "review", "block"].includes(dec.outcome ?? "") ? dec.outcome : "review") as
        | "allow"
        | "review"
        | "block",
      confidence: dec.confidence ?? undefined,
      reason: dec.reason ?? undefined,
      policyIds: (dec.policyIds ?? []) as string[],
      createdAt: dec.createdAt,
      judgments: judgmentsByDecision.get(dec.id) ?? [],
      approvalStatus: (["pending", "approved", "rejected"].includes(dec.approvalStatus ?? "")
        ? dec.approvalStatus
        : undefined) as "pending" | "approved" | "rejected" | undefined,
    });
  }
  return true;
}
