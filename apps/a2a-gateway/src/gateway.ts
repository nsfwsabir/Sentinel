import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// A2A inbound gateway: a thin JSON-RPC adapter over Sentinel's own
// evaluation API (same pattern as apps/mcp: enforcement stays in Sentinel,
// this layer only translates).
//
// Supported subset (deliberate, AGENTS.md §14): AgentCard discovery +
// message/send. No streaming, push notifications, or task store —
// evaluations are single-shot; decisions live in Sentinel's audit log.
// The official @a2a-js/sdk server framework (TaskStore, event buses,
// executors for long-running agents) was evaluated and rejected for this
// stateless gate; adopted if streaming is ever needed.
// Wire shapes follow the A2A v0.3 Task/Message/Artifact JSON mapping.

const API = () => process.env.SENTINEL_API_URL ?? "http://localhost:3001";
const KEY = () => process.env.SENTINEL_AGENT_KEY ?? "dev-key-1";

const ActionSchema = z.object({
  agentId: z.string().min(1),
  toolId: z.string().min(1),
  task: z.string().optional(),
  arguments: z.record(z.unknown()).default({}),
  context: z.record(z.unknown()).default({}),
});

const PartSchema = z.object({
  kind: z.string(),
  text: z.string().optional(),
  data: z.unknown().optional(),
});

const MessageSchema = z.object({
  messageId: z.string().min(1),
  role: z.string(),
  parts: z.array(PartSchema).min(1),
  contextId: z.string().optional(),
});

const RpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

type Decision = "allow" | "review" | "block";

function agentCard(baseUrl: string) {
  return {
    name: "Sentinel",
    description:
      "Runtime policy gate for AI agent actions. Submit a proposed action, get ALLOW, REVIEW, or BLOCK with evidence. Never executes tools.",
    url: baseUrl,
    version: "0.1.0",
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "evaluate-action",
        name: "Evaluate action",
        description:
          "Evaluate a proposed agent action against policy. Send a message with a data part { action: { agentId, toolId, task?, arguments?, context? } }.",
        tags: ["policy", "security", "evaluation"],
      },
    ],
    securitySchemes: {
      bearer: { type: "http", scheme: "bearer", description: "Forwarded to Sentinel as the agent credential when present." },
    },
  };
}

function taskMessage(text: string) {
  return {
    messageId: `msg_${randomUUID().slice(0, 8)}`,
    role: "agent",
    parts: [{ kind: "text", text }],
  };
}

function decisionTask(
  action: z.infer<typeof ActionSchema>,
  contextId: string,
  evaluation: { decision: Decision; confidence?: number; reason?: string; decisionId: string },
  incoming: unknown,
) {
  const state = evaluation.decision === "allow" ? "COMPLETED" : evaluation.decision === "review" ? "INPUT_REQUIRED" : "REJECTED";
  const summary =
    evaluation.decision === "allow"
      ? `ALLOW: ${evaluation.reason ?? "no policy violation detected"}`
      : evaluation.decision === "review"
        ? `REVIEW: ${evaluation.reason ?? "human review required"}`
        : `BLOCK: ${evaluation.reason ?? "policy violation"}`;
  return {
    id: `tsk_${randomUUID().slice(0, 8)}`,
    contextId,
    status: { state, message: taskMessage(summary), timestamp: new Date().toISOString() },
    artifacts: [
      {
        artifactId: `art_${randomUUID().slice(0, 8)}`,
        name: "sentinel-decision",
        parts: [{ kind: "data", data: { ...evaluation, action } }],
      },
    ],
    history: [incoming],
  };
}

export function buildGateway(): FastifyInstance {
  const app = Fastify({ logger: false });

  // Per-IP throttle: the gateway is intentionally credential-optional, so
  // anonymous callers must not be able to burn Laya credits or flood audit.
  // In-memory fixed window is enough for a stateless gate (Redis lives in
  // the API, not here); counts reset when the process restarts.
  const hits = new Map<string, { count: number; resetAt: number }>();
  const limitPerMin = Number(process.env.A2A_RATE_LIMIT_PER_MIN ?? 30);

  app.get("/.well-known/agent-card.json", async (req) => {
    const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
    const host = req.headers.host ?? "localhost:3002";
    return agentCard(`${proto}://${host}`);
  });

  app.post("/", async (req, reply) => {
    const ip = req.ip;
    const now = Date.now();
    const cur = hits.get(ip);
    if (!cur || cur.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + 60_000 });
    } else if (cur.count >= limitPerMin) {
      return reply
        .code(429)
        .header("Retry-After", Math.ceil((cur.resetAt - now) / 1000))
        .send({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "rate limited" } });
    } else {
      cur.count += 1;
    }
    const parsed = RpcSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    }
    const { method, id = null, params } = parsed.data;
    if (method !== "message/send") {
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } };
    }
    const msg = MessageSchema.safeParse((params as { message?: unknown })?.message);
    if (!msg.success) {
      return { jsonrpc: "2.0", id, error: { code: -32602, message: "message/send requires params.message with parts" } };
    }
    const dataPart = msg.data.parts.find((p) => p.kind === "data" && p.data !== undefined);
    const action = ActionSchema.safeParse(
      (dataPart?.data as { action?: unknown })?.action ?? (dataPart?.data as unknown),
    );
    if (!action.success) {
      return { jsonrpc: "2.0", id, error: { code: -32602, message: "data part must carry { action: { agentId, toolId, ... } }" } };
    }
    // Forward the caller's credential when present so OIDC identity flows
    // through; otherwise use the gateway's own server-side agent key.
    const incomingAuth = req.headers.authorization;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (incomingAuth) headers["authorization"] = incomingAuth;
    else headers["x-api-key"] = KEY();
    const r = await fetch(`${API()}/v1/actions/evaluate`, {
      method: "POST",
      headers,
      body: JSON.stringify(action.data),
    });
    const body = (await r.json()) as { decision?: Decision; error?: string } & Record<string, unknown>;
    if (!r.ok || !body.decision) {
      const code = r.status === 401 || r.status === 403 ? -32000 : -32603;
      return {
        jsonrpc: "2.0",
        id,
        error: { code, message: typeof body.error === "string" ? body.error : "evaluation failed" },
      };
    }
    return {
      jsonrpc: "2.0",
      id,
      result: decisionTask(
        action.data,
        msg.data.contextId ?? `ctx_${randomUUID().slice(0, 8)}`,
        body as { decision: Decision; confidence?: number; reason?: string; decisionId: string },
        msg.data,
      ),
    };
  });

  return app;
}
