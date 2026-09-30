import { NextResponse, type NextRequest } from "next/server";

// Minimal basic-auth gate for approvals (and optionally whole dashboard).
// Edge-safe: no node: imports (ponytail: plain compare; timing-safe
// compare lives server-side in the API route where node:crypto exists).
function authorized(req: NextRequest): boolean {
  const user = process.env.ADMIN_USER ?? "admin";
  const pass = process.env.ADMIN_PASS ?? "admin";
  const header = req.headers.get("authorization") ?? "";
  const expected = "Basic " + btoa(`${user}:${pass}`);
  return header === expected;
}

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/approvals") && req.method !== "GET") {
    if (!authorized(req)) {
      return new NextResponse("auth required", {
        status: 401,
        headers: { "www-authenticate": 'Basic realm="sentinel"' },
      });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/approvals/:path*"] };
