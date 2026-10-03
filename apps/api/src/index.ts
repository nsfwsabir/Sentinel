import { buildServer } from "./server.js";
import { createMemoryStore } from "./store.js";
import type { Store } from "@sentinel/schemas";

const port = Number(process.env.PORT ?? 3001);

// Postgres is the shared source of truth when DATABASE_URL is set
// (multi-instance safe); otherwise a hermetic memory store.
let store: Store = createMemoryStore();
if (process.env.DATABASE_URL) {
  try {
    const { createPgStore } = await import("@sentinel/db");
    store = createPgStore();
    console.log("sentinel using postgres store");
  } catch (err) {
    console.warn(`sentinel PG store unavailable, using memory: ${err instanceof Error ? err.message : err}`);
  }
}

const app = await buildServer(store);
await app.listen({ port, host: "0.0.0.0" });
console.log(`sentinel api listening on :${port}`);
