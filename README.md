# Sentinel

Runtime policy enforcement for AI agents: `ALLOW | REVIEW | BLOCK`.

See `docs/` locally (gitignored) for PRD/TRD/DESIGN/AGENTS.
TRD stack: Fastify API + Next.js dashboard + Postgres/Drizzle + Redis. Contextual judgment via Laya (mocked by default, `JUDGMENT_PROVIDER=mock`; set `JUDGMENT_PROVIDER=laya` + `LAYA_API_KEY` for live judgments).

## Quick start (managed PG/Redis)

```bash
cp .env.example .env  # fill DATABASE_URL, REDIS_URL
pnpm install
pnpm typecheck && pnpm test
pnpm --filter @sentinel/api dev
```

## Judgment provider (Laya)

Sentinel asks Laya contextual yes/no questions about each action; Laya never
decides policy. Deterministic checks + policy evaluation + `BLOCK > REVIEW >
ALLOW` precedence always apply, and provider outages fail closed.

Mocked by default (`JUDGMENT_PROVIDER=mock`, no key needed).

**Hosted** (Laya Studio + your key):

```bash
JUDGMENT_PROVIDER=laya
LAYA_API_KEY=lsk_live_...
```

**Self-hosted** (`laya-serve`, same System-One shape — Sentinel does not host Laya):

```bash
JUDGMENT_PROVIDER=laya
LAYA_API_URL=http://localhost:8000/v1/systemone
# LAYA_API_KEY=... (only if your endpoint requires auth)
```

Verify in Settings → Laya Judgment Provider → Test connection, or:

```bash
curl -s localhost:3001/v1/provider/status
curl -s -X POST localhost:3001/v1/provider/test \
  -H "Authorization: Basic $(echo -n admin:admin | base64)"
```
