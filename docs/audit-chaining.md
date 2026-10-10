# Audit hash-chaining — design (deferred to V2)

## Problem

Decisions, judgments, and approvals in Postgres are mutable by anyone with
DB access. For a policy-enforcement tool, the audit trail should be
tamper-evident: silent modification of a past BLOCK into an ALLOW (or
deletion of a row) must be detectable without trusting the database.

## Proposal

Hash-chain every audit write. Each new record stores:

```text
prev_hash  # hash of the previous record in the chain (genesis: zeros)
hash       # sha256(prev_hash || canonical(record))
```

Chain covers, in order: actions → decisions → judgments → approvals →
purges. One chain per table keeps verification linear; a single global
sequence column makes cross-table ordering explicit.

Canonical form: `JSON.stringify` with sorted keys over the stored fields
(excluding `hash` itself), UTF-8, sha256 hex.

## Verification

`GET /v1/audit/verify` recomputes the chain(s) and returns
`{ ok, checked, firstBadId? }`. Runs on demand (admin-only) and on a
schedule in production. A mismatch names the first broken record; everything
after it is untrusted.

## Key management

The chain detects modification, not key compromise. Chain verification needs
no secret (sha256, no HMAC) — it proves *integrity*, not *origin*. If origin
matters (proving Sentinel wrote it), sign periodic checkpoints (e.g. hourly
root hash) with an offline key and publish the signatures; verification then
checks hash chain + checkpoint signatures.

## Migration path (when approved)

1. Add `prev_hash` + `hash` columns (nullable) to `actions`, `decisions`,
   `judgments`, `approvals` (approvals live inside decisions rows today —
   chaining them means either a separate approvals table or chaining the
   decision row versions; prefer the separate table, it also fixes the
   approval-audit story).
2. Backfill: existing rows get `prev_hash` chained in `createdAt,id` order
   with a `backfilled: true` marker — verifiable from the marker forward.
3. All writes compute hashes in the store layer (both memory and PgStore —
   hashing lives in `@sentinel/schemas` next to the record types so both
   backends share it).
4. Add `GET /v1/audit/verify` + dashboard status indicator.
5. Document retention interplay: purge deletes rows, which *breaks* the
   chain by design — purge must write a signed checkpoint *before*
   deleting, so post-purge verification starts at the checkpoint.

## Non-goals

- No blockchain, no external timestamping service in V1 of this feature.
- No encryption of audit contents (confidentiality is unchanged; secrets
  are already redacted before persistence).
- Does not replace Postgres backups or access control — it makes violations
  of those detectable.

## Effort estimate

Schema + store changes (both backends) + verify endpoint + tests + dashboard
badge: one focused deliverable, roughly the size of the key-registry change.
