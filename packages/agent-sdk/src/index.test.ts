import { describe, it, expect, vi } from "vitest";
import { SentinelClient } from "./index.js";

function stub(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = `${init?.method ?? "GET"} ${url.replace("http://x", "")}`;
    const route = routes[key] ?? { status: 404, body: { error: "not found" } };
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const clientOpts = (fetchImpl: typeof fetch) => ({
  baseUrl: "http://x",
  apiKey: "k",
  admin: { user: "admin", pass: "admin" },
  fetchImpl,
});

describe("agent-sdk", () => {
  it("parses evaluate responses via injected fetch", async () => {
    const { fetchImpl } = stub({
      "POST /v1/actions/evaluate": {
        body: { decision: "block", confidence: 0.94, reason: "r", decisionId: "dec_1" },
      },
    });
    const client = new SentinelClient(clientOpts(fetchImpl));
    const r = await client.evaluateAction({ agentId: "a", toolId: "t", arguments: {}, context: {} });
    expect(r.decision).toBe("block");
  });

  it("registers agents/tools and reads decisions", async () => {
    const agent = { id: "a1", name: "A", status: "active", createdAt: new Date().toISOString() };
    const { fetchImpl, calls } = stub({
      "POST /v1/agents": { status: 201, body: agent },
      "GET /v1/decisions?outcome=block": {
        body: [{ id: "dec_1", actionId: "act_1", outcome: "block", policyIds: [], createdAt: new Date().toISOString() }],
      },
      "GET /v1/decisions/dec_1": {
        body: { id: "dec_1", actionId: "act_1", outcome: "block", policyIds: [], createdAt: new Date().toISOString(), judgments: [] },
      },
    });
    const client = new SentinelClient(clientOpts(fetchImpl));
    expect((await client.registerAgent(agent as never)).id).toBe("a1");
    expect((await client.listDecisions({ outcome: "block" })).length).toBe(1);
    expect((await client.getDecision("dec_1")).judgments).toEqual([]);
    expect(calls[1]?.url).toContain("outcome=block");
  });

  it("approves with admin basic auth and replays/dry-runs/purges", async () => {
    const { fetchImpl, calls } = stub({
      "POST /v1/approvals/dec_1/approve": { body: { approvalStatus: "approved" } },
      "POST /v1/actions/act_1/replay": {
        body: { decision: "review", reason: "r", decisionId: "dec_2" },
      },
      "POST /v1/policies/dry-run": {
        body: { evaluated: 3, would_block: 1, would_review: 1, would_remain_allowed: 1 },
      },
      "DELETE /v1/decisions?before=2020-01-01&includeApprovals=false": {
        body: { deleted: 2, skippedApprovals: 1, actionsDeleted: 2 },
      },
    });
    const client = new SentinelClient(clientOpts(fetchImpl));
    const approved = await client.approveDecision("dec_1");
    expect(approved.approvalStatus).toBe("approved");
    expect(calls[0]?.init?.headers).toMatchObject({
      authorization: "Basic " + Buffer.from("admin:admin").toString("base64"),
    });
    expect((await client.replayAction("act_1")).decision).toBe("review");
    const dry = await client.dryRunPolicy({
      id: "p",
      name: "n",
      description: "d",
      severity: "high",
      mode: "block",
      enabled: true,
      version: 1,
    });
    expect(dry.would_block).toBe(1);
    expect((await client.purgeDecisions("2020-01-01")).deleted).toBe(2);
    // Bodyless requests must not send content-type (Fastify rejects empty JSON bodies).
    const purgeCall = calls.find((c) => String(c.url).includes("/v1/decisions?before="));
    expect(purgeCall?.init?.headers).not.toMatchObject({ "content-type": expect.anything() });
  });

  it("throws without admin credentials for privileged calls", async () => {
    const { fetchImpl } = stub({});
    const client = new SentinelClient({ baseUrl: "http://x", apiKey: "k", fetchImpl });
    await expect(client.approveDecision("dec_1")).rejects.toThrow(/admin credentials/);
  });
});
