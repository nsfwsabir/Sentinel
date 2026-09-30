import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";
import { createMemoryStore } from "./store.js";

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
});
