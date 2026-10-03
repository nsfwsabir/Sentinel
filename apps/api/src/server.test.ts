import { describe, it, expect } from "vitest";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { buildServer } from "./server.js";
import { createMemoryStore } from "./store.js";
import type { AgentAuthOptions } from "./agentAuth.js";

const ISS = "https://issuer.example.com";

async function oidcOpts(): Promise<{ opts: AgentAuthOptions; tokenFor: (sub: string, claims?: Record<string, unknown>) => Promise<string> }> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const jwks = createLocalJWKSet({ keys: [{ ...jwk, kid: "k1" }] });
  return {
    opts: { issuers: [ISS], audience: "sentinel", staticKeys: [], jwksFor: () => jwks },
    tokenFor: (sub: string, claims: Record<string, unknown> = {}) =>
      new SignJWT({ sub, ...claims })
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(ISS)
        .setAudience("sentinel")
        .setExpirationTime("5m")
        .sign(privateKey),
  };
}

describe("api", () => {
  it("blocks hero exfil end-to-end", async () => {
    const app = buildServer(createMemoryStore());
    const res = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: { "x-api-key": "dev-key-1" },
      payload: {
        agentId: "research-agent",
        toolId: "send_email",
        task: "Research competitors",
        arguments: { to: "external@example.com", attachment: "customers.csv" },
        context: {},
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().decision).toBe("block");
  });

  it("401s without agent key and redacts secrets", async () => {
    const store = createMemoryStore();
    const app = buildServer(store);
    const denied = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      payload: { agentId: "research-agent", toolId: "send_email", arguments: {} },
    });
    expect(denied.statusCode).toBe(401);

    const ok = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: { "x-api-key": "dev-key-1" },
      payload: {
        agentId: "research-agent",
        toolId: "query_database",
        arguments: { q: "select 1", api_key: "sk-live-abcdefgh12345678" },
        context: {},
      },
    });
    expect(ok.statusCode).toBe(200);
    const decisionId = ok.json().decisionId as string;
    const detail = await app.inject({ method: "GET", url: `/v1/decisions/${decisionId}` });
    expect(JSON.stringify(detail.json())).not.toContain("sk-live");
  });

  it("gates approvals behind admin auth", async () => {
    const app = buildServer(createMemoryStore());
    const created = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: { "x-api-key": "dev-key-1" },
      payload: { agentId: "deploy-agent", toolId: "refund", arguments: { amount: 500 }, context: {} },
    });
    const id = created.json().decisionId as string;
    const anon = await app.inject({ method: "POST", url: `/v1/approvals/${id}/approve` });
    expect(anon.statusCode).toBe(401);
    const admin = "Basic " + Buffer.from("admin:admin").toString("base64");
    const approved = await app.inject({
      method: "POST",
      url: `/v1/approvals/${id}/approve`,
      headers: { authorization: admin },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().approvalStatus).toBe("approved");
  });

  it("registers agents/tools and filters decisions + metrics", async () => {
    const app = buildServer(createMemoryStore());
    const agent = await app.inject({
      method: "POST",
      url: "/v1/agents",
      headers: { "x-api-key": "dev-key-1" },
      payload: { id: "support-agent", name: "Support", status: "active" },
    });
    expect(agent.statusCode).toBe(201);

    const tool = await app.inject({
      method: "POST",
      url: "/v1/tools",
      headers: { "x-api-key": "dev-key-1" },
      payload: { id: "send_dm", name: "send_dm", description: "Send DM", riskLevel: "low" },
    });
    expect(tool.statusCode).toBe(201);

    await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: { "x-api-key": "dev-key-1" },
      payload: { agentId: "support-agent", toolId: "send_dm", arguments: { text: "hi" }, context: {} },
    });
    const filtered = await app.inject({ method: "GET", url: "/v1/decisions?agentId=support-agent" });
    expect(filtered.json().length).toBe(1);

    const metrics = await app.inject({ method: "GET", url: "/v1/metrics" });
    expect(metrics.json().decisions_total).toBe(1);
  });

  it("bumps policy version on patch, ignoring client version", async () => {
    const app = buildServer(createMemoryStore());
    const r = await app.inject({
      method: "PATCH",
      url: "/v1/policies/pol_pay",
      headers: { "x-api-key": "dev-key-1" },
      payload: { enabled: false, version: 99 },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().version).toBe(2);
    expect(r.json().enabled).toBe(false);
  });

  it("round-trips agent detail and tool CRUD", async () => {
    const app = buildServer(createMemoryStore());
    const KEY = { "x-api-key": "dev-key-1" };
    const detail = await app.inject({ method: "GET", url: "/v1/agents/research-agent" });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().recentActions).toEqual([]);

    const patched = await app.inject({
      method: "PATCH",
      url: "/v1/tools/refund",
      headers: KEY,
      payload: { riskLevel: "critical" },
    });
    expect(patched.json().riskLevel).toBe("critical");

    const gone = await app.inject({ method: "DELETE", url: "/v1/tools/refund", headers: KEY });
    expect(gone.statusCode).toBe(204);
    const missing = await app.inject({ method: "GET", url: "/v1/tools/refund" });
    expect(missing.statusCode).toBe(404);
  });

  it("reports provider status and tests the connection (admin-gated)", async () => {
    const app = buildServer(createMemoryStore());
    const status = await app.inject({ method: "GET", url: "/v1/provider/status" });
    expect(status.json().provider).toBe("mock");

    const anon = await app.inject({ method: "POST", url: "/v1/provider/test" });
    expect(anon.statusCode).toBe(401);

    const admin = "Basic " + Buffer.from("admin:admin").toString("base64");
    const test = await app.inject({
      method: "POST",
      url: "/v1/provider/test",
      headers: { authorization: admin },
    });
    expect(test.statusCode).toBe(200);
    expect(test.json().ok).toBe(true);
    expect(test.json().judgments.length).toBeGreaterThan(0);
  });

  it("never leaks the provider key in fail-closed responses", async () => {
    const savedProvider = process.env.JUDGMENT_PROVIDER;
    const savedUrl = process.env.LAYA_API_URL;
    const savedKey = process.env.LAYA_API_KEY;
    process.env.JUDGMENT_PROVIDER = "laya";
    process.env.LAYA_API_URL = "http://127.0.0.1:9/unreachable";
    process.env.LAYA_API_KEY = "lsk_live_super-secret-key";
    try {
      const app = buildServer(createMemoryStore());
      const r = await app.inject({
        method: "POST",
        url: "/v1/actions/evaluate",
        headers: { "x-api-key": "dev-key-1" },
        payload: { agentId: "research-agent", toolId: "query_database", arguments: { q: "select 1" }, context: {} },
      });
      expect(r.json().decision).toBe("review");
      expect(JSON.stringify(r.json())).not.toContain("super-secret-key");

      const admin = "Basic " + Buffer.from("admin:admin").toString("base64");
      const t = await app.inject({
        method: "POST",
        url: "/v1/provider/test",
        headers: { authorization: admin },
      });
      expect(t.statusCode).toBe(502);
      expect(JSON.stringify(t.json())).not.toContain("super-secret-key");
    } finally {
      if (savedProvider === undefined) delete process.env.JUDGMENT_PROVIDER;
      else process.env.JUDGMENT_PROVIDER = savedProvider;
      if (savedUrl === undefined) delete process.env.LAYA_API_URL;
      else process.env.LAYA_API_URL = savedUrl;
      if (savedKey === undefined) delete process.env.LAYA_API_KEY;
      else process.env.LAYA_API_KEY = savedKey;
    }
  });

  it("binds token identity to agentId: mismatch 403s, match evaluates", async () => {
    const { opts, tokenFor } = await oidcOpts();
    const app = buildServer(createMemoryStore(), { agentAuth: opts });
    const payload = (agentId: string) => ({
      agentId,
      toolId: "query_database",
      arguments: { q: "select 1" },
      context: { env: "development" },
    });
    const spoof = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: { authorization: `Bearer ${await tokenFor("research-agent")}` },
      payload: payload("deploy-agent"),
    });
    expect(spoof.statusCode).toBe(403);

    const honest = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: { authorization: `Bearer ${await tokenFor("research-agent")}` },
      payload: payload("research-agent"),
    });
    expect(honest.statusCode).toBe(200);
    expect(honest.json().decision).toBe("allow");
  });

  it("approves with approver-scoped token, rejects scope-less and static callers", async () => {
    const { opts, tokenFor } = await oidcOpts();
    const app = buildServer(createMemoryStore(), { agentAuth: { ...opts, staticKeys: ["dev-key-1"] } });
    const KEY = { "x-api-key": "dev-key-1" };
    const created = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: KEY,
      payload: { agentId: "deploy-agent", toolId: "refund", arguments: { amount: 500 }, context: {} },
    });
    const id = created.json().decisionId as string;

    // Static agent key is never enough for approvals.
    const staticCall = await app.inject({ method: "POST", url: `/v1/approvals/${id}/approve`, headers: KEY });
    expect(staticCall.statusCode).toBe(401);

    // OIDC token without the approver scope is also rejected.
    const unscoped = await app.inject({
      method: "POST",
      url: `/v1/approvals/${id}/approve`,
      headers: { authorization: `Bearer ${await tokenFor("deploy-agent")}` },
    });
    expect(unscoped.statusCode).toBe(401);

    // Token carrying sentinel:approvers is accepted.
    const scoped = await app.inject({
      method: "POST",
      url: `/v1/approvals/${id}/approve`,
      headers: {
        authorization: `Bearer ${await tokenFor("deploy-agent", { scope: "sentinel:evaluate sentinel:approvers" })}`,
      },
    });
    expect(scoped.statusCode).toBe(200);
    expect(scoped.json().approvalStatus).toBe("approved");
  });

  it("ingests falco signals as evidence and lists them", async () => {
    const app = buildServer(createMemoryStore());
    const KEY = { "x-api-key": "dev-key-1" };
    const bad = await app.inject({
      method: "POST",
      url: "/v1/signals/falco",
      headers: KEY,
      payload: { nope: true },
    });
    expect(bad.statusCode).toBe(400);

    const unknown = await app.inject({
      method: "POST",
      url: "/v1/signals/other",
      headers: KEY,
      payload: { rule: "x", priority: "Warning" },
    });
    expect(unknown.statusCode).toBe(404);

    const ok = await app.inject({
      method: "POST",
      url: "/v1/signals/falco",
      headers: KEY,
      payload: {
        rule: "Shell in sentinel-api container",
        priority: "Warning",
        output: "shell spawned in sentinel-api",
        output_fields: { "container.name": "sentinel-api" },
      },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().source).toBe("falco");

    const list = await app.inject({ method: "GET", url: "/v1/signals?source=falco" });
    expect(list.json().length).toBe(1);
    expect(list.json()[0].rule).toBe("Shell in sentinel-api container");
  });

  it("purges old decisions but keeps approvals unless asked", async () => {
    const app = buildServer(createMemoryStore());
    const KEY = { "x-api-key": "dev-key-1" };
    const ADMIN = { authorization: "Basic " + Buffer.from("admin:admin").toString("base64") };

    expect((await app.inject({ method: "DELETE", url: "/v1/decisions?before=2099-01-01" })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: "DELETE", url: "/v1/decisions", headers: ADMIN })).statusCode,
    ).toBe(400);

    await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: KEY,
      payload: { agentId: "research-agent", toolId: "send_email", arguments: { to: "external@example.com", attachment: "customers.csv" }, context: {} },
    });
    const review = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: KEY,
      payload: { agentId: "deploy-agent", toolId: "refund", arguments: { amount: 500 }, context: {} },
    });
    const reviewId = review.json().decisionId as string;
    await app.inject({ method: "POST", url: `/v1/approvals/${reviewId}/approve`, headers: ADMIN });

    const purge = await app.inject({ method: "DELETE", url: "/v1/decisions?before=2099-01-01", headers: ADMIN });
    expect(purge.json()).toMatchObject({ deleted: 1, skippedApprovals: 1, actionsDeleted: 1 });

    const remaining = await app.inject({ method: "GET", url: "/v1/decisions" });
    expect(remaining.json().length).toBe(1);

    const full = await app.inject({
      method: "DELETE",
      url: "/v1/decisions?before=2099-01-01&includeApprovals=true",
      headers: ADMIN,
    });
    expect(full.json()).toMatchObject({ deleted: 1, skippedApprovals: 0 });
  });

  it("replays a stored action and dry-runs a candidate policy", async () => {
    const app = buildServer(createMemoryStore());
    const KEY = { "x-api-key": "dev-key-1" };
    const first = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: KEY,
      payload: {
        agentId: "research-agent",
        toolId: "send_email",
        arguments: { to: "external@example.com", attachment: "customers.csv" },
        context: {},
      },
    });
    const firstId = first.json().decisionId as string;
    const detail = await app.inject({ method: "GET", url: `/v1/decisions/${firstId}` });
    const actionId = detail.json().actionId as string;

    const replay = await app.inject({ method: "POST", url: `/v1/actions/${actionId}/replay`, headers: KEY });
    expect(replay.json().decision).toBe("block");
    const replayDetail = await app.inject({ method: "GET", url: `/v1/decisions/${replay.json().decisionId}` });
    expect(replayDetail.json().actionId).toBe(actionId);

    const dry = await app.inject({
      method: "POST",
      url: "/v1/policies/dry-run",
      headers: KEY,
      payload: {
        id: "pol_draft",
        name: "Draft",
        description: "Customer data must never be sent externally.",
        severity: "high",
        mode: "block",
        enabled: true,
        version: 1,
      },
    });
    expect(dry.json().evaluated).toBe(1);
    expect(dry.json().would_block).toBe(1);
  });
});
