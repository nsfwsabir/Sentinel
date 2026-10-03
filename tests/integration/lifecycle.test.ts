import { describe, it, expect } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";
import { createMemoryStore } from "../../apps/api/src/store.js";

// PRD §9 success criteria: register agent → policies → tools → submit →
// ALLOW/REVIEW/BLOCK → inspect decision → approve → inspect evidence.
describe("integration: full decision lifecycle", () => {
  it("hero demo: block exfil, inspect, review payment, approve", async () => {
    const store = createMemoryStore();
    const app = await buildServer(store);
    const KEY = { "x-api-key": "dev-key-1" };

    const blocked = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: KEY,
      payload: {
        agentId: "research-agent",
        toolId: "send_email",
        task: "Share customer list",
        arguments: { to: "external@example.com", attachment: "customers.csv" },
        context: {},
      },
    });
    expect(blocked.json().decision).toBe("block");
    const blockId = blocked.json().decisionId as string;

    const detail = await app.inject({ method: "GET", url: `/v1/decisions/${blockId}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().policyIds.length).toBeGreaterThan(0);

    const payment = await app.inject({
      method: "POST",
      url: "/v1/actions/evaluate",
      headers: KEY,
      payload: {
        agentId: "deploy-agent",
        toolId: "refund",
        arguments: { amount: 500 },
        context: {},
      },
    });
    expect(payment.json().decision).toBe("review");
    const reviewId = payment.json().decisionId as string;

    const admin = "Basic " + Buffer.from("admin:admin").toString("base64");
    const approved = await app.inject({
      method: "POST",
      url: `/v1/approvals/${reviewId}/approve`,
      headers: { authorization: admin },
    });
    expect(approved.json().approvalStatus).toBe("approved");

    const list = await app.inject({ method: "GET", url: "/v1/decisions" });
    expect(list.json().length).toBe(2);
  });
});
