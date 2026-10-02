import type { NextAuthOptions } from "next-auth";

// BYO OIDC issuer for dashboard sign-in (Google, Entra, Keycloak, ...).
// Only configured when AUTH_OIDC_* env is present; otherwise the dashboard
// runs without login (dev mode) and route protection falls back to the
// basic-auth gate in middleware.ts.
export function isOidcConfigured(): boolean {
  return Boolean(
    process.env.AUTH_OIDC_ISSUER && process.env.AUTH_OIDC_CLIENT_ID && process.env.AUTH_OIDC_CLIENT_SECRET,
  );
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: isOidcConfigured()
    ? [
        {
          id: "oidc",
          name: "SSO",
          type: "oauth",
          wellKnown: `${process.env.AUTH_OIDC_ISSUER}/.well-known/openid-configuration`,
          clientId: process.env.AUTH_OIDC_CLIENT_ID,
          clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET,
          authorization: { params: { scope: "openid email profile" } },
          idToken: true,
          checks: ["pkce", "state"],
          profile(profile: { sub: string; email?: string; name?: string }) {
            return { id: profile.sub, email: profile.email, name: profile.name };
          },
        },
      ]
    : [],
};
