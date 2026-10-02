import postgres from "postgres";

// Minimal idempotent DDL matching src/schema.ts. Run with:
//   DATABASE_URL=... pnpm --filter @sentinel/db db:migrate
const DDL = `
CREATE TABLE IF NOT EXISTS agents (id text primary key, name text not null, description text, status text not null default 'active', created_at timestamptz not null default now());
CREATE TABLE IF NOT EXISTS tools (id text primary key, name text not null, description text not null, risk_level text not null default 'medium');
CREATE TABLE IF NOT EXISTS policies (id text primary key, name text not null, description text not null, severity text not null default 'medium', mode text not null default 'review', enabled boolean not null default true, version integer not null default 1);
CREATE TABLE IF NOT EXISTS actions (id text primary key, agent_id text not null references agents(id), tool_id text not null references tools(id), task text, arguments jsonb not null default '{}', context jsonb not null default '{}', created_at timestamptz not null default now());
CREATE TABLE IF NOT EXISTS decisions (id text primary key, action_id text not null references actions(id), outcome text not null, confidence real, reason text, policy_ids jsonb not null default '[]', approval_status text, fallback_used boolean not null default false, evaluation_duration_ms integer, provider_duration_ms integer, created_at timestamptz not null default now());
CREATE TABLE IF NOT EXISTS judgments (id text primary key, decision_id text not null references decisions(id), question text not null, type text not null default 'noul', answer jsonb, probabilities jsonb, confidence real);
-- Jev-era column rename (idempotent; no-op on fresh databases).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'decisions' AND column_name = 'jev_duration_ms') THEN
    ALTER TABLE decisions RENAME COLUMN jev_duration_ms TO provider_duration_ms;
  END IF;
END $$;
`;

const url = process.env.DATABASE_URL ?? "";
if (!url) {
  console.error("DATABASE_URL not set — skipping migrate (managed Postgres required).");
  process.exit(1);
}
const sql = postgres(url);
await sql.unsafe(DDL);
await sql.end();
console.log("sentinel schema migrated");
