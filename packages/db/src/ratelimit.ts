import { isRedisConfigured, redis } from "./redis.js";

const mem = new Map<string, { count: number; resetAt: number }>();

/**
 * Fixed-window rate limit. Uses Redis when configured, else in-memory.
 * Returns { allowed, remaining }. Never throws — fails open to allowed
 * on Redis errors (rate limiting must not block evaluation pipeline).
 */
export async function checkLimit(
  key: string,
  limit = 60,
  windowMs = 60_000,
): Promise<{ allowed: boolean; remaining: number }> {
  if (!isRedisConfigured()) {
    const now = Date.now();
    const cur = mem.get(key);
    if (!cur || cur.resetAt <= now) {
      mem.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }
    cur.count += 1;
    return { allowed: cur.count <= limit, remaining: Math.max(0, limit - cur.count) };
  }
  try {
    const r = redis();
    const count = await r.incr(`sentinel:rl:${key}`);
    if (count === 1) await r.pexpire(`sentinel:rl:${key}`, windowMs);
    const ttl = await r.pttl(`sentinel:rl:${key}`);
    void ttl;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    return { allowed: true, remaining: limit };
  }
}
