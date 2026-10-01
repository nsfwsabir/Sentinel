import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";
const KEY = process.env.SENTINEL_AGENT_KEY ?? "dev-key-1";

export const EvaluateInput = z.object({
  agentId: z.string().min(1),
  toolId: z.string().min(1),
  task: z.string().optional(),
  // MCP tool args must be JSON-schema expressible: keep arguments a free-form object.
  arguments: z.record(z.unknown()).default({}),
  context: z.record(z.unknown()).default({}),
});

export const DecisionInput = z.object({ id: z.string().min(1) });

export function createServer(): McpServer {
  const server = new McpServer({ name: "sentinel", version: "0.1.0" });

  server.tool(
    "sentinel_evaluate",
    "Evaluate an agent action against Sentinel policies. Returns ALLOW, REVIEW, or BLOCK.",
    EvaluateInput.shape,
    async (input) => {
      const r = await fetch(`${API}/v1/actions/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": KEY },
        body: JSON.stringify(input),
      });
      const body = await r.text();
      return { content: [{ type: "text" as const, text: `HTTP ${r.status}: ${body}` }] };
    },
  );

  server.tool(
    "sentinel_decision",
    "Fetch a stored Sentinel decision with evidence, matched policies, and judgments.",
    DecisionInput.shape,
    async ({ id }) => {
      const r = await fetch(`${API}/v1/decisions/${id}`);
      return { content: [{ type: "text" as const, text: `HTTP ${r.status}: ${await r.text()}` }] };
    },
  );

  return server;
}

// stdio entry — only connects when run directly, so imports stay test-safe.
if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
