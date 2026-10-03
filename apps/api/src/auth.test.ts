import { describe, it, expect } from "vitest";
import { hashAdminPassword, verifyAdminPassword, parseBasicAuth } from "./auth.js";
import { buildServer } from "./server.js";
import { createMemoryStore } from "./store.js";

describe("auth", () => {
  it("hashes and verifies, rejects wrong password and garbage", async () => {
    const hash = await hashAdminPassword("s3cret");
    expect(await verifyAdminPassword("s3cret", hash)).toBe(true);
    expect(await verifyAdminPassword("wrong", hash)).toBe(false);
    expect(await verifyAdminPassword("s3cret", "garbage")).toBe(false);
    expect(await verifyAdminPassword("s3cret", "scrypt$short$abcd")).toBe(false);
  });

  it("parses basic auth headers", () => {
    const h = "Basic " + Buffer.from("admin:pw").toString("base64");
    expect(parseBasicAuth(h)).toEqual({ user: "admin", password: "pw" });
    expect(parseBasicAuth("Bearer x")).toBeNull();
  });

  it("approvals accept ADMIN_PASS_HASH and reject plaintext when set", async () => {
    const saved = process.env.ADMIN_PASS_HASH;
    process.env.ADMIN_PASS_HASH = await hashAdminPassword("hash-only");
    try {
      const app = await buildServer(createMemoryStore());
      const created = await app.inject({
        method: "POST",
        url: "/v1/actions/evaluate",
        headers: { "x-api-key": "dev-key-1" },
        payload: { agentId: "deploy-agent", toolId: "refund", arguments: { amount: 500 }, context: {} },
      });
      const id = created.json().decisionId as string;
      const plain = await app.inject({
        method: "POST",
        url: `/v1/approvals/${id}/approve`,
        headers: { authorization: "Basic " + Buffer.from("admin:admin").toString("base64") },
      });
      expect(plain.statusCode).toBe(401);
      const hashed = await app.inject({
        method: "POST",
        url: `/v1/approvals/${id}/approve`,
        headers: { authorization: "Basic " + Buffer.from("admin:hash-only").toString("base64") },
      });
      expect(hashed.statusCode).toBe(200);
    } finally {
      if (saved === undefined) delete process.env.ADMIN_PASS_HASH;
      else process.env.ADMIN_PASS_HASH = saved;
    }
  });
});
