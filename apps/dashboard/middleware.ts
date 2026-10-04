import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isOidcConfigured } from "./auth";

// Warn-only here (not a boot refusal): `next build` also runs as
// production and CI builds carry no secrets. The API hard-refuses
// dev defaults; the dashboard never holds keys itself.
if (
  process.env.NODE_ENV === "production" &&
  (process.env.SENTINEL_AGENT_KEY ?? "dev-key-1") === "dev-key-1"
) {
  console.error("sentinel dashboard: SENTINEL_AGENT_KEY is still the dev default");
}

// Route protection: when OIDC is configured, mutating routes require a
// signed-in session; otherwise the legacy basic-auth gate applies
// (dev mode). Edge-safe: no node: imports. API-level approval auth
// (scrypt) is unchanged and enforced by the API itself.
function basicAuthorized(req: NextRequest): boolean {
  const user = process.env.ADMIN_USER ?? "admin";
  const pass = process.env.ADMIN_PASS ?? "admin";
  const header = req.headers.get("authorization") ?? "";
  const expected = "Basic " + btoa(`${user}:${pass}`);
  return header === expected;
}

export async function middleware(req: NextRequest) {
  if (req.method === "GET") return NextResponse.next();
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  if (isOidcConfigured()) {
    const token = await getToken({ req });
    if (!token) {
      return new NextResponse("sign-in required", {
        status: 401,
        headers: { "www-authenticate": 'Bearer realm="sentinel"' },
      });
    }
    return NextResponse.next();
  }
  // Dev mode (no OIDC): browser-driven /api/* proxies stay open — the API
  // itself still enforces admin auth using server-side credentials.
  // Legacy basic gate keeps applying to non-GET /approvals navigations.
  if (isApi) return NextResponse.next();
  if (!basicAuthorized(req)) {
    return new NextResponse("auth required", {
      status: 401,
      headers: { "www-authenticate": 'Basic realm="sentinel"' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/approvals/:path*", "/api/approvals/:path*", "/api/policies/:path*"],
};
