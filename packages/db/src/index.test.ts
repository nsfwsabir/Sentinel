import { describe, it, expect } from "vitest";
import { agents, decisions } from "./schema.js";
import { buildAuditRecord } from "./audit.js";
import { checkLimit } from "./ratelimit.js";
import { isDbConfigured } from "./client.js";
import { isRedisConfigured } from "./redis.js";

describe("db package", () => {
  it("exposes drizzle tables", () => {
    expect(agents).toBeDefined();
    expect(decisions).toBeDefined();
  });

  it("audit record redacts secrets", () => {
    const r = buildAuditRecord({
      requestId: "req_1",
      decisionId: "dec_1",
      agentId: "a",
      tool: "send_email",
      policyIds: ["pol_creds"],
      evaluationDurationMs: 5,
      decision: "block",
      fallbackUsed: false,
      args: { to: "x@y.com", api_key: "sk-live-abcdefgh12345678" },
    });
    expect(r.redacted_arguments["api_key"]).toBe("[REDACTED]");
    expect(r.request_id).toBe("req_1");
  });

  it("reports managed-config presence without connecting", () => {
    expect(typeof isDbConfigured()).toBe("boolean");
    expect(typeof isRedisConfigured()).toBe("boolean");
  });

  it("memory rate limit allows then blocks", async () => {
    const key = `test-${Date.now()}`;
    expect((await checkLimit(key, 2, 60_000)).allowed).toBe(true);
    expect((await checkLimit(key, 2, 60_000)).allowed).toBe(true);
    expect((await checkLimit(key, 2, 60_000)).allowed).toBe(false);
  });

  it("hydrate is a no-op without DATABASE_URL", async () => {
    const { hydrateFromPg } = await import("./hydrate.js");
    const target = {
      agents: new Map(),
      tools: new Map(),
      policies: new Map(),
      actions: new Map(),
      decisions: new Map(),
    };
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(await hydrateFromPg(target)).toBe(false);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });
});
