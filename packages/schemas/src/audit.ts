import { createHash } from "node:crypto";
import type { StoredDecision } from "./store.js";

// Hash-chained audit trail. Every stored decision carries prevHash + hash;
// verification recomputes both, so silent modification of a past verdict
// (BLOCK→ALLOW) or row deletion is detectable without trusting the DB.
// sha256, no HMAC: proves integrity, not origin (see docs/audit-chaining.md).
export const GENESIS_HASH = "0".repeat(64);

export type AuditCheckpoint = {
  id: string;
  createdAt: Date;
  headId: string;
  headHash: string;
  deletedCount: number;
};

export type AuditVerifyResult = {
  ok: boolean;
  checked: number;
  unchained: number;
  bridged: string[];
  firstBadId?: string;
};

/** Canonical JSON: sorted keys, recursive. Excludes hash fields themselves. */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => k !== "hash" && k !== "prevHash")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function decisionContent(d: StoredDecision): Record<string, unknown> {
  return {
    id: d.id,
    actionId: d.actionId,
    outcome: d.outcome,
    confidence: d.confidence,
    reason: d.reason,
    policyIds: d.policyIds,
    approvalStatus: d.approvalStatus ?? null,
    fallbackUsed: d.fallbackUsed ?? false,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    judgments: (d.judgments ?? []).map((j) => ({
      id: j.id,
      question: j.question,
      type: j.type,
      answer: j.answer,
      confidence: j.confidence ?? null,
    })),
  };
}

export function hashDecisionContent(d: StoredDecision, prevHash: string): string {
  return createHash("sha256").update(`${prevHash}\n${canonicalize(decisionContent(d))}`, "utf8").digest("hex");
}

/** Verify an ascending-order decision list against checkpoints. */
export function verifyDecisions(
  rowsAsc: StoredDecision[],
  checkpoints: AuditCheckpoint[],
): AuditVerifyResult {
  const bridges = new Map(checkpoints.map((c) => [c.headHash, c.id]));
  let expectedPrev: string | null = null;
  let checked = 0;
  let unchained = 0;
  const bridged: string[] = [];
  for (const row of rowsAsc) {
    if (!row.hash) {
      if (expectedPrev !== null) return { ok: false, checked, unchained, bridged, firstBadId: row.id };
      unchained += 1;
      continue;
    }
    if (expectedPrev === null) {
      if (row.prevHash !== GENESIS_HASH) {
        const bridge = row.prevHash ? bridges.get(row.prevHash) : undefined;
        if (!bridge) return { ok: false, checked, unchained, bridged, firstBadId: row.id };
        bridged.push(bridge);
      }
    } else if (row.prevHash !== expectedPrev) {
      const bridge = row.prevHash ? bridges.get(row.prevHash) : undefined;
      if (!bridge) return { ok: false, checked, unchained, bridged, firstBadId: row.id };
      bridged.push(bridge);
    }
    if (hashDecisionContent(row, row.prevHash ?? "") !== row.hash) {
      return { ok: false, checked, unchained, bridged, firstBadId: row.id };
    }
    expectedPrev = row.hash;
    checked += 1;
  }
  return { ok: true, checked, unchained, bridged };
}
