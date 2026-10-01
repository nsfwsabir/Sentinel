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
});
