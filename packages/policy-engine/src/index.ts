import type { Policy } from "@sentinel/schemas";

export type DeterministicFinding = {
  policyId: string;
  outcome: "block" | "review" | "audit" | "pass";
  reason: string;
};

export type ActionInput = {
  agentId: string;
  toolId: string;
  toolName?: string;
  arguments: Record<string, unknown>;
  context: Record<string, unknown>;
};

const CREDENTIAL_KEYS = [
  "api_key",
  "apikey",
  "secret",
  "password",
  "passwd",
  "token",
  "aws_secret",
  "private_key",
  "client_secret",
];

const CREDENTIAL_VALUE_RE =
  /(sk-(live|test)-[a-z0-9]{8,}|AKIA[0-9A-Z]{16}|xox[bpas]-[a-z0-9-]+|-----BEGIN (RSA )?PRIVATE KEY-----)/i;

const CUSTOMER_DATA_RE = /(customers\.csv|customer[_-]?data|\bssn\b|\bpassport\b)/i;

const EXTERNAL_SEND_TOOLS = new Set([
  "send_email",
  "http_post",
  "webhook_post",
  "slack_post",
  "upload_external",
]);

const DESTRUCTIVE_TOOLS = new Set([
  "delete_resource",
  "delete_database",
  "drop_database",
  "deploy_app",
  "destroy_infra",
  "rm_production",
]);

const PAYMENT_TOOLS = new Set(["refund", "charge", "payment", "transfer", "send_payment"]);

function argText(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args).toLowerCase();
  } catch {
    return "";
  }
}

function hasCredential(args: Record<string, unknown>): boolean {
  const text = argText(args);
  if (CREDENTIAL_VALUE_RE.test(text)) return true;
  return CREDENTIAL_KEYS.some((k) => text.includes(`"${k}"`) || text.includes(k));
}

function recipient(args: Record<string, unknown>, context: Record<string, unknown>): string {
  const a = args as Record<string, unknown>;
  const raw =
    a["to"] ?? a["recipient"] ?? a["email"] ?? context["recipient"] ?? context["to"] ?? "";
  return String(raw ?? "").toLowerCase();
}

function isExternalRecipient(args: Record<string, unknown>, context: Record<string, unknown>): boolean {
  const to = recipient(args, context);
  if (!to) return false;
  const allowed = context["allowedDomains"];
  if (Array.isArray(allowed) && allowed.length > 0) {
    return !allowed.some((d) => to.endsWith(String(d).toLowerCase()));
  }
  // MVP default: anything addressed outside is external unless context says internal:true
  if (context["internal"] === true) return false;
  return true;
}

function environment(context: Record<string, unknown>): string {
  return String(context["env"] ?? context["environment"] ?? "development").toLowerCase();
}

function amount(args: Record<string, unknown>): number | null {
  const v = args["amount"] ?? args["value"] ?? args["total"];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

/**
 * Deterministic checks only (TRD §5, AGENTS.md §8).
 * Never calls AI. Each enabled policy maps to exact code.
 * Precedence resolved later by decision-engine: BLOCK > REVIEW > ALLOW.
 */
export function evaluateDeterministic(
  action: ActionInput,
  policies: Policy[],
): { findings: DeterministicFinding[]; matchedPolicyIds: string[] } {
  const findings: DeterministicFinding[] = [];
  const text = argText(action.arguments);
  const tool = (action.toolName ?? action.toolId).toLowerCase();
  const env = environment(action.context);
  const external = EXTERNAL_SEND_TOOLS.has(tool) && isExternalRecipient(action.arguments, action.context);
  const credential = hasCredential(action.arguments);
  const customerData = CUSTOMER_DATA_RE.test(text);
  const destructive = DESTRUCTIVE_TOOLS.has(tool) || /delete|destroy|drop/i.test(tool);
  const targetsProd = env === "production" || env === "prod";
  const amt = PAYMENT_TOOLS.has(tool) ? amount(action.arguments) : null;

  for (const p of policies) {
    if (!p.enabled) continue;
    const name = `${p.name} ${p.description}`.toLowerCase();
    const wantsExternalBlock =
      name.includes("external") || name.includes("exfil") || name.includes("customer data");
    const wantsCredentialBlock =
      name.includes("credential") || name.includes("secret") || name.includes("api key");
    const wantsProdApproval =
      name.includes("production") && (name.includes("delet") || name.includes("destruct") || destructive);
    const wantsPaymentApproval = name.includes("payment") || name.includes("$100") || name.includes("refund");

    // 1. Customer data exfiltration → policy.mode (usually block)
    if (wantsExternalBlock && customerData && external) {
      findings.push({
        policyId: p.id,
        outcome: p.mode === "audit" ? "audit" : p.mode,
        reason: `Customer data would be sent to external recipient ${recipient(action.arguments, action.context) || "(unknown)"}.`,
      });
      continue;
    }
    // 2. Credential transmission → block
    if (wantsCredentialBlock && credential && external) {
      findings.push({
        policyId: p.id,
        outcome: "block",
        reason: "Credentials detected in arguments destined for external recipient.",
      });
      continue;
    }
    // 3. Production deletion/destruction → at least review (only prod policies)
    if (wantsProdApproval && destructive && targetsProd) {
      findings.push({
        policyId: p.id,
        outcome: p.mode === "block" ? "block" : "review",
        reason: `Destructive action '${tool}' targets production and requires human approval.`,
      });
      continue;
    }
    // 4. Payments above $100 → review (only payment policies)
    if (wantsPaymentApproval && amt !== null && amt > 100) {
      findings.push({
        policyId: p.id,
        outcome: p.mode === "block" ? "block" : "review",
        reason: `Payment amount $${amt} exceeds $100 approval threshold.`,
      });
      continue;
    }
    // 5. Dev infra auto-allow contributes no finding (explicit pass)
  }

  return {
    findings,
    matchedPolicyIds: findings.filter((f) => f.outcome !== "pass").map((f) => f.policyId),
  };
}

/** AGENTS.md §21: redact secrets before persistence. Reuse — no custom crypto. */
export function redactSecrets(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (CREDENTIAL_KEYS.some((ck) => k.toLowerCase().includes(ck))) {
      out[k] = "[REDACTED]";
    } else if (typeof v === "string" && CREDENTIAL_VALUE_RE.test(v)) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactSecrets(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
