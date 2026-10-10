import { describe, it, expect } from "vitest";
import { resolveLayaConfig, HOSTED_API_URL, resolveSystemOneEnvConfig } from "./config.js";

describe("laya config", () => {
  it("defaults to hosted with the official endpoint", () => {
    const cfg = resolveLayaConfig({ LAYA_API_KEY: "k" });
    expect(cfg.mode).toBe("hosted");
    expect(cfg.apiUrl).toBe(HOSTED_API_URL);
    expect(cfg.warnings).toEqual([]);
  });

  it("treats an explicit URL as custom endpoint", () => {
    const cfg = resolveLayaConfig({
      LAYA_API_URL: "https://laya.internal.example.com/v1/systemone",
      LAYA_API_KEY: "k",
    });
    expect(cfg.mode).toBe("custom");
  });

  it("honors explicit LAYA_MODE", () => {
    expect(resolveLayaConfig({ LAYA_MODE: "custom", LAYA_API_URL: "http://localhost:8000/v1/systemone" }).mode).toBe("custom");
    expect(() => resolveLayaConfig({ LAYA_MODE: "weird", LAYA_API_KEY: "k" })).toThrow(/LAYA_MODE/);
  });

  it("rejects non-http(s) protocols and malformed URLs", () => {
    expect(() => resolveLayaConfig({ LAYA_API_URL: "ftp://x/y", LAYA_API_KEY: "k" })).toThrow(/http/);
    expect(() => resolveLayaConfig({ LAYA_API_URL: "not a url", LAYA_API_KEY: "k" })).toThrow(/valid URL/);
    expect(() => resolveLayaConfig({ LAYA_API_URL: "file:///etc/passwd", LAYA_API_KEY: "k" })).toThrow(/http/);
  });

  it("requires a key in hosted mode, not for custom endpoints", () => {
    expect(() => resolveLayaConfig({})).toThrow(/LAYA_API_KEY/);
    const custom = resolveLayaConfig({ LAYA_API_URL: "http://localhost:8000/v1/systemone" });
    expect(custom.apiKey).toBe("");
  });

  it("warns on plain HTTP remote, not on localhost", () => {
    const remote = resolveLayaConfig({ LAYA_API_URL: "http://laya.internal.example.com/x", LAYA_API_KEY: "k" });
    expect(remote.warnings.length).toBeGreaterThan(0);
    const local = resolveLayaConfig({ LAYA_API_URL: "http://localhost:8000/v1/systemone" });
    expect(local.warnings).toEqual([]);
  });

  it("rejects invalid timeouts and never leaks the key in errors", () => {
    expect(() => resolveLayaConfig({ LAYA_API_KEY: "k", LAYA_TIMEOUT_MS: "nope" })).toThrow(/TIMEOUT/);
    try {
      resolveLayaConfig({ LAYA_API_URL: "ftp://x", LAYA_API_KEY: "super-secret-key" });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).not.toContain("super-secret-key");
    }
  });
});

describe("generic system-one env config", () => {
  it("resolves prefixed env with defaults", () => {
    const cfg = resolveSystemOneEnvConfig(
      { MS_DECISION_API_KEY: "k" },
      { prefix: "MS_DECISION", defaultUrl: "https://example.com/d", defaultModel: "m" },
    );
    expect(cfg).toMatchObject({ mode: "hosted", apiUrl: "https://example.com/d", model: "m" });
  });

  it("requires a key unless remote-optional on localhost", () => {
    expect(() =>
      resolveSystemOneEnvConfig({ JEV_API_URL: "https://jev.example.com/x" }, { prefix: "JEV", requireKey: "when-remote" }),
    ).toThrow(/JEV_API_KEY/);
    const local = resolveSystemOneEnvConfig(
      { JEV_API_URL: "http://localhost:8000/x" },
      { prefix: "JEV", requireKey: "when-remote" },
    );
    expect(local.apiKey).toBe("");
    expect(local.mode).toBe("custom");
  });

  it("rejects bad URLs without leaking keys", () => {
    try {
      resolveSystemOneEnvConfig({ X_API_URL: "ftp://x", X_API_KEY: "super-secret" }, { prefix: "X" });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).toContain("X_API_URL");
      expect(String(err)).not.toContain("super-secret");
    }
  });
});
