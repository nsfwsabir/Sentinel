import { describe, it, expect } from "vitest";
import { EvaluateInput, DecisionInput, createServer } from "./index.js";

describe("mcp", () => {
  it("validates tool inputs", () => {
    expect(EvaluateInput.safeParse({ agentId: "a", toolId: "t" }).success).toBe(true);
    expect(EvaluateInput.safeParse({ agentId: "", toolId: "t" }).success).toBe(false);
    expect(DecisionInput.safeParse({}).success).toBe(false);
  });

  it("registers sentinel tools without connecting", () => {
    const server = createServer();
    expect(server).toBeDefined();
  });
});
