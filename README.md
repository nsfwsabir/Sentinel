# Sentinel

Runtime policy enforcement for AI agents: `ALLOW | REVIEW | BLOCK`.

See `docs/` locally (gitignored) for PRD/TRD/DESIGN/AGENTS.
TRD stack: Fastify API + Next.js dashboard + Postgres/Drizzle + Redis. Jev mocked by default (`JEV_PROVIDER=mock`).

## Quick start (managed PG/Redis)

```bash
cp .env.example .env  # fill DATABASE_URL, REDIS_URL
pnpm install
pnpm typecheck && pnpm test
pnpm --filter @sentinel/api dev
```
