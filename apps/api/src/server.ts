import { createMemoryStore, seedStore } from "./store.js";
import type { Store } from "@sentinel/schemas";
import { evaluateDeterministic, redactSecrets } from "@sentinel/policy-engine";
import { evaluatePolicies } from "@sentinel/policy-opa";
import { decide, riskScore } from "@sentinel/decision-engine";
import { providerFromEnv } from "@sentinel/judgment-provider";
import { EvaluateRequestSchema, PolicySchema, AgentSchema, ToolSchema, verifyDecisions, getAuditSigner, verifyCheckpointSignature } from "@sentinel/schemas";
import { parseBasicAuth, verifyAdminCredentials } from "./auth.js";
import { authenticateAgent, agentAuthFromEnv, seedEnvKeys, generateApiKey, hashApiKey, type AgentAuthOptions } from "./agentAuth.js";
import { childLogger } from "@sentinel/logger";
import { z } from "zod";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

/** Crash production boot on dev secrets. Pure env check, unit-tested. */
export function productionSecretProblems(env: Record<string, string | undefined> = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  const agentKeys = (env.AGENT_API_KEYS ?? "dev-key-1").split(",").map((s) => s.trim());
  if (agentKeys.includes("dev-key-1")) problems.push("AGENT_API_KEYS contains dev-key-1");
  if (!env.ADMIN_PASS_HASH && (env.ADMIN_PASS ?? "admin") === "admin") {
    problems.push("set ADMIN_PASS_HASH (ADMIN_PASS=admin is dev-only)");
  }
  return problems;
}

