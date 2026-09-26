import { Redis } from "ioredis";

let cached: Redis | null = null;

/** Lazy Redis client for managed providers (Upstash). Used for rate-limit + idempotency. */
export function redis(): Redis {
  if (cached) return cached;
  const url = process.env.REDIS_URL ?? "";
  if (!url) throw new Error("REDIS_URL not configured (managed Redis required)");
  cached = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
  return cached;
}

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}
