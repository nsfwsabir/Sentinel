import { resolveLayaConfig } from "./config.js";
import { SystemOneJudgmentProvider, type SystemOneProviderOptions } from "./systemone.js";

export type LayaProviderOptions = SystemOneProviderOptions;

// Laya over HTTP — System-One wire (see ./systemone.ts).
// Kept as a named subclass so existing imports and the LAYA_* env
// contract keep working; new wire-compatibles use SystemOneJudgmentProvider
// directly via the registry. Kept server-side only.
export class LayaJudgmentProvider extends SystemOneJudgmentProvider {
  constructor(opts?: Partial<LayaProviderOptions> & { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> }) {
    // Validated config: hosted default, custom endpoint via LAYA_API_URL.
    // Sentinel never hosts Laya; explicit opts merge over env (process.env by default).
    const baseEnv = opts?.env ?? process.env;
    const cfg = resolveLayaConfig({
      ...baseEnv,
      ...(opts?.apiUrl !== undefined ? { LAYA_API_URL: opts.apiUrl } : {}),
      ...(opts?.apiKey !== undefined ? { LAYA_API_KEY: opts.apiKey } : {}),
      ...(opts?.model !== undefined ? { LAYA_MODEL: opts.model } : {}),
      ...(opts?.timeoutMs !== undefined ? { LAYA_TIMEOUT_MS: String(opts.timeoutMs) } : {}),
    });
    super("laya", {
      apiUrl: cfg.apiUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      timeoutMs: cfg.timeoutMs,
      fetchImpl: opts?.fetchImpl,
      mode: cfg.mode,
      warnings: cfg.warnings,
    });
  }
}
