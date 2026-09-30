import { createMemoryStore, seedDefaults, type Store } from "./store.js";
import { evaluateDeterministic, redactSecrets } from "@sentinel/policy-engine";
import { decide } from "@sentinel/decision-engine";
import { jevClientFromEnv } from "@sentinel/jev-client";
import { EvaluateRequestSchema, PolicySchema, AgentSchema, ToolSchema } from "@sentinel/schemas";
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

function requireAdmin(req: { headers: Record<string, string | string[] | undefined> }) {
  // V1 basic gate: ADMIN_USER + ADMIN_PASS (managed secret). No custom crypto for hashing here;
  // production should compare against scrypt hash via node:crypto (stdlib, not custom).
  const user = process.env.ADMIN_USER ?? "admin";
  const pass = process.env.ADMIN_PASS ?? "admin";
  const raw = req.headers["authorization"];
  const val = Array.isArray(raw) ? raw[0] : (raw ?? "");
  const expected = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  if (val !== expected) {
    const err = new Error("unauthorized: admin approval requires basic auth") as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
}

export function buildServer(store: Store = createMemoryStore()): FastifyInstance {
  seedDefaults(store);
  const app = Fastify({ logger: false });
  const jev = jevClientFromEnv();
  // TRD §12 metrics — in-memory counters (PG aggregation in Phase 9).
  const metrics = {
    decisions_total: 0,
    allow_total: 0,
    review_total: 0,
    block_total: 0,
    fallback_total: 0,
    approvals_total: 0,
  };

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

    const agent = store.agents.get(parsed.agentId);
    if (!agent || agent.status !== "active") {
      return reply.code(403).send({ error: "unknown or disabled agent" });
    }
    const tool = store.tools.get(parsed.toolId);
    if (!tool) return reply.code(404).send({ error: "unknown tool" });

    const policies = [...store.policies.values()];
    const { findings, matchedPolicyIds } = evaluateDeterministic(
      {
        agentId: parsed.agentId,
        toolId: parsed.toolId,
        toolName: tool.name,
        arguments: parsed.arguments,
        context: parsed.context,
      },
      policies,
    );

    const decision = await decide({
      state: {
        agent: parsed.agentId,
        task: parsed.task,
        tool: tool.name,
        arguments: parsed.arguments,
        policies: policies.filter((p) => p.enabled).map((p) => p.description),
        environment: String(parsed.context["env"] ?? parsed.context["environment"] ?? ""),
      },
      deterministic: findings,
      toolRisk: tool.riskLevel,
      jev,
    });

    const actionId = `act_${randomUUID().slice(0, 8)}`;
    const decisionId = `dec_${randomUUID().slice(0, 8)}`;
    const redacted = redactSecrets(parsed.arguments);
    store.actions.set(actionId, {
      id: actionId,
      agentId: parsed.agentId,
      toolId: parsed.toolId,
      task: parsed.task,
      arguments: redacted,
      createdAt: new Date(),
    });
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
    });

    childLogger({
      request_id: requestId,
      decision_id: decisionId,
      agent_id: parsed.agentId,
      tool: tool.name,
      policy_ids: matchedPolicyIds,
      evaluation_duration_ms: Date.now() - started,
      decision: decision.outcome,
      confidence: decision.confidence,
      fallback_used: decision.fallbackUsed,
    }).info("decision");

    metrics.decisions_total += 1;
    metrics[`${decision.outcome}_total` as "allow_total" | "review_total" | "block_total"] += 1;
    if (decision.fallbackUsed) metrics.fallback_total += 1;

    return {
      decision: decision.outcome,
      confidence: decision.confidence,
      reason: decision.reason,
      decisionId,
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
    const next = { ...cur, ...((req.body ?? {}) as object) };
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
    requireAdmin(req as never);
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
    metrics.approvals_total += 1;
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
  app.get("/v1/tools", async () => [...store.tools.values()]);
  app.post("/v1/tools", async (req, reply) => {
    requireAgentKey(req);
    const t = ToolSchema.parse(req.body);
    store.tools.set(t.id, t);
    return reply.code(201).send(t);
  });

  app.get("/v1/metrics", async () => metrics);

  return app;
}
