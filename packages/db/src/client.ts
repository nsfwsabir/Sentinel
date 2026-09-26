import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

let cached: ReturnType<typeof drizzlePostgres<typeof schema>> | null = null;

/** Lazy PG client for managed providers (Neon). No connection until first query. */
export function db() {
  if (cached) return cached;
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL not configured (managed Postgres required)");
  const client = postgres(url, { max: 5 });
  cached = drizzlePostgres(client, { schema });
  return cached;
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
