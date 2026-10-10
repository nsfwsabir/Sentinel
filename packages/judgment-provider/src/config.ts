// Laya endpoint configuration: hosted (Laya Studio + customer key) or
// custom (customer self-hosted System-One-compatible endpoint).
// Sentinel never hosts Laya; it only connects to the configured endpoint.
export const HOSTED_API_URL = "https://api.laya.studio/v1/systemone";

export type LayaMode = "hosted" | "custom";

export type ResolvedLayaConfig = {
  mode: LayaMode;
  apiUrl: string;
  apiKey: string;
  model?: string;
  timeoutMs: number;
  /** Non-fatal advisories (e.g. plain HTTP to a remote host). Never contain secrets. */
  warnings: string[];
};

export function isLocalhost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h === "::1" ||
    /^127\./.test(h)
  );
}

/**
 * Validate Laya configuration. Throws a safe Error (never includes the key)
 * on invalid provider/mode/URL; warns on plain-HTTP remote endpoints.
 * Reads `{ LAYA_MODE, LAYA_API_URL, LAYA_API_KEY, LAYA_MODEL, LAYA_TIMEOUT_MS }`
 * from `env` (defaults to process.env) so callers can pass explicit values.
 */
export function resolveLayaConfig(env: Record<string, string | undefined> = process.env): ResolvedLayaConfig {
  const rawMode = env.LAYA_MODE;
  if (rawMode !== undefined && rawMode !== "hosted" && rawMode !== "custom") {
    throw new Error(`Invalid LAYA_MODE: expected "hosted" or "custom"`);
  }
  const apiUrl = env.LAYA_API_URL ?? HOSTED_API_URL;
  const mode: LayaMode = rawMode ?? (env.LAYA_API_URL !== undefined ? "custom" : "hosted");

  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error(`Invalid LAYA_API_URL: not a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Invalid LAYA_API_URL: only http(s) endpoints are allowed`);
  }
  const warnings: string[] = [];
  if (url.protocol === "http:" && !isLocalhost(url.hostname)) {
    warnings.push("LAYA_API_URL uses plain HTTP for a non-localhost endpoint; prefer HTTPS");
  }

  const apiKey = env.LAYA_API_KEY ?? "";
  if (mode === "hosted" && !apiKey) {
    throw new Error(`LAYA_API_KEY is required in hosted mode`);
  }

  const timeoutMs = Number(env.LAYA_TIMEOUT_MS ?? 8000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid LAYA_TIMEOUT_MS: must be a positive number`);
  }

  return {
    mode,
    apiUrl,
    apiKey,
    model: env.LAYA_MODEL ?? undefined,
    timeoutMs,
    warnings,
  };
}

export type SystemOneEnvConfig = {
  mode: "hosted" | "custom";
  apiUrl: string;
  apiKey: string;
  model?: string;
  timeoutMs: number;
  warnings: string[];
};

/**
 * Generic System-One endpoint config for any wire-compatible model
 * (Jev, Microsoft Decision-1 via OpenRouter, …). Same validation as Laya:
 * http(s) only, localhost warning, key required unless explicitly remote-optional.
 */
export function resolveSystemOneEnvConfig(
  env: Record<string, string | undefined>,
  opts: {
    prefix: string;
    defaultUrl?: string;
    defaultModel?: string;
    defaultTimeoutMs?: number;
    requireKey?: boolean | "when-remote";
    modelEnv?: string;
  },
): SystemOneEnvConfig {
  const urlKey = `${opts.prefix}_API_URL`;
  const keyKey = `${opts.prefix}_API_KEY`;
  const modelKey = opts.modelEnv ?? `${opts.prefix}_MODEL`;
  const timeoutKey = `${opts.prefix}_TIMEOUT_MS`;
  const apiUrl = env[urlKey] ?? opts.defaultUrl;
  if (!apiUrl) throw new Error(`Invalid ${urlKey}: set it to the model endpoint URL`);
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error(`Invalid ${urlKey}: not a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Invalid ${urlKey}: only http(s) endpoints are allowed`);
  }
  const warnings: string[] = [];
  if (url.protocol === "http:" && !isLocalhost(url.hostname)) {
    warnings.push(`${urlKey} uses plain HTTP for a non-localhost endpoint; prefer HTTPS`);
  }
  const remote = !isLocalhost(url.hostname);
  const requireKey = opts.requireKey === "when-remote" ? remote : (opts.requireKey ?? true);
  const apiKey = env[keyKey] ?? "";
  if (requireKey && !apiKey) {
    throw new Error(`${keyKey} is required for this endpoint`);
  }
  const timeoutMs = Number(env[timeoutKey] ?? opts.defaultTimeoutMs ?? 8000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid ${timeoutKey}: must be a positive number`);
  }
  return {
    mode: env[urlKey] !== undefined || opts.defaultUrl === undefined ? "custom" : "hosted",
    apiUrl,
    apiKey,
    model: env[modelKey] ?? opts.defaultModel,
    timeoutMs,
    warnings,
  };
}
