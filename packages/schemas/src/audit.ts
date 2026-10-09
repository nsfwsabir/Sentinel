import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
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
  /** Base64 Ed25519 signature over checkpointContent; absent when no key configured. */
  signature?: string;
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

/** Canonical checkpoint content: what the signature covers. */
export function checkpointContent(c: AuditCheckpoint): string {
  return canonicalize({
    id: c.id,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
    headId: c.headId,
    headHash: c.headHash,
    deletedCount: c.deletedCount,
  });
}

export type AuditSigner = { publicKey: string };

let cachedRaw: string | null = null;
let cachedSigner: AuditSigner | { publicKey: null } | null = null;

// Offline Ed25519 key. AUDIT_SIGNING_KEY is base64 PKCS8 DER; when unset,
// checkpoints stay unsigned (hash chain still verifies, origin unproven).
// Cached per key value so env changes (tests, rotation) take effect.
export function getAuditSigner(): AuditSigner | { publicKey: null } {
  const raw = (process.env.AUDIT_SIGNING_KEY ?? "").trim();
  if (cachedSigner && cachedRaw === raw) return cachedSigner;
  cachedRaw = raw;
  if (!raw) return (cachedSigner = { publicKey: null });
  try {
    const privateKey = createPrivateKey({ key: Buffer.from(raw, "base64"), format: "der", type: "pkcs8" });
    const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64");
    return (cachedSigner = { publicKey });
  } catch {
    return (cachedSigner = { publicKey: null });
  }
}

/** Sign a checkpoint in place; no-op when no key is configured. */
export function signCheckpoint(c: AuditCheckpoint): AuditCheckpoint {
  const raw = (process.env.AUDIT_SIGNING_KEY ?? "").trim();
  if (!raw) return c;
  try {
    const privateKey = createPrivateKey({ key: Buffer.from(raw, "base64"), format: "der", type: "pkcs8" });
    c.signature = sign(null, Buffer.from(checkpointContent(c), "utf8"), privateKey).toString("base64");
  } catch {
    // Invalid key: leave unsigned rather than writing a bad signature.
  }
  return c;
}

export function verifyCheckpointSignature(c: AuditCheckpoint, publicKey: string): boolean {
  if (!c.signature) return false;
  try {
    const key = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
    return verify(null, Buffer.from(checkpointContent(c), "utf8"), key, Buffer.from(c.signature, "base64"));
  } catch {
    return false;
  }
}
