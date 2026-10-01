import { buildServer } from "./server.js";
import { createMemoryStore } from "./store.js";

const port = Number(process.env.PORT ?? 3001);
const store = createMemoryStore();

// PG is the durable primary when DATABASE_URL is set: hydrate memory
// from it at boot (writes already mirror via persistAudit). Best-effort —
// a PG outage must not prevent serving from memory.
try {
  const { hydrateFromPg } = await import("@sentinel/db");
  if (await hydrateFromPg(store)) console.log("sentinel store hydrated from postgres");
} catch (err) {
  console.warn(`sentinel PG hydrate skipped: ${err instanceof Error ? err.message : err}`);
}

const app = buildServer(store);
await app.listen({ port, host: "0.0.0.0" });
console.log(`sentinel api listening on :${port}`);
