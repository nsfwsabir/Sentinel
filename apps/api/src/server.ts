import { createMemoryStore, seedDefaults, type Store } from "./store.js";
import { evaluateDeterministic, redactSecrets } from "@sentinel/policy-engine";
import { decide } from "@sentinel/decision-engine";
import { providerFromEnv } from "@sentinel/judgment-provider";
import { EvaluateRequestSchema, PolicySchema, AgentSchema, ToolSchema } from "@sentinel/schemas";
import { parseBasicAuth, verifyAdminCredentials } from "./auth.js";
import { childLogger } from "@sentinel/logger";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

export function agentKeys(): string[] {
  return (process.env.AGENT_API_KEYS ?? "dev-key-1")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function requireAgentKey(req: { headers: Record<string, string | string[] | undefined> }) {
  const raw = req.headers["x-api-key"] ?? req.headers["authorization"];
  const key = Array.isArray(raw) ? raw[0] : (raw ?? "").replace(/^Bearer\s+/i, "");
  if (!key || !agentKeys().includes(key)) {
    const err = new Error("unauthorized: missing or invalid agent API key") as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
}

async function requireAdmin(req: { headers: Record<string, string | string[] | undefined> }) {
  // Production: ADMIN_PASS_HASH (scrypt). Dev fallback: ADMIN_PASS plaintext.
  // Real enforcement lives here (node:crypto); the dashboard middleware gate is defense-in-depth only.
  const creds = parseBasicAuth(req.headers["authorization"]);
  if (!creds || !(await verifyAdminCredentials(creds.user, creds.password))) {
    const err = new Error("unauthorized: admin approval requires basic auth") as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
}

export function buildServer(store: Store = createMemoryStore()): FastifyInstance {
  seedDefaults(store);
  const app = Fastify({ logger: false });
  const provider = providerFromEnv();

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const status = err.statusCode ?? 500;
    reply.code(status).send({ error: err.message });
  });

  app.get("/health", async () => ({ ok: true }));

  // TRD §4 evaluation pipeline
  app.post("/v1/actions/evaluate", async (req, reply) => {
    requireAgentKey(req);
    const requestId = randomUUID();
    const started = Date.now();
    const parsed = EvaluateRequestSchema.parse(req.body);

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

    const agent = store.agents.get(parsed.agentId);
    if (!agent || agent.status !== "active") {
      return reply.code(403).send({ error: "unknown or disabled agent" });
    }
    const tool = store.tools.get(parsed.toolId);
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
    requireAgentKey(req);
    const { id } = req.params as { id: string };
    const stored = store.actions.get(id);
    if (!stored) return reply.code(404).send({ error: "unknown action" });
    const agent = store.agents.get(stored.agentId);
    if (!agent || agent.status !== "active") {
      return reply.code(403).send({ error: "unknown or disabled agent" });
    }
    const tool = store.tools.get(stored.toolId);
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
    requireAgentKey(req);
    const candidate = PolicySchema.parse(req.body);
    const q = (req.query ?? {}) as { limit?: string };
    const limit = Math.min(Number(q.limit ?? 200) || 200, 1000);
    const actions = [...store.actions.values()].slice(-limit);
    let wouldBlock = 0;
    let wouldReview = 0;
    const matchedActionIds: string[] = [];
    for (const a of actions) {
      const tool = store.tools.get(a.toolId);
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
  app.get("/v1/policies", async () => [...store.policies.values()]);
  app.post("/v1/policies", async (req, reply) => {
    requireAgentKey(req);
    const p = PolicySchema.parse(req.body);
    store.policies.set(p.id, p);
    return reply.code(201).send(p);
  });
  app.get("/v1/policies/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = store.policies.get(id);
    if (!p) return reply.code(404).send({ error: "not found" });
    return p;
  });
  app.patch("/v1/policies/:id", async (req) => {
    requireAgentKey(req);
    const { id } = req.params as { id: string };
    const cur = store.policies.get(id);
    if (!cur) throw Object.assign(new Error("not found"), { statusCode: 404 });
    // Every mutation bumps version; client-supplied id/version ignored.
    const next = { ...cur, ...((req.body ?? {}) as object), id: cur.id, version: cur.version + 1 };
    const p = PolicySchema.parse(next);
    store.policies.set(id, p);
    return p;
  });
  app.delete("/v1/policies/:id", async (req, reply) => {
    requireAgentKey(req);
    const { id } = req.params as { id: string };
    if (!store.policies.delete(id)) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });

  // Decisions + approvals
  app.get("/v1/decisions", async (req) => {
    const q = req.query as { outcome?: string; agentId?: string; toolId?: string; limit?: string };
    let list = [...store.decisions.values()];
    if (q.outcome) list = list.filter((d) => d.outcome === q.outcome);
    if (q.agentId) {
      const actionIds = new Set(
        [...store.actions.values()].filter((a) => a.agentId === q.agentId).map((a) => a.id),
      );
      list = list.filter((d) => actionIds.has(d.actionId));
    }
    if (q.toolId) {
      const actionIds = new Set(
        [...store.actions.values()].filter((a) => a.toolId === q.toolId).map((a) => a.id),
      );
      list = list.filter((d) => actionIds.has(d.actionId));
    }
    const limit = Math.min(Number(q.limit ?? 100) || 100, 500);
    return list.slice(-limit).reverse();
  });
  app.get("/v1/decisions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = store.decisions.get(id);
    if (!d) return reply.code(404).send({ error: "not found" });
    const action = store.actions.get(d.actionId);
    return { ...d, action };
  });
  app.get("/v1/approvals", async () =>
    [...store.decisions.values()].filter((d) => d.outcome === "review"),
  );
  const setApproval = (status: "approved" | "rejected") => async (req: unknown, reply: unknown) => {
    await requireAdmin(req as never);
    const { id } = (req as { params: { id: string } }).params;
    const d = store.decisions.get(id);
    if (!d) {
      return (reply as { code: (n: number) => { send: (b: unknown) => unknown } })
        .code(404)
        .send({ error: "not found" });
    }
    // REVIEW is first-class: every approval audited, never auto-converted (§20)
    const next = { ...d, approvalStatus: status as "approved" | "rejected" };
    store.decisions.set(id, next);
    childLogger({ decision_id: id, decision: status }).info("approval");
    return next;
  };
  app.post("/v1/approvals/:id/approve", setApproval("approved"));
  app.post("/v1/approvals/:id/reject", setApproval("rejected"));

  // Agents + tools — PRD §9 success criteria steps 1 & 3.
  app.get("/v1/agents", async () => [...store.agents.values()]);
  app.post("/v1/agents", async (req, reply) => {
    requireAgentKey(req);
    const a = AgentSchema.parse({ ...(req.body as object), createdAt: new Date().toISOString() });
    store.agents.set(a.id, a);
    return reply.code(201).send(a);
  });
  app.patch("/v1/agents/:id", async (req) => {
    requireAgentKey(req);
    const { id } = req.params as { id: string };
    const cur = store.agents.get(id);
    if (!cur) throw Object.assign(new Error("not found"), { statusCode: 404 });
    const next = AgentSchema.parse({ ...cur, ...((req.body ?? {}) as object) });
    store.agents.set(id, next);
    return next;
  });
  app.get("/v1/agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const a = store.agents.get(id);
    if (!a) return reply.code(404).send({ error: "not found" });
    const recent = [...store.actions.values()].filter((x) => x.agentId === id).slice(-10).reverse();
    return { ...a, recentActions: recent };
  });
  app.delete("/v1/agents/:id", async (req, reply) => {
    requireAgentKey(req);
    const { id } = req.params as { id: string };
    if (!store.agents.delete(id)) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });
  app.get("/v1/tools", async () => [...store.tools.values()]);
  app.post("/v1/tools", async (req, reply) => {
    requireAgentKey(req);
    const t = ToolSchema.parse(req.body);
    store.tools.set(t.id, t);
    return reply.code(201).send(t);
  });
  app.get("/v1/tools/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const t = store.tools.get(id);
    if (!t) return reply.code(404).send({ error: "not found" });
    return t;
  });
  app.patch("/v1/tools/:id", async (req) => {
    requireAgentKey(req);
    const { id } = req.params as { id: string };
    const cur = store.tools.get(id);
    if (!cur) throw Object.assign(new Error("not found"), { statusCode: 404 });
    const next = ToolSchema.parse({ ...cur, ...((req.body ?? {}) as object), id: cur.id });
    store.tools.set(id, next);
    return next;
  });
  app.delete("/v1/tools/:id", async (req, reply) => {
    requireAgentKey(req);
    const { id } = req.params as { id: string };
    if (!store.tools.delete(id)) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });

  // TRD §12 metrics — derived from decisions so they survive restarts via PG hydrate.
  app.get("/v1/metrics", async () => {
    const all = [...store.decisions.values()];
    const count = (f: (d: (typeof all)[number]) => boolean) => all.filter(f).length;
    return {
      decisions_total: all.length,
      allow_total: count((d) => d.outcome === "allow"),
      review_total: count((d) => d.outcome === "review"),
      block_total: count((d) => d.outcome === "block"),
      fallback_total: count((d) => d.fallbackUsed === true),
      approvals_total: count((d) => d.approvalStatus === "approved" || d.approvalStatus === "rejected"),
      pending_total: count((d) => d.outcome === "review" && (!d.approvalStatus || d.approvalStatus === "pending")),
    };
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
  const policies = [...store.policies.values()];
  const { findings, matchedPolicyIds } = evaluateDeterministic(
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
    store.actions.set(actionId, {
      id: actionId,
      agentId: input.agentId,
      toolId: input.toolId,
      task: input.task,
      arguments: redacted,
      createdAt: new Date(),
    });
  }
  store.decisions.set(decisionId, {
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

  // Best-effort PG audit (managed DATABASE_URL). Never breaks pipeline.
  persistAudit({
    agent: input.agent,
    tool: input.tool,
    policies,
    actionId,
    decisionId,
    redacted,
    parsed: { agentId: input.agentId, toolId: input.toolId, task: input.task, arguments: input.args, context: input.context },
    decision,
    evaluationMs: Date.now() - input.started,
  }).catch(() => {});

  return {
    decision: decision.outcome,
    confidence: decision.confidence,
    reason: decision.reason,
    decisionId,
  };
}

/** Fire-and-forget PG mirror of the in-memory decision. Skips when DATABASE_URL unset. */async function persistAudit(input: {
  agent: { id: string; name: string; description?: string; status: string };
  tool: { id: string; name: string; description: string; riskLevel: string };
  policies: { id: string; name: string; description: string; severity: string; mode: string; enabled: boolean; version: number }[];
  actionId: string;
  decisionId: string;
  redacted: Record<string, unknown>;
  parsed: { agentId: string; toolId: string; task?: string; arguments: Record<string, unknown>; context: Record<string, unknown> };
  decision: { outcome: string; confidence?: number; reason?: string; fallbackUsed: boolean; judgments: { question: string; answer: unknown; confidence?: number }[] };
  evaluationMs: number;
}): Promise<void> {
  const { isDbConfigured, db, agents, tools, policies, actions, decisions, judgments } = await import("@sentinel/db");
  if (!isDbConfigured()) return;
  const d = db();
  const now = new Date();
  await d.insert(agents).values({
    id: input.agent.id,
    name: input.agent.name,
    description: input.agent.description ?? null,
    status: input.agent.status,
    createdAt: now,
  }).onConflictDoNothing();
  await d.insert(tools).values({
    id: input.tool.id,
    name: input.tool.name,
    description: input.tool.description,
    riskLevel: input.tool.riskLevel,
  }).onConflictDoNothing();
  for (const p of input.policies) {
    await d.insert(policies).values({
      id: p.id, name: p.name, description: p.description,
      severity: p.severity, mode: p.mode, enabled: p.enabled, version: p.version,
    }).onConflictDoNothing();
  }
  await d.insert(actions).values({
    id: input.actionId,
    agentId: input.parsed.agentId,
    toolId: input.parsed.toolId,
    task: input.parsed.task ?? null,
    arguments: input.redacted,
    context: input.parsed.context,
    createdAt: now,
  });
  await d.insert(decisions).values({
    id: input.decisionId,
    actionId: input.actionId,
    outcome: input.decision.outcome,
    confidence: input.decision.confidence ?? null,
    reason: input.decision.reason ?? null,
    policyIds: [],
    approvalStatus: input.decision.outcome === "review" ? "pending" : null,
    fallbackUsed: input.decision.fallbackUsed,
    evaluationDurationMs: input.evaluationMs,
    createdAt: now,
  });
  for (let i = 0; i < input.decision.judgments.length; i++) {
    const j = input.decision.judgments[i];
    await d.insert(judgments).values({
      id: `jud_${input.decisionId}_${i}`,
      decisionId: input.decisionId,
      question: j.question,
      type: "noul",
      answer: j.answer as object,
      confidence: j.confidence ?? null,
    });
  }
}
