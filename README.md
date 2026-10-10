# Sentinel

Runtime policy enforcement for AI agents. Every proposed agent action is
evaluated against policy **before execution** and receives
`ALLOW | REVIEW | BLOCK`. Deterministic policy decides; AI judgment models
only advise; outages fail closed. Your agents run their own servers —
Sentinel is a gate, not an agent.

## Self-host in 5 minutes

```bash
git clone https://github.com/nsfwsabir/Sentinel.git && cd Sentinel
docker compose up --build -d
```

- Dashboard → `http://localhost:3000`, API → `http://localhost:3001`
- Dev login: agent key `dev-key-1`, admin `admin:admin`
- Try it: open **Simulate**, pick a scenario preset, hit Evaluate

This runs Postgres + Redis + API + dashboard + Falco (kernel signals,
optional — needs a privileged Linux host; the rest works without it).

## How it works

1. Your agent calls `POST /v1/actions/evaluate` (or via the MCP stdio
   server / A2A gateway on `:3002`) with agent, tool, arguments.
2. **Deterministic checks first** (OPA-WASM Rego, TypeScript fallback):
   exfiltration, credentials, destructive prod actions, payment thresholds.
   A blocking finding short-circuits — no model call spent.
3. **Contextual judgment** (mock by default; Laya/Jev/custom via
   `JUDGMENT_PROVIDER`): five yes/no questions, schema-validated,
   one retry, then fail-closed by tool risk.
4. **Decision** by precedence `BLOCK > REVIEW > ALLOW`. `REVIEW` never
   auto-resolves — a human approves or rejects, and every approval is
   audited. Decided reviews resolve to allow/block across metrics and UI.
5. **Audit**: every decision is SHA-256 hash-chained; retention purges
   leave signed bridge checkpoints verifiable at
   `GET /v1/audit/verify` (Ed25519, optional offline key).

## Local development (managed PG/Redis)

```bash
cp .env.example .env  # fill DATABASE_URL, REDIS_URL
pnpm install
pnpm -r build         # required first: packages resolve each other via dist/
pnpm -r typecheck && pnpm -r test
pnpm --filter @sentinel/api dev        # :3001
pnpm --filter @sentinel/dashboard dev  # :3000
```

## Judgment providers

Mocked by default (`JUDGMENT_PROVIDER=mock`, no key needed).
Laya Studio or self-hosted `laya-serve` (Sentinel never hosts Laya):

```bash
JUDGMENT_PROVIDER=laya
LAYA_API_KEY=lsk_live_...                       # hosted
# LAYA_API_URL=http://localhost:8000/v1/systemone  # self-hosted instead
```

Check Settings → provider card → Test connection, or
`curl -s localhost:3001/v1/provider/status`.

## Going beyond localhost

- **Secrets**: set `ADMIN_PASS_HASH` (scrypt), registry API keys, and
  `AUTH_SECRET` before exposing any port — production boot refuses the
  dev defaults (`dev-key-1`, `admin:admin`).
- **TLS**: terminate in front (Caddy/Traefik); never publish `:3001`.
- **Backups**: nightly `pg_dump` off the box; drill a restore, then
  re-verify the audit chain on the restored data.
- **Audit origin**: generate an offline Ed25519 key, set
  `AUDIT_SIGNING_KEY`, publish the public half; see
  `GET /v1/audit/verify` → `anchorPublicKey` + `signatureValid`.

## Docs

- `docs/architecture.html` — full system map, trust boundaries, failure
  modes (open in a browser, works offline)
- `docs/PRD.md`, `docs/TRD.md`, `docs/DESIGN.md` — product, technical,
  and interface decisions
- `docs/AGENTS.md` — contributor rules (search-first, fail-closed,
  no-AI-slop UI); start here before a PR

## Security

See [SECURITY.md](SECURITY.md) to report vulnerabilities privately.
Please do not open public issues for security bugs.

## License

[MIT](LICENSE) — self-host it, fork it, sell it.
