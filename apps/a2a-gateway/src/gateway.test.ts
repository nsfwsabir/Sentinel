import { describe, it, expect, vi, afterEach } from "vitest";
import { buildGateway } from "./gateway.js";

const action = {
  agentId: "research-agent",
  toolId: "send_email",
  arguments: { to: "external@example.com", attachment: "customers.csv" },
  context: {},
};

function stubFetch(decision: object, status = 200, capture?: { headers?: unknown }) {
  return vi.stubGlobal(
    "fetch",
    (async (_url: string, init?: { headers?: unknown }) => {
      if (capture && init) capture.headers = init.headers;
      return new Response(JSON.stringify(decision), { status });
    }) as typeof fetch,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function sendMessage(message: unknown, id = "1") {
  const app = buildGateway();
  return app.inject({ method: "POST", url: "/", payload: { jsonrpc: "2.0", id, method: "message/send", params: { message } } });
}

const msg = (data: unknown) => ({ messageId: "m1", role: "user", parts: [{ kind: "data", data }] });

describe("a2a gateway", () => {
  it("serves an agent card describing a policy gate", async () => {
    const app = buildGateway();
    const r = await app.inject({ method: "GET", url: "/.well-known/agent-card.json" });
    const card = r.json();
    expect(card.name).toBe("Sentinel");
    expect(JSON.stringify(card).toLowerCase()).toMatch(/never executes/);
    expect(card.skills[0].id).toBe("evaluate-action");
  });

  it("maps BLOCK to REJECTED with a decision artifact", async () => {
    stubFetch({ decision: "block", confidence: 1, reason: "exfil", decisionId: "dec_1" });
    const r = await sendMessage(msg({ action }));
    const body = r.json();
    expect(body.result.status.state).toBe("REJECTED");
    expect(body.result.artifacts[0].parts[0].data.decision).toBe("block");
    expect(body.result.artifacts[0].parts[0].data.decisionId).toBe("dec_1");
  });

  it("maps REVIEW to INPUT_REQUIRED and ALLOW to COMPLETED", async () => {
    stubFetch({ decision: "review", reason: "pay", decisionId: "dec_2" });
    expect((await sendMessage(msg({ action }))).json().result.status.state).toBe("INPUT_REQUIRED");
    stubFetch({ decision: "allow", decisionId: "dec_3" });
    expect((await sendMessage(msg({ action }))).json().result.status.state).toBe("COMPLETED");
  });

  it("rejects unknown methods and malformed actions with JSON-RPC errors", async () => {
    const app = buildGateway();
    const unknown = await app.inject({
      method: "POST",
      url: "/",
      payload: { jsonrpc: "2.0", id: "1", method: "tasks/cancel", params: {} },
    });
    expect(unknown.json().error.code).toBe(-32601);
    const bad = await sendMessage(msg({ nope: true }));
    expect(bad.json().error.code).toBe(-32602);
  });

  it("forwards caller auth when present, else uses its own key", async () => {
    const capture: { headers?: unknown } = {};
    stubFetch({ decision: "allow", decisionId: "dec_4" }, 200, capture);
    const app = buildGateway();
    await app.inject({
      method: "POST",
      url: "/",
      headers: { authorization: "Bearer caller-token" },
      payload: { jsonrpc: "2.0", id: "1", method: "message/send", params: { message: msg({ action }) } },
    });
    expect(capture.headers).toMatchObject({ authorization: "Bearer caller-token" });

    const capture2: { headers?: unknown } = {};
    stubFetch({ decision: "allow", decisionId: "dec_5" }, 200, capture2);
    await app.inject({
      method: "POST",
      url: "/",
      payload: { jsonrpc: "2.0", id: "2", method: "message/send", params: { message: msg({ action }) } },
    });
    expect(capture2.headers).toMatchObject({ "x-api-key": expect.any(String) });
  });
});
