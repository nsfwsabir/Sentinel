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
    const app = await buildServer(createMemoryStore());
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
    const app = await buildServer(store);
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
    const app = await buildServer(createMemoryStore());
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

  it("drops decided reviews from the pending queue", async () => {
    const app = await buildServer(createMemoryStore());
    const KEY = { "x-api-key": "dev-key-1" };
    const ADMIN = { authorization: "Basic " + Buffer.from("admin:admin").toString("base64") };
    const mk = (amount: number) =>
      app.inject({
        method: "POST",
        url: "/v1/actions/evaluate",
        headers: KEY,
        payload: { agentId: "deploy-agent", toolId: "refund", arguments: { amount }, context: {} },
      });
    const a = (await mk(500)).json().decisionId as string;
    const b = (await mk(600)).json().decisionId as string;
    expect((await app.inject({ method: "GET", url: "/v1/approvals" })).json().length).toBe(2);
    await app.inject({ method: "POST", url: `/v1/approvals/${a}/approve`, headers: ADMIN });
    await app.inject({ method: "POST", url: `/v1/approvals/${b}/reject`, headers: ADMIN });
    const pending = (await app.inject({ method: "GET", url: "/v1/approvals" })).json() as { id: string }[];
    expect(pending.map((d) => d.id)).toEqual([]);
    // Final disposition: the approved review counts as allowed, the rejected as blocked.
    expect(await app.inject({ method: "GET", url: "/v1/metrics" }).then((r) => r.json())).toMatchObject({
      decisions_total: 2,
      allow_total: 1,
      review_total: 0,
      block_total: 1,
      pending_total: 0,
    });
  });

  it("registers agents/tools and filters decisions + metrics", async () => {
    const app = await buildServer(createMemoryStore());
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
    const app = await buildServer(createMemoryStore());
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
    const app = await buildServer(createMemoryStore());
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
    const app = await buildServer(createMemoryStore());
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
      const app = await buildServer(createMemoryStore());
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
    const app = await buildServer(createMemoryStore(), { agentAuth: opts });
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
    const app = await buildServer(createMemoryStore(), { agentAuth: { ...opts, staticKeys: ["dev-key-1"] } });
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
    const app = await buildServer(createMemoryStore());
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

    // Host noise from other projects' containers is dropped, not stored.
    const noise = await app.inject({
      method: "POST",
      url: "/v1/signals/falco",
      headers: KEY,
      payload: {
        rule: "Sensitive file opened for reading by non-trusted program",
        priority: "Warning",
        output: "sensitive file read /etc/shadow",
        output_fields: { "container.name": "other-postgres" },
      },
    });
    expect(noise.statusCode).toBe(202);
    expect((await app.inject({ method: "GET", url: "/v1/signals?source=falco" })).json().length).toBe(1);

    const ADMIN = { authorization: "Basic " + Buffer.from("admin:admin").toString("base64") };
    const purge = await app.inject({ method: "DELETE", url: "/v1/decisions?before=2099-01-01", headers: ADMIN });
    expect(purge.json().signalsDeleted).toBe(1);
    expect((await app.inject({ method: "GET", url: "/v1/signals?source=falco" })).json()).toEqual([]);
  });

  it("purges old decisions but keeps approvals unless asked", async () => {
    const app = await buildServer(createMemoryStore());
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

  it("verifies the audit hash chain", async () => {
    const app = await buildServer(createMemoryStore());
    const KEY = { "x-api-key": "dev-key-1" };
    const ADMIN = { authorization: "Basic " + Buffer.from("admin:admin").toString("base64") };
    expect((await app.inject({ method: "GET", url: "/v1/audit/verify" })).statusCode).toBe(401);
    await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: KEY,
      payload: { agentId: "research-agent", toolId: "send_email", arguments: { to: "external@example.com", attachment: "customers.csv" }, context: {} },
    });
    expect(await app.inject({ method: "GET", url: "/v1/audit/verify", headers: ADMIN }).then((r) => r.json())).toMatchObject({ ok: true, checked: 1 });
  });

  it("signs purge checkpoints when AUDIT_SIGNING_KEY is set", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const prev = process.env.AUDIT_SIGNING_KEY;
    try {
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      process.env.AUDIT_SIGNING_KEY = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
      const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64");
      const app = await buildServer(createMemoryStore());
      const KEY = { "x-api-key": "dev-key-1" };
      const ADMIN = { authorization: "Basic " + Buffer.from("admin:admin").toString("base64") };
      await app.inject({
        method: "POST",
        url: "/v1/actions/evaluate",
        headers: KEY,
        payload: { agentId: "research-agent", toolId: "send_email", arguments: { to: "external@example.com", attachment: "customers.csv" }, context: {} },
      });
      await app.inject({ method: "DELETE", url: "/v1/decisions?before=2099-01-01&includeApprovals=true", headers: ADMIN });
      const v = await app.inject({ method: "GET", url: "/v1/audit/verify", headers: ADMIN }).then((r) => r.json());
      expect(v.anchorPublicKey).toBe(pub);
      expect(v.checkpoints.length).toBe(1);
      expect(v.checkpoints[0]).toMatchObject({ signatureValid: true });
      expect(typeof v.checkpoints[0].signature).toBe("string");
    } finally {
      if (prev === undefined) delete process.env.AUDIT_SIGNING_KEY;
      else process.env.AUDIT_SIGNING_KEY = prev;
    }
  });

  it("replays a stored action and dry-runs a candidate policy", async () => {
    const app = await buildServer(createMemoryStore());
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

  it("manages API keys: create, bound use, rotate, revoke", async () => {
    const app = await buildServer(createMemoryStore());
    const KEY = { "x-api-key": "dev-key-1" };
    const ADMIN = { authorization: "Basic " + Buffer.from("admin:admin").toString("base64") };

    expect((await app.inject({ method: "GET", url: "/v1/api-keys" })).statusCode).toBe(401);
    // Env bootstrap seeded dev-key-1.
    const seeded = await app.inject({ method: "GET", url: "/v1/api-keys", headers: ADMIN });
    expect(seeded.json().length).toBe(1);
    expect(JSON.stringify(seeded.json())).not.toContain("dev-key-1");

    const created = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: ADMIN,
      payload: { label: "ci", boundAgentId: "research-agent" },
    });
    expect(created.statusCode).toBe(201);
    const token = created.json().token as string;
    expect(token.startsWith("sk_live_")).toBe(true);

    // Bound key works for its agent, 403s as another.
    const okUse = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: { "x-api-key": token },
      payload: { agentId: "research-agent", toolId: "query_database", arguments: { q: "select 1" }, context: {} },
    });
    expect(okUse.statusCode).toBe(200);
    const spoof = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: { "x-api-key": token },
      payload: { agentId: "deploy-agent", toolId: "query_database", arguments: { q: "select 1" }, context: {} },
    });
    expect(spoof.statusCode).toBe(403);

    // Rotate: old dies, new works. Revoke: gone entirely.
    const rotated = await app.inject({
      method: "POST",
      url: `/v1/api-keys/${created.json().id}/rotate`,
      headers: ADMIN,
    });
    const token2 = rotated.json().token as string;
    expect(token2).not.toBe(token);
    const deadOld = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: { "x-api-key": token },
      payload: { agentId: "research-agent", toolId: "query_database", arguments: {}, context: {} },
    });
    expect(deadOld.statusCode).toBe(401);

    await app.inject({ method: "DELETE", url: `/v1/api-keys/${created.json().id}`, headers: ADMIN });
    const deadNew = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: { "x-api-key": token2 },
      payload: { agentId: "research-agent", toolId: "query_database", arguments: {}, context: {} },
    });
    expect(deadNew.statusCode).toBe(401);
  });

  it("snapshots policy versions and reverts append-only", async () => {
    const app = await buildServer(createMemoryStore());
    const KEY = { "x-api-key": "dev-key-1" };
    const created = await app.inject({
      method: "POST",
      url: "/v1/policies",
      headers: KEY,
      payload: { id: "pol_hist", name: "Hist", description: "v1", severity: "low", mode: "audit", enabled: true, version: 1 },
    });
    expect(created.statusCode).toBe(201);

    await app.inject({
      method: "PATCH",
      url: "/v1/policies/pol_hist",
      headers: KEY,
      payload: { description: "v2" },
    });
    const versions = await app.inject({ method: "GET", url: "/v1/policies/pol_hist/versions" });
    expect(versions.json().map((v: { version: number }) => v.version)).toEqual([2, 1]);

    const reverted = await app.inject({ method: "POST", url: "/v1/policies/pol_hist/revert/1", headers: KEY });
    expect(reverted.json().description).toBe("v1");
    expect(reverted.json().version).toBe(3);

    const missing = await app.inject({ method: "POST", url: "/v1/policies/pol_hist/revert/99", headers: KEY });
    expect(missing.statusCode).toBe(404);
  });

  it("applies agent-scoped policies only to listed agents", async () => {
    const app = await buildServer(createMemoryStore());
    const KEY = { "x-api-key": "dev-key-1" };
    // Disable the org payment policy so only the scoped one can fire.
    await app.inject({ method: "PATCH", url: "/v1/policies/pol_pay", headers: KEY, payload: { enabled: false } });
    await app.inject({
      method: "POST",
      url: "/v1/policies",
      headers: KEY,
      payload: {
        id: "pol_scoped", name: "Scoped payments", description: "Payments above $100 require human approval.",
        severity: "high", mode: "review", enabled: true, version: 1,
        scope: "agent", agentIds: ["research-agent"],
      },
    });
    const args = { amount: 500 };
    const scoped = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: KEY,
      payload: { agentId: "research-agent", toolId: "refund", arguments: args, context: {} },
    });
    expect(scoped.json().decision).toBe("review");
    const scopedDetail = await app.inject({ method: "GET", url: `/v1/decisions/${scoped.json().decisionId}` });
    expect(scopedDetail.json().policyIds).toContain("pol_scoped");

    // deploy-agent: scoped policy skipped, mock provider sees nothing risky.
    const unscoped = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: KEY,
      payload: { agentId: "deploy-agent", toolId: "refund", arguments: args, context: {} },
    });
    expect(unscoped.json().decision).toBe("allow");
  });

  it("returns 400 (not schema details) for invalid bodies", async () => {
    const app = await buildServer(createMemoryStore());
    const r = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: { "x-api-key": "dev-key-1" },
      payload: { toolId: "send_email" },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ error: "invalid request" });
  });

  it("returns generic messages for 500s", async () => {
    const store = createMemoryStore();
    const app = await buildServer(store);
    store.listPolicies = async () => {
      throw new Error("pg connection string has password=hunter2 host=db.internal");
    };
    const r = await app.inject({ method: "GET", url: "/v1/policies" });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ error: "internal error" });
  });

  it("throttles replay and admin attempts", async () => {
    const saved = process.env.RATE_LIMIT_PER_MIN;
    const savedAdmin = process.env.RATE_LIMIT_ADMIN_PER_MIN;
    process.env.RATE_LIMIT_PER_MIN = "1";
    process.env.RATE_LIMIT_ADMIN_PER_MIN = "1";
    // Unique source IP: the in-memory limiter is shared across tests, so
    // this test must not share counters with any other test.
    const IP = "10.9.9.9";
    const at = (extra: Record<string, unknown> = {}) => ({ remoteAddress: IP, ...extra });
    try {
      const app = await buildServer(createMemoryStore());
      const KEY = { "x-api-key": "dev-key-1" };
      // Fresh agent: the in-memory limiter is shared across tests in this
      // file, so never reuse an agent id here.
      await app.inject({
        method: "POST",
        url: "/v1/agents",
        headers: KEY,
        payload: { id: "throttle-probe", name: "Probe", status: "active" },
      });
      const created = await app.inject(at({
        method: "POST",
        url: "/v1/actions/evaluate",
        headers: KEY,
        payload: { agentId: "throttle-probe", toolId: "query_database", arguments: { q: "select 1" }, context: {} },
      }));
      expect(created.statusCode).toBe(200);
      const actionId = (await (await app.inject(at({ method: "GET", url: `/v1/decisions/${created.json().decisionId}` }))).json()).actionId as string;
      expect((await app.inject(at({ method: "POST", url: `/v1/actions/${actionId}/replay`, headers: KEY }))).statusCode).toBe(200);
      expect((await app.inject(at({ method: "POST", url: `/v1/actions/${actionId}/replay`, headers: KEY }))).statusCode).toBe(429);

      const bad = { authorization: "Basic " + Buffer.from("admin:wrong").toString("base64") };
      expect((await app.inject(at({ method: "POST", url: "/v1/provider/test", headers: bad }))).statusCode).toBe(401);
      expect((await app.inject(at({ method: "POST", url: "/v1/provider/test", headers: bad }))).statusCode).toBe(429);
    } finally {
      if (saved === undefined) delete process.env.RATE_LIMIT_PER_MIN;
      else process.env.RATE_LIMIT_PER_MIN = saved;
      if (savedAdmin === undefined) delete process.env.RATE_LIMIT_ADMIN_PER_MIN;
      else process.env.RATE_LIMIT_ADMIN_PER_MIN = savedAdmin;
    }
  });

  it("flags dev secrets for production boot", async () => {
    const { productionSecretProblems } = await import("./server.js");
    expect(productionSecretProblems({ NODE_ENV: "development" })).toEqual([]);
    expect(
      productionSecretProblems({ NODE_ENV: "production", AGENT_API_KEYS: "dev-key-1", ADMIN_PASS: "admin" }).length,
    ).toBe(2);
    expect(
      productionSecretProblems({ NODE_ENV: "production", AGENT_API_KEYS: "real-key", ADMIN_PASS_HASH: "scrypt$a$b" }),
    ).toEqual([]);
  });
});
