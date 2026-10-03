import { describe, it, expect } from "vitest";
import { agents, decisions } from "./schema.js";
import { checkLimit } from "./ratelimit.js";
import { isDbConfigured } from "./client.js";
import { isRedisConfigured } from "./redis.js";

describe("db package", () => {
  it("exposes drizzle tables", () => {
    expect(agents).toBeDefined();
    expect(decisions).toBeDefined();
  });

  it("reports managed-config presence without connecting", () => {
    expect(typeof isDbConfigured()).toBe("boolean");
    expect(typeof isRedisConfigured()).toBe("boolean");
  });

  it("memory rate limit allows then blocks", async () => {
    const key = `test-${Date.now()}`;
    expect((await checkLimit(key, 2, 60_000)).allowed).toBe(true);
    expect((await checkLimit(key, 2, 60_000)).allowed).toBe(true);
    expect((await checkLimit(key, 2, 60_000)).allowed).toBe(false);
  });
});
