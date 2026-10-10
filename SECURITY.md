# Security Policy

Sentinel is a security enforcement tool: reports are taken seriously.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's
[private vulnerability reporting](../../security/advisories/new)
on this repository. Include:

- Affected component and version/commit
- Steps to reproduce (redact any real secrets)
- Impact assessment if known

Expect an initial response within 72 hours. Fixes ship as patch
releases; reporters are credited unless anonymity is requested.

## Scope

In scope: the API auth paths (`agentAuth`, admin basic/scrypt, OIDC
verification), policy/decision integrity, audit hash-chain and
checkpoint verification, secret handling (redaction, key storage),
the dashboard credential proxies, and the Docker/CI supply chain.

Out of scope: the judgment providers themselves (Laya/Jev are external
services — report to their vendors), Falco default rules, and
denial-of-service via unbounded self-hosted deployments (rate limits
are documented in `.env.example`).

## Hardening notes for operators

- Never run with `ADMIN_PASS=admin` or `dev-key-1` beyond local dev:
  production boot refuses them, but set `ADMIN_PASS_HASH` and registry
  keys before exposing any port.
- Terminate TLS in front of the API; never publish `:3001` directly.
- Keep `AUDIT_SIGNING_KEY` offline; only the public half leaves your vault.
