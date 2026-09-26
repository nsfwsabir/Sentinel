import { describe, it, expect } from "vitest";
import { SentinelClient } from "./index.js";

describe("agent-sdk", () => {
  it("parses evaluate responses via injected fetch", async () => {
    const client = new SentinelClient({
      baseUrl: "http://x",
      apiKey: "k",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({ decision: "block", confidence: 0.94, reason: "r", decisionId: "dec_1" }),
          { status: 200 },
        )) as typeof fetch,
    });
    const r = await client.evaluateAction({ agentId: "a", toolId: "t", arguments: {}, context: {} });
    expect(r.decision).toBe("block");
  });
});
