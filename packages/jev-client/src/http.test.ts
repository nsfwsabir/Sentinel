import { describe, it, expect } from "vitest";
import { HttpJevClient } from "./http.js";
import type { EvalState } from "./index.js";

const state: EvalState = {
  agent: "research-agent",
  tool: "send_email",
  arguments: { to: "external@example.com" },
  policies: ["Customer data must never be sent externally."],
};

function okFetch(judgments: unknown) {
  return (async () =>
    new Response(JSON.stringify({ judgments }), { status: 200 })) as typeof fetch;
}

describe("http jev", () => {
  it("maps a valid response", async () => {
    const jev = new HttpJevClient({
      apiUrl: "http://jev",
      apiKey: "k",
      fetchImpl: okFetch([
        { question: "policy_violation", type: "noul", answer: "yes", confidence: 0.94 },
      ]),
    });
    const out = await jev.judge(state);
    expect(out[0]?.answer).toBe("yes");
    expect(out[0]?.confidence).toBe(0.94);
  });

  it("throws on missing config", async () => {
    const jev = new HttpJevClient({ apiUrl: "", apiKey: "" });
    await expect(jev.judge(state)).rejects.toThrow(/not configured/);
  });

  it("throws on malformed response (never invents permission)", async () => {
    const jev = new HttpJevClient({
      apiUrl: "http://jev",
      apiKey: "k",
      fetchImpl: okFetch({ nope: true }),
    });
    await expect(jev.judge(state)).rejects.toThrow(/malformed/);
  });

  it("retries once then throws on HTTP 500", async () => {
    let calls = 0;
    const jev = new HttpJevClient({
      apiUrl: "http://jev",
      apiKey: "k",
      fetchImpl: (async () => {
        calls += 1;
        return new Response("err", { status: 500 });
      }) as typeof fetch,
    });
    await expect(jev.judge(state)).rejects.toThrow(/HTTP 500/);
    expect(calls).toBe(2);
  });
});