async function requireAdmin(req: { headers: Record<string, string | string[] | undefined> }) {  // Production: ADMIN_PASS_HASH (scrypt). Dev fallback: ADMIN_PASS plaintext.
  // Real enforcement lives here (node:crypto); the dashboard middleware gate is defense-in-depth only.
  const creds = parseBasicAuth(req.headers["authorization"]);
  if (!creds || !(await verifyAdminCredentials(creds.user, creds.password))) {
    const err = new Error("unauthorized: admin approval requires basic auth") as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
}

// Per-IP throttle for expensive or brute-forceable routes (replay burns
// Laya credits, dry-run loops, admin paths face credential stuffing).
// Returns false + replies 429 when over limit. Fail-open like evaluate.
async function checkIpLimit(
  req: { ip: string },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  name: string,
  perMin: number,
): Promise<boolean> {
  try {
    const { checkLimit } = await import("@sentinel/db");
    const { allowed } = await checkLimit(`ip:${name}:${req.ip}`, perMin);
    if (!allowed) {
      reply.code(429).send({ error: "rate limited" });
      return false;
    }
  } catch {
    // limiter unavailable — continue
  }
  return true;
}

const adminLimit = () => Number(process.env.RATE_LIMIT_ADMIN_PER_MIN ?? 30);

export async function buildServer(store: Store = createMemoryStore(), opts?: { agentAuth?: AgentAuthOptions }): Promise<FastifyInstance> {
  await seedStore(store);
  const agentAuthCfg = opts?.agentAuth ?? agentAuthFromEnv();
  await seedEnvKeys(store, agentAuthCfg.staticKeys);
  // Registry lookup for every request (revocation must take effect).
  const withRegistry: typeof agentAuthCfg = {
    ...agentAuthCfg,
    findApiKeyByHash: (h) => store.findApiKeyByHash(h),
  };
  const app = Fastify({ logger: false });
  // Baseline security headers (HSTS/CSP/frame-options/...). JSON API:
  // nothing browser-rendered, so a tight policy costs nothing.
  await app.register(import("@fastify/helmet"), {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  const provider = providerFromEnv();

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err.statusCode ?? 500;
    if (err instanceof z.ZodError || status === 400) {
      return reply.code(400).send({ error: "invalid request" });
    }
    if (status >= 500) {
      // Never leak internals (PG/Drizzle/fetch details) to callers;
      // full error goes to the server log only.
      childLogger({ request_id: req.id }).error({ err: String(err?.stack ?? err) }, "internal error");
      return reply.code(status).send({ error: "internal error" });
    }
    reply.code(status).send({ error: err.message });
  });

  app.get("/health", async () => ({ ok: true }));

  // TRD §4 evaluation pipeline
  app.post("/v1/actions/evaluate", async (req, reply) => {
    const identity = await authenticateAgent(req.headers, withRegistry);
    const requestId = randomUUID();
    const started = Date.now();
    const parsed = EvaluateRequestSchema.parse(req.body);

    // Bound identity overrides self-assertion: a credential for agent X
    // cannot submit actions as agent Y.
    const boundId =
      identity.kind === "oidc" ? identity.agentId : identity.kind === "key" ? identity.agentId : undefined;
    if (boundId && parsed.agentId !== boundId) {
      return reply.code(403).send({ error: "agent identity mismatch" });
    }

    // Rate limit per agent (Redis when configured, memory otherwise).
    // Fail-open: limiter errors never block evaluation.
    try {
      const { checkLimit } = await import("@sentinel/db");
      const limit = Number(process.env.RATE_LIMIT_PER_MIN ?? 120);
      const { allowed } = await checkLimit(`eval:${parsed.agentId}`, limit);
      if (!allowed) return reply.code(429).send({ error: "rate limited" });
    } catch {
      // limiter unavailable — continue
    }

    const agent = await store.getAgent(parsed.agentId);
    if (!agent || agent.status !== "active") {
      return reply.code(403).send({ error: "unknown or disabled agent" });
    }
    const tool = await store.getTool(parsed.toolId);
    if (!tool) return reply.code(404).send({ error: "unknown tool" });

    return runEvaluation(store, provider, {
      agent,
      tool,
      agentId: parsed.agentId,
      toolId: parsed.toolId,
      task: parsed.task,
      args: parsed.arguments,
      context: parsed.context,
      requestId,
      started,
    });
  });

  // V1.5 decision replay: re-run a stored action through current policies.
  // Links the new decision to the SAME action for before/after comparison.
  app.post("/v1/actions/:id/replay", async (req, reply) => {
    await authenticateAgent(req.headers, withRegistry);
    if (!(await checkIpLimit(req, reply, "replay", Number(process.env.RATE_LIMIT_PER_MIN ?? 120)))) return;
    const { id } = req.params as { id: string };
    const stored = await store.getAction(id);
    if (!stored) return reply.code(404).send({ error: "unknown action" });
    const agent = await store.getAgent(stored.agentId);
    if (!agent || agent.status !== "active") {
      return reply.code(403).send({ error: "unknown or disabled agent" });
    }
    const tool = await store.getTool(stored.toolId);
    if (!tool) return reply.code(404).send({ error: "unknown tool" });
    return runEvaluation(store, provider, {
      agent,
      tool,
      agentId: stored.agentId,
      toolId: stored.toolId,
      task: stored.task,
      args: stored.arguments,
      context: {},
      requestId: randomUUID(),
      started: Date.now(),
      reuseActionId: stored.id,
    });
  });

  // V1.5 policy dry-run: deterministic only (no provider call), counts how a
  // candidate policy would have treated stored actions.
  app.post("/v1/policies/dry-run", async (req, reply) => {
    await authenticateAgent(req.headers, withRegistry);
    if (!(await checkIpLimit(req, reply, "dryrun", adminLimit()))) return;
    const candidate = PolicySchema.parse(req.body);
    const q = (req.query ?? {}) as { limit?: string };
    const limit = Math.min(Number(q.limit ?? 200) || 200, 1000);
    const actions = await store.listRecentActions(limit);
    let wouldBlock = 0;
    let wouldReview = 0;
    const matchedActionIds: string[] = [];
    for (const a of actions) {
      if (candidate.scope === "agent" && !candidate.agentIds.includes(a.agentId)) continue;
      const tool = await store.getTool(a.toolId);
      const { findings } = evaluateDeterministic(
        { agentId: a.agentId, toolId: a.toolId, toolName: tool?.name, arguments: a.arguments, context: {} },
        [candidate],
      );
      const worst = findings.find((f) => f.outcome === "block")
        ?? findings.find((f) => f.outcome === "review");
      if (worst?.outcome === "block") {
        wouldBlock += 1;
        matchedActionIds.push(a.id);
      } else if (worst) {
        wouldReview += 1;
        matchedActionIds.push(a.id);
      }
    }
    return {
      evaluated: actions.length,
      would_block: wouldBlock,
      would_review: wouldReview,
      would_remain_allowed: actions.length - wouldBlock - wouldReview,
      matchedActionIds: matchedActionIds.slice(0, 100),
    };
  });

  // Policies CRUD (TRD §9)
  app.get("/v1/policies", async () => store.listPolicies());
  async function snapshotPolicy(p: { id: string; version: number; name: string; description: string; severity: string; mode: string; enabled: boolean }) {
    await store.savePolicyVersion({
      policyId: p.id,
      version: p.version,
      name: p.name,
      description: p.description,
      severity: p.severity,
      mode: p.mode,
      enabled: p.enabled,
      createdAt: new Date(),
    });
  }

  app.post("/v1/policies", async (req, reply) => {
    await authenticateAgent(req.headers, withRegistry);
    const p = PolicySchema.parse(req.body);
    await store.savePolicy(p);
    await snapshotPolicy(p);
    return reply.code(201).send(p);
  });
  app.get("/v1/policies/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await store.getPolicy(id);
    if (!p) return reply.code(404).send({ error: "not found" });
    return p;
  });
  app.patch("/v1/policies/:id", async (req) => {
    await authenticateAgent(req.headers, withRegistry);
    const { id } = req.params as { id: string };
    const cur = await store.getPolicy(id);
    if (!cur) throw Object.assign(new Error("not found"), { statusCode: 404 });
    // Every mutation bumps version; client-supplied id/version ignored.
    const next = { ...cur, ...((req.body ?? {}) as object), id: cur.id, version: cur.version + 1 };
    const p = PolicySchema.parse(next);
    await store.savePolicy(p);
    await snapshotPolicy(p);
    return p;
  });
  app.get("/v1/policies/:id/versions", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await store.getPolicy(id))) return reply.code(404).send({ error: "not found" });
    return store.listPolicyVersions(id);
  });
  app.post("/v1/policies/:id/revert/:version", async (req, reply) => {
    await authenticateAgent(req.headers, withRegistry);
    const { id, version } = req.params as { id: string; version: string };
    const cur = await store.getPolicy(id);
    if (!cur) return reply.code(404).send({ error: "not found" });
    const target = (await store.listPolicyVersions(id)).find((v) => v.version === Number(version));
    if (!target) return reply.code(404).send({ error: "version not found" });
    // Revert creates a NEW version with old content; history stays append-only.
    const p = PolicySchema.parse({
      ...cur,
      name: target.name,
      description: target.description,
      severity: target.severity,
      mode: target.mode,
      enabled: target.enabled,
      version: cur.version + 1,
    });
    await store.savePolicy(p);
    await snapshotPolicy(p);
    return p;
  });
  app.delete("/v1/policies/:id", async (req, reply) => {
    await authenticateAgent(req.headers, withRegistry);
    const { id } = req.params as { id: string };
    if (!(await store.deletePolicy(id))) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });

  // Decisions + approvals
  app.get("/v1/decisions", async (req) => {
    const q = req.query as { outcome?: string; agentId?: string; toolId?: string; limit?: string };
    return store.listDecisions({
      outcome: q.outcome,
      agentId: q.agentId,
      toolId: q.toolId,
      limit: Math.min(Number(q.limit ?? 100) || 100, 500),
    });
  });
  app.get("/v1/decisions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = await store.getDecision(id);
    if (!d) return reply.code(404).send({ error: "not found" });
    const action = await store.getAction(d.actionId);
    const policies = await store.listPolicies();
    const byId = new Map(policies.map((p) => [p.id, p]));
    const tool = action ? await store.getTool(action.toolId) : undefined;
    const risk = riskScore({
      toolRisk: tool?.riskLevel,
      severities: d.policyIds.map((pid) => byId.get(pid)?.severity ?? "low"),
    });
    return { ...d, action, risk };
  });
  app.get("/v1/approvals", async () => store.listReviewDecisions());
  const setApproval = (status: "approved" | "rejected") => async (req: unknown, reply: unknown) => {
    const fastifyReq = req as { headers: Record<string, string | string[] | undefined>; ip: string };
    if (!(await checkIpLimit(fastifyReq, reply as never, "approvals", adminLimit()))) return;
    // Approvals accept admin basic auth OR an OIDC token carrying the
    // sentinel:approvers scope. Static agent keys are never enough here.
    const headers = (req as { headers: Record<string, string | string[] | undefined> }).headers;
    let authorized = false;
    try {
      await requireAdmin(req as never);
      authorized = true;
    } catch {
      const identity = await authenticateAgent(headers, withRegistry).catch(() => null);
      authorized = identity !== null && "scopes" in identity && identity.scopes.includes("sentinel:approvers");
    }
    if (!authorized) {
      return (reply as { code: (n: number) => { send: (b: unknown) => unknown } })
        .code(401)
        .send({ error: "unauthorized: approvals require admin or approver token" });
    }
    const { id } = (req as { params: { id: string } }).params;
    const d = await store.getDecision(id);
    if (!d) {
      return (reply as { code: (n: number) => { send: (b: unknown) => unknown } })
        .code(404)
        .send({ error: "not found" });
    }
    // REVIEW is first-class: every approval audited, never auto-converted (§20)
    const next = { ...d, approvalStatus: status as "approved" | "rejected" };
    await store.saveDecision(next);
    childLogger({ decision_id: id, decision: status }).info("approval");
    return next;
  };
  app.post("/v1/approvals/:id/approve", setApproval("approved"));
  app.post("/v1/approvals/:id/reject", setApproval("rejected"));

  // API key registry (admin-only). Plaintext tokens are returned once at
  // create/rotate time; only sha256 hashes are stored, never the keys.
  app.get("/v1/api-keys", async (req) => {
    await requireAdmin(req);
    return store.listApiKeys();
  });
  app.post("/v1/api-keys", async (req, reply) => {
    if (!(await checkIpLimit(req, reply, "apikeys", adminLimit()))) return;
    await requireAdmin(req);
    const body = (req.body ?? {}) as { label?: unknown; boundAgentId?: unknown };
    if (typeof body.label !== "string" || body.label.length === 0) {
      return reply.code(400).send({ error: "label is required" });
    }
    if (body.boundAgentId !== undefined) {
      if (typeof body.boundAgentId !== "string" || !(await store.getAgent(body.boundAgentId))) {
        return reply.code(404).send({ error: "unknown agent for boundAgentId" });
      }
    }
    const { id, token } = generateApiKey();
    const meta = {
      id,
      label: body.label,
      boundAgentId: typeof body.boundAgentId === "string" ? body.boundAgentId : undefined,
      createdAt: new Date(),
    };
    await store.saveApiKey({ ...meta, keyHash: hashApiKey(token) });
    childLogger({ decision: `key:create:${id}` }).info("apikey");
    return reply.code(201).send({ ...meta, token });
  });
  app.post("/v1/api-keys/:id/rotate", async (req, reply) => {
    if (!(await checkIpLimit(req, reply, "apikeys", adminLimit()))) return;
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    const cur = (await store.listApiKeys()).find((k) => k.id === id);
    if (!cur) return reply.code(404).send({ error: "not found" });
    const { token } = generateApiKey();
    // Re-save with a new hash (id/label/binding preserved; old token dies).
    await store.saveApiKey({
      id: cur.id,
      label: cur.label,
      boundAgentId: cur.boundAgentId,
      createdAt: cur.createdAt,
      keyHash: hashApiKey(token),
    });
    childLogger({ decision: `key:rotate:${id}` }).info("apikey");
    return { ...cur, token };
  });
  app.delete("/v1/api-keys/:id", async (req, reply) => {
    if (!(await checkIpLimit(req, reply, "apikeys", adminLimit()))) return;
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    if (!(await store.deleteApiKey(id))) return reply.code(404).send({ error: "not found" });
    childLogger({ decision: `key:revoke:${id}` }).info("apikey");
    return reply.code(204).send();
  });

  // Agents + tools — PRD §9 success criteria steps 1 & 3.
  app.get("/v1/agents", async () => store.listAgents());
  app.post("/v1/agents", async (req, reply) => {
    await authenticateAgent(req.headers, withRegistry);
    const a = AgentSchema.parse({ ...(req.body as object), createdAt: new Date().toISOString() });
    await store.saveAgent(a);
    return reply.code(201).send(a);
  });
  app.patch("/v1/agents/:id", async (req) => {
    await authenticateAgent(req.headers, withRegistry);
    const { id } = req.params as { id: string };
    const cur = await store.getAgent(id);
    if (!cur) throw Object.assign(new Error("not found"), { statusCode: 404 });
    const next = AgentSchema.parse({ ...cur, ...((req.body ?? {}) as object) });
    await store.saveAgent(next);
    return next;
  });
  app.get("/v1/agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const a = await store.getAgent(id);
    if (!a) return reply.code(404).send({ error: "not found" });
    const recentActions = await store.listActionsByAgent(id, 10);
    return { ...a, recentActions };
  });
  app.delete("/v1/agents/:id", async (req, reply) => {
    await authenticateAgent(req.headers, withRegistry);
    const { id } = req.params as { id: string };
    if (!(await store.deleteAgent(id))) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });
  app.get("/v1/tools", async () => store.listTools());
  app.post("/v1/tools", async (req, reply) => {
    await authenticateAgent(req.headers, withRegistry);
    const t = ToolSchema.parse(req.body);
    await store.saveTool(t);
    return reply.code(201).send(t);
  });
  app.get("/v1/tools/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const t = await store.getTool(id);
    if (!t) return reply.code(404).send({ error: "not found" });
    return t;
  });
  app.patch("/v1/tools/:id", async (req) => {
    await authenticateAgent(req.headers, withRegistry);
    const { id } = req.params as { id: string };
    const cur = await store.getTool(id);
    if (!cur) throw Object.assign(new Error("not found"), { statusCode: 404 });
    const next = ToolSchema.parse({ ...cur, ...((req.body ?? {}) as object), id: cur.id });
    await store.saveTool(next);
    return next;
  });
  app.delete("/v1/tools/:id", async (req, reply) => {
    await authenticateAgent(req.headers, withRegistry);
    const { id } = req.params as { id: string };
    if (!(await store.deleteTool(id))) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });

  // External detection signals (Falco alerts, etc.) are evidence only:
  // stored, listed, and shown in the dashboard. They never auto-decide.
  app.post("/v1/signals/:source", async (req, reply) => {
    await authenticateAgent(req.headers, withRegistry);
    if (!(await checkIpLimit(req, reply, "signals", Number(process.env.RATE_LIMIT_PER_MIN ?? 120)))) return;
    const { source } = req.params as { source: string };
    if (source !== "falco") return reply.code(404).send({ error: "unknown signal source" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    // Accept Falco JSON output shape: { rule, priority, output_fields, ... }.
    const rule = body.rule;
    const priority = body.priority;
    if (typeof rule !== "string" || typeof priority !== "string") {
      return reply.code(400).send({ error: "falco signal requires rule and priority strings" });
    }
    const fields =
      body.output_fields && typeof body.output_fields === "object"
        ? (body.output_fields as Record<string, unknown>)
        : {};
    const signal = {
      id: `sig_${randomUUID().slice(0, 8)}`,
      source,
      rule,
      priority,
      summary: typeof body.output === "string" ? body.output : `${rule} [${priority}]`,
      fields,
      createdAt: new Date(),
    };
    await store.saveSignal(signal);
    childLogger({ decision: `signal:${source}:${rule}` }).info("signal");
    return reply.code(201).send(signal);
  });
  app.get("/v1/signals", async (req) => {
    const q = req.query as { source?: string; limit?: string };
    return store.listSignals(q.source, Math.min(Number(q.limit ?? 100) || 100, 500));
  });

  // Retention (TRD §10): purge decisions created before a cutoff.
  // Admin-only. Approved/rejected decisions are audit evidence and kept
  // unless includeApprovals=true. Orphaned actions are removed with their
  // last referencing decision. PG mirror follows best-effort.
  app.delete("/v1/decisions", async (req, reply) => {
    if (!(await checkIpLimit(req, reply, "purge", adminLimit()))) return;
    await requireAdmin(req);
    const q = req.query as { before?: string; includeApprovals?: string; limit?: string };
    if (!q.before) return reply.code(400).send({ error: "before (ISO date) is required" });
    const cutoff = new Date(q.before);
    if (Number.isNaN(cutoff.getTime())) return reply.code(400).send({ error: "before must be a valid ISO date" });
    const includeApprovals = q.includeApprovals === "true";
    const limit = Math.min(Number(q.limit ?? 1000) || 1000, 5000);

    const result = await store.purgeDecisions(cutoff, { includeApprovals, limit });
    childLogger({ decision: `purge:${result.deleted}` }).info("retention");
    return result;
  });

  // TRD §12 metrics — computed over the full store, no list truncation.
  app.get("/v1/metrics", async () => store.metrics());

  // Audit integrity: recompute the decision hash chain and report the
  // first break (if any) plus retention checkpoints (chain restarts).
  // Checkpoints carry Ed25519 signatures when AUDIT_SIGNING_KEY is set;
  // anchorPublicKey lets third parties verify origin offline.
  app.get("/v1/audit/verify", async (req, reply) => {
    if (!(await checkIpLimit(req, reply, "purge", adminLimit()))) return;
    await requireAdmin(req);
    const [rows, checkpoints] = await Promise.all([store.listAllDecisionsAsc(), store.listCheckpoints()]);
    const { publicKey } = getAuditSigner();
    return {
      ...verifyDecisions(rows, checkpoints),
      anchorPublicKey: publicKey,
      checkpoints: checkpoints.map((c) => ({
        ...c,
        signatureValid: publicKey ? verifyCheckpointSignature(c, publicKey) : null,
      })),
    };
  });

  // Provider status (public metadata, never secrets) + connection test (admin).
  app.get("/v1/provider/status", async () => {
    if (process.env.JUDGMENT_PROVIDER !== "laya") return { provider: "mock" };
    try {
      const { resolveLayaConfig } = await import("@sentinel/judgment-provider");
      const cfg = resolveLayaConfig();
      return { provider: "laya", mode: cfg.mode, warnings: cfg.warnings };
    } catch (err) {
      return { provider: "laya", mode: "invalid", warnings: [], error: err instanceof Error ? err.message : "invalid config" };
    }
  });
  app.post("/v1/provider/test", async (req, reply) => {
    if (!(await checkIpLimit(req as never, reply as never, "providertest", adminLimit()))) return;
    await requireAdmin(req as never);
    const started = Date.now();
    const base = { provider: provider.name } as { provider: string; latencyMs: number } & Record<string, unknown>;
    try {
      const judgments = await provider.judge({
        agent: "sentinel-test",
        task: "connection test",
        tool: "query_database",
        arguments: { q: "select 1" },
        policies: [],
        environment: "development",
      });
      return {
        ...base,
        latencyMs: Date.now() - started,
        ok: true,
        judgments: judgments.map((j) => ({ question: j.question, answer: j.answer, confidence: j.confidence })),
      };
    } catch (err) {
      return reply.code(502).send({
        ...base,
        latencyMs: Date.now() - started,
        ok: false,
        error: err instanceof Error ? err.message : "connection failed",
      });
    }
  });

  return app;
}

/** Shared evaluation pipeline (TRD §4), used by evaluate + replay. */
async function runEvaluation(
  store: Store,
  provider: ReturnType<typeof providerFromEnv>,
  input: {
    agent: { id: string; name: string; description?: string; status: string };
    tool: { id: string; name: string; description: string; riskLevel: "low" | "medium" | "high" | "critical" };
    agentId: string;
    toolId: string;
    task?: string;
    args: Record<string, unknown>;
    context: Record<string, unknown>;
    requestId: string;
    started: number;
    reuseActionId?: string;
  },
) {
  const allPolicies = await store.listPolicies();
  // Scope filter: org (or legacy scopeless) policies apply everywhere;
  // agent-scoped policies apply only to their listed agents.
  const policies = allPolicies.filter(
    (p) => p.scope !== "agent" || p.agentIds.includes(input.agentId),
  );
  // OPA WASM first, TypeScript engine on any failure. Same output shape.
  const { findings, matchedPolicyIds } = await evaluatePolicies(
    {
      agentId: input.agentId,
      toolId: input.toolId,
      toolName: input.tool.name,
      arguments: input.args,
      context: input.context,
    },
    policies,
  );

  const decision = await decide({
    state: {
      agent: input.agentId,
      task: input.task,
      tool: input.tool.name,
      arguments: input.args,
      policies: policies.filter((p) => p.enabled).map((p) => p.description),
      environment: String(input.context["env"] ?? input.context["environment"] ?? ""),
    },
    deterministic: findings,
    toolRisk: input.tool.riskLevel,
    provider,
  });

  const actionId = input.reuseActionId ?? `act_${randomUUID().slice(0, 8)}`;
  const decisionId = `dec_${randomUUID().slice(0, 8)}`;
  const redacted = redactSecrets(input.args);
  if (!input.reuseActionId) {
    await store.saveAction({
      id: actionId,
      agentId: input.agentId,
      toolId: input.toolId,
      task: input.task,
      arguments: redacted,
      createdAt: new Date(),
    });
  }
  await store.saveDecision({
    id: decisionId,
    actionId,
    outcome: decision.outcome,
    confidence: decision.confidence,
    reason: decision.reason,
    policyIds: [...new Set([...matchedPolicyIds, ...decision.policyIds])],
    createdAt: new Date(),
    judgments: decision.judgments.map((j, i) => ({
      id: `jud_${decisionId}_${i}`,
      decisionId,
      question: j.question,
      type: "noul" as const,
      answer: j.answer,
      confidence: j.confidence,
    })),
    approvalStatus: decision.outcome === "review" ? "pending" : undefined,
    fallbackUsed: decision.fallbackUsed,
  });

  childLogger({
    request_id: input.requestId,
    decision_id: decisionId,
    agent_id: input.agentId,
    tool: input.tool.name,
    policy_ids: matchedPolicyIds,
    evaluation_duration_ms: Date.now() - input.started,
    decision: decision.outcome,
    confidence: decision.confidence,
    fallback_used: decision.fallbackUsed,
  }).info("decision");

  // Writes go straight to the configured store (memory or Postgres);
  // no mirror step: the store IS the source of truth.
  const byId = new Map(policies.map((p) => [p.id, p]));
  const risk = riskScore({
    toolRisk: input.tool.riskLevel,
    severities: matchedPolicyIds.map((id) => byId.get(id)?.severity ?? "low"),
  });
  return {
    decision: decision.outcome,
    confidence: decision.confidence,
    reason: decision.reason,
    decisionId,
    risk,
  };
}
