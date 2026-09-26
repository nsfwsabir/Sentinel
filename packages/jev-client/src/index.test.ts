import { describe, it, expect } from "vitest";
import { MockJevClient } from "./index.js";

describe("mock jev", () => {
  it("flags exfil as violation with high confidence", async () => {
    const jev = new MockJevClient();
    const out = await jev.judge({
      agent: "research-agent",
      tool: "send_email",
      arguments: { to: "external@example.com", attachment: "customers.csv" },
      policies: ["Customer data must never be sent externally."],
    });
    const v = out.find((j) => j.question === "policy_violation");
    expect(v?.answer).toBe("yes");
    expect(v?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("does not flag benign dev query", async () => {
    const jev = new MockJevClient();
    const out = await jev.judge({
      agent: "a",
      tool: "query_database",
      arguments: { q: "select 1" },
      policies: [],
      environment: "development",
    });
    expect(out.find((j) => j.question === "policy_violation")?.answer).toBe("no");
  });
});
