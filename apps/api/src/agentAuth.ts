import { timingSafeEqual, createHash, randomBytes, randomUUID } from "node:crypto";
import { jwtVerify, decodeJwt, createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import type { ApiKey } from "@sentinel/schemas";

// Machine identity for agents (BYO OIDC issuer). A verified token binds
// `sub` → agentId, closing the self-asserted-agentId gap: any static-key
// holder could previously impersonate any agent. Static keys remain as a
// deprecated dev fallback (warned once when OIDC is configured).
export type AgentIdentity =
  | { kind: "oidc"; agentId: string; scopes: string[] }
  | { kind: "key"; agentId?: string; scopes: string[] }
  | { kind: "static" };

export type AgentAuthOptions = {
  issuers: string[];
  audience: string;
  staticKeys: string[];
  /** Override JWKS lookup (tests use a local set; prod uses remote discovery). */
  jwksFor?: (iss: string) => JWTVerifyGetKey;
  /** Runtime key registry (revocable, optionally agent-bound). */
  findApiKeyByHash?: (keyHash: string) => Promise<ApiKey | undefined>;
};

/** sha256 hex of a presented token. Only hashes are stored or compared. */
export function hashApiKey(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Import env static keys into an empty registry (fresh boot only).
 * Never re-seeds: once operators manage keys, deletions stay deleted. */
export async function seedEnvKeys(
  store: { listApiKeys(): Promise<{ id: string }[]>; saveApiKey(k: ApiKey): Promise<void> },
  staticKeys: string[],
): Promise<void> {
  if (staticKeys.length === 0) return;
  if ((await store.listApiKeys()).length > 0) return;
  for (let i = 0; i < staticKeys.length; i++) {
    await store.saveApiKey({
      id: `key_env_${i + 1}`,
      label: "env",
      keyHash: hashApiKey(staticKeys[i]),
      createdAt: new Date(),
    });
  }
}

/** Generate a fresh plaintext key (`sk_live_…`, returned once, never stored). */
export function generateApiKey(): { id: string; token: string } {
  return {
    id: `key_${randomUUID().slice(0, 8)}`,
    token: `sk_live_${randomBytes(24).toString("base64url")}`,
  };
}

const remoteJwks = new Map<string, JWTVerifyGetKey>();
let warnedFallback = false;

export function agentAuthFromEnv(): AgentAuthOptions {
  return {
    issuers: (process.env.OIDC_ISSUERS ?? "")
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean),
    audience: process.env.OIDC_AUDIENCE ?? "sentinel",
    staticKeys: (process.env.AGENT_API_KEYS ?? "dev-key-1")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

function bearerToken(header: string | string[] | undefined): string | null {
  const val = Array.isArray(header) ? header[0] : (header ?? "");
  const m = /^Bearer\s+(.+)$/i.exec(val.trim());
  return m ? m[1] : null;
}

function staticMatch(token: string, keys: string[]): boolean {
  const buf = Buffer.from(token);
  return keys.some((k) => {
    const kb = Buffer.from(k);
    return buf.length === kb.length && timingSafeEqual(buf, kb);
  });
}

/** Authenticate an agent request. Throws { statusCode: 401 } on failure. */
export async function authenticateAgent(
  headers: Record<string, string | string[] | undefined>,
  opts: AgentAuthOptions = agentAuthFromEnv(),
): Promise<AgentIdentity> {
  const fail = (): never => {
    const err = new Error("unauthorized: missing or invalid agent credential") as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  };

  // Legacy static keys via x-api-key or opaque bearer (unchanged behavior).
  const staticToken = (() => {
    const h = headers["x-api-key"];
    const v = Array.isArray(h) ? h[0] : h;
    if (v) return v;
    const b = bearerToken(headers["authorization"]);
    // JWT-shaped tokens go down the OIDC path when issuers are configured.
    if (b && (b.split(".").length !== 3 || opts.issuers.length === 0)) return b;
    return null;
  })();
  if (staticToken && staticMatch(staticToken, opts.staticKeys)) {
    if (opts.issuers.length > 0 && !warnedFallback) {
      warnedFallback = true;
      console.warn("sentinel: agent used deprecated static key while OIDC issuers are configured");
    }
    return { kind: "static" };
  }

  // Runtime registry: revocable keys, optionally bound to one agent.
  // Only hashes are stored; the presented token is hashed for comparison.
  const presented = staticToken ?? bearerToken(headers["authorization"]);
  if (presented && opts.findApiKeyByHash) {
    const found = await opts.findApiKeyByHash(hashApiKey(presented)).catch(() => undefined);
    if (found) {
      return found.boundAgentId
        ? { kind: "key", agentId: found.boundAgentId, scopes: [] }
        : { kind: "key", scopes: [] };
    }
  }

  const token: string = bearerToken(headers["authorization"]) ?? fail();
  if (opts.issuers.length === 0) fail();
  let iss: string | undefined;
  try {
    iss = decodeJwt(token).iss?.replace(/\/$/, "");
  } catch {
    fail();
  }
  if (!iss || !opts.issuers.includes(iss)) fail();
  try {
    const getKey =
      opts.jwksFor?.(iss!) ??
      (() => {
        let set = remoteJwks.get(iss!);
        if (!set) {
          set = createRemoteJWKSet(new URL(`${iss}/.well-known/jwks.json`));
          remoteJwks.set(iss!, set);
        }
        return set;
      })();
    const { payload } = await jwtVerify(token!, getKey, { issuer: iss, audience: opts.audience });
    const sub = typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : fail();
    // OAuth scopes: space-separated `scope` (RFC 6749) or `scp` array (Entra style).
    const scopes =
      typeof payload.scope === "string"
        ? payload.scope.split(" ").map((s) => s.trim()).filter(Boolean)
        : Array.isArray(payload.scp)
          ? (payload.scp as unknown[]).filter((s): s is string => typeof s === "string")
          : [];
    return { kind: "oidc", agentId: sub, scopes };
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 401) throw err;
    fail();
  }
  throw new Error("unreachable");
}
