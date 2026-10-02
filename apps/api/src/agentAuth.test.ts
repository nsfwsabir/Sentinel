import { describe, it, expect } from "vitest";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type KeyInput } from "jose";
import { authenticateAgent, type AgentAuthOptions } from "./agentAuth.js";

const ISS = "https://issuer.example.com";
const AUD = "sentinel";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const jwks = createLocalJWKSet({ keys: [{ ...jwk, kid: "k1" }] });
  const opts: AgentAuthOptions = {
    issuers: [ISS],
    audience: AUD,
    staticKeys: ["dev-key-1"],
    jwksFor: () => jwks,
  };
  const sign = (claims: Record<string, unknown>, over: { key?: KeyInput; iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(over.iss ?? ISS)
      .setAudience(over.aud ?? AUD)
      .setExpirationTime(over.exp ?? "5m")
      .sign(over.key ?? privateKey);
  return { opts, sign, privateKey };
}

const authz = (token: string) => ({ authorization: `Bearer ${token}` });

describe("agentAuth", () => {
  it("accepts legacy static keys without identity binding", async () => {
    const { opts } = await setup();
    expect(await authenticateAgent({ "x-api-key": "dev-key-1" }, opts)).toEqual({ kind: "static" });
  });

  it("binds a valid OIDC token sub to the agent", async () => {
    const { opts, sign } = await setup();
    const token = await sign({ sub: "research-agent" });
    expect(await authenticateAgent(authz(token), opts)).toEqual({
      kind: "oidc",
      agentId: "research-agent",
    });
  });

  it("rejects forged tokens", async () => {
    const { opts } = await setup();
    const { privateKey: other } = await generateKeyPair("RS256");
    // Sign with a key the JWKS does not know: same claims shape, unknown key.
    const forged = await new SignJWT({ sub: "a" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(ISS)
      .setAudience(AUD)
      .setExpirationTime("5m")
      .sign(other);
    await expect(authenticateAgent(authz(forged), opts)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects expired tokens and wrong audience", async () => {
    const { opts, sign } = await setup();
    const expired = await sign({ sub: "a" }, { exp: "-5m" });
    await expect(authenticateAgent(authz(expired), opts)).rejects.toMatchObject({ statusCode: 401 });
    const wrongAud = await sign({ sub: "a" }, { aud: "someone-else" });
    await expect(authenticateAgent(authz(wrongAud), opts)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects unknown issuers, missing credentials, and empty sub", async () => {
    const { opts, sign } = await setup();
    const alien = await sign({ sub: "a" }, { iss: "https://evil.example.com" });
    await expect(authenticateAgent(authz(alien), opts)).rejects.toMatchObject({ statusCode: 401 });
    await expect(authenticateAgent({}, opts)).rejects.toMatchObject({ statusCode: 401 });
    const noSub = await sign({});
    await expect(authenticateAgent(authz(noSub), opts)).rejects.toMatchObject({ statusCode: 401 });
  });
});
