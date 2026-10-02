import { readFileSync, existsSync } from "node:fs";
import { loadPolicy } from "@open-policy-agent/opa-wasm";
import {
  evaluateDeterministic,
  type ActionInput,
  type DeterministicFinding,
} from "@sentinel/policy-engine";
import type { Policy } from "@sentinel/schemas";

// OPA-backed deterministic evaluation. The WASM bundle is built from
// policies/sentinel.rego (`pnpm bundle`, OPA CLI v1.x) and committed as
// policies/policy.wasm so dev/CI work without the OPA binary.
// evaluatePolicies() tries OPA first and falls back to the TypeScript engine
// on ANY failure — output shapes are identical, decision-engine untouched.

type OpaFinding = {
  policy_id: string;
  outcome: string;
  reason: string;
};

let cachedPolicy: Awaited<ReturnType<typeof loadPolicy>> | null = null;
let warnedFallback = false;

function bundlePath(): string {
  if (process.env.OPA_BUNDLE_PATH) return process.env.OPA_BUNDLE_PATH;
  return new URL("../policies/policy.wasm", import.meta.url).pathname;
}

export function isOpaAvailable(): boolean {
  try {
    return existsSync(bundlePath());
  } catch {
    return false;
  }
}

async function loadBundle() {
  if (!cachedPolicy) {
    const wasm = readFileSync(bundlePath());
    cachedPolicy = await loadPolicy(wasm);
  }
  return cachedPolicy;
}

/** Validate + normalize raw OPA output. Throws on malformed (fail safe). */
export function mapOpaFindings(raw: unknown): DeterministicFinding[] {
  const wrap = (Array.isArray(raw) ? raw[0] : null) as { result?: unknown } | null;
  const list = wrap?.result;
  if (!Array.isArray(list)) throw new Error("OPA: unexpected result shape");
  return list.map((f) => {
    const o = f as Record<string, unknown>;
    if (typeof o.policy_id !== "string" || typeof o.reason !== "string") {
      throw new Error("OPA: malformed finding");
    }
    const outcome = o.outcome;
    if (outcome !== "block" && outcome !== "review" && outcome !== "audit" && outcome !== "pass") {
      throw new Error(`OPA: unknown outcome ${String(outcome)}`);
    }
    return { policyId: o.policy_id, outcome, reason: o.reason };
  });
}

function opaInput(action: ActionInput, policies: Policy[]) {
  return {
    action: {
      agent_id: action.agentId,
      tool: action.toolName ?? action.toolId,
      arguments: action.arguments,
      context: action.context,
    },
    policies: policies.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      mode: p.mode,
      enabled: p.enabled,
    })),
  };
}

export async function evaluateWithOpa(
  action: ActionInput,
  policies: Policy[],
): Promise<{ findings: DeterministicFinding[]; matchedPolicyIds: string[] }> {
  const policy = await loadBundle();
  const raw = policy.evaluate(opaInput(action, policies));
  const findings = mapOpaFindings(raw);
  return { findings, matchedPolicyIds: findings.map((f) => f.policyId) };
}

/** OPA first, TypeScript engine on any failure. Never throws for policy reasons. */
export async function evaluatePolicies(
  action: ActionInput,
  policies: Policy[],
): Promise<{ findings: DeterministicFinding[]; matchedPolicyIds: string[]; engine: "opa" | "typescript" }> {
  if (isOpaAvailable()) {
    try {
      const r = await evaluateWithOpa(action, policies);
      return { ...r, engine: "opa" as const };
    } catch (err) {
      if (!warnedFallback) {
        warnedFallback = true;
        console.warn(`sentinel: OPA evaluation failed, using TypeScript engine: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  const r = evaluateDeterministic(action, policies);
  return { ...r, engine: "typescript" as const };
}
