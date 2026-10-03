import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";

// Live-PG integration. Runs only with SENTINEL_TEST_DATABASE_URL pointed
// at a database where `pnpm --filter @sentinel/db db:migrate` has run.
// CI/local without PG: skipped, never failing.
const url = process.env.SENTINEL_TEST_DATABASE_URL;

describe.skipIf(!url)("pg integration", () => {
  it("round-trips agent → action → decision → judgment", async () => {
    process.env.DATABASE_URL = url;
    const { db } = await import("./client.js");
    const s = await import("./schema.js");
    const d = db();
    const suffix = Date.now().toString(36);
    const agentId = `test_ag_${suffix}`;
    const toolId = `test_tool_${suffix}`;
    const actionId = `test_act_${suffix}`;
    const decisionId = `test_dec_${suffix}`;

    await d.insert(s.agents).values({ id: agentId, name: "Test", status: "active", createdAt: new Date() });
    await d.insert(s.tools).values({ id: toolId, name: toolId, description: "test", riskLevel: "low" });
    await d.insert(s.actions).values({
      id: actionId, agentId, toolId, arguments: {}, context: {}, createdAt: new Date(),
    });
    await d.insert(s.decisions).values({
      id: decisionId, actionId, outcome: "allow", confidence: 1,
      reason: "test", policyIds: [], fallbackUsed: false, createdAt: new Date(),
    });

    const rows = await d.select().from(s.decisions).where(eq(s.decisions.id, decisionId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome).toBe("allow");

    await d.delete(s.decisions).where(eq(s.decisions.id, decisionId));
    await d.delete(s.actions).where(eq(s.actions.id, actionId));
    await d.delete(s.tools).where(eq(s.tools.id, toolId));
    await d.delete(s.agents).where(eq(s.agents.id, agentId));
  });

  it("pgstore honors the full Store contract", async () => {
    process.env.DATABASE_URL = url;
    const { createPgStore } = await import("./pgstore.js");
    const store = createPgStore();
    const suffix = Date.now().toString(36);
    const now = new Date();

    await store.saveAgent({ id: `c_ag_${suffix}`, name: "C", status: "active", createdAt: now });
    expect((await store.getAgent(`c_ag_${suffix}`))?.name).toBe("C");
    await store.saveTool({ id: `c_tool_${suffix}`, name: "t", description: "d", riskLevel: "low" });
    await store.savePolicy({
      id: `c_pol_${suffix}`, name: "p", description: "d", severity: "low",
      mode: "audit", enabled: true, version: 1, scope: "org", agentIds: [],
    });
    expect((await store.listPolicies()).some((p) => p.id === `c_pol_${suffix}`)).toBe(true);

    const actionId = `c_act_${suffix}`;
    await store.saveAction({ id: actionId, agentId: `c_ag_${suffix}`, toolId: `c_tool_${suffix}`, arguments: {}, createdAt: now });
    expect((await store.listActionsByAgent(`c_ag_${suffix}`, 10)).length).toBe(1);

    const decId = `c_dec_${suffix}`;
    await store.saveDecision({
      id: decId, actionId, outcome: "review", confidence: 0.9, reason: "r",
      policyIds: [`c_pol_${suffix}`], createdAt: now,
      judgments: [{ id: `c_jud_${suffix}`, decisionId: decId, question: "q", type: "noul", answer: "yes", confidence: 0.9 }],
      approvalStatus: "pending",
    });
    const fetched = await store.getDecision(decId);
    expect(fetched?.judgments.length).toBe(1);
    expect((await store.listDecisions({ outcome: "review", agentId: `c_ag_${suffix}`, limit: 10 })).length).toBe(1);
    expect((await store.listReviewDecisions()).some((d) => d.id === decId)).toBe(true);

    const m = await store.metrics();
    expect(m.review_total).toBeGreaterThanOrEqual(1);
    expect(m.decisions_total).toBeGreaterThanOrEqual(m.review_total);

    // Approval then purge: approved rows survive by default.
    await store.saveDecision({ ...fetched!, approvalStatus: "approved" });
    const kept = await store.purgeDecisions(new Date(Date.now() + 1000), { includeApprovals: false, limit: 100 });
    expect(kept.skippedApprovals).toBeGreaterThanOrEqual(1);
    const gone = await store.purgeDecisions(new Date(Date.now() + 1000), { includeApprovals: true, limit: 100 });
    expect(gone.deleted).toBeGreaterThanOrEqual(1);
    expect(await store.getDecision(decId)).toBeUndefined();

    await store.deleteAction(actionId);
    await store.deleteTool(`c_tool_${suffix}`);
    await store.deletePolicy(`c_pol_${suffix}`);
    await store.deleteAgent(`c_ag_${suffix}`);
    expect(await store.getAgent(`c_ag_${suffix}`)).toBeUndefined();
  });

  it("pgstore persists API keys with hashes only", async () => {
    process.env.DATABASE_URL = url;
    const { createPgStore } = await import("./pgstore.js");
    const { createHash } = await import("node:crypto");
    const store = createPgStore();
    const hash = createHash("sha256").update("tok-xyz", "utf8").digest("hex");

    await store.saveApiKey({ id: "c_key_1", label: "ci", keyHash: hash, boundAgentId: "a", createdAt: new Date() });
    const found = await store.findApiKeyByHash(hash);
    expect(found?.boundAgentId).toBe("a");
    const listed = await store.listApiKeys();
    const listedOne = listed.find((k) => k.id === "c_key_1");
    expect(listedOne).toBeDefined();
    expect("keyHash" in (listedOne as object)).toBe(false);
    expect(await store.deleteApiKey("c_key_1")).toBe(true);
    expect(await store.findApiKeyByHash(hash)).toBeUndefined();
  });
});
