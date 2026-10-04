import { buildServer, productionSecretProblems } from "./server.js";
import { createMemoryStore } from "./store.js";
import type { Store } from "@sentinel/schemas";

const port = Number(process.env.PORT ?? 3001);

// Refuse to boot production on dev secrets. Registry/OIDC setups still
// pass as long as the literal defaults are gone.
const problems = productionSecretProblems();
if (problems.length > 0) {
  console.error(`sentinel refusing production boot: ${problems.join("; ")}`);
  process.exit(1);
}

// Postgres is the shared source of truth when DATABASE_URL is set
// (multi-instance safe); otherwise a hermetic memory store.
// A configured-but-unreachable database is a hard boot failure: silently
// serving from memory would split-brain instances with no alarm.
let store: Store = createMemoryStore();
if (process.env.DATABASE_URL) {
  const { createPgStore } = await import("@sentinel/db");
  const pg = createPgStore();
  try {
    await pg.listAgents();
    store = pg;
    console.log("sentinel using postgres store");
  } catch (err) {
    console.error(`sentinel refusing boot: DATABASE_URL unreachable: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

const app = await buildServer(store);
await app.listen({ port, host: "0.0.0.0" });
console.log(`sentinel api listening on :${port}`);
