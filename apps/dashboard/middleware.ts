import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

// Minimal basic-auth gate for approvals (and optionally whole dashboard).
// Uses stdlib timingSafeEqual — no custom crypto.
function authorized(req: NextRequest): boolean {
  const user = process.env.ADMIN_USER ?? "admin";
  const pass = process.env.ADMIN_PASS ?? "admin";
  const header = req.headers.get("authorization") ?? "";
  const expected = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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
