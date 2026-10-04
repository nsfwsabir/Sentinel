// Same-origin check for mutating dashboard proxies. The proxies hold
// server-side credentials and are cookie-authenticated when OIDC is on,
// so a forged cross-site POST must not reach them. Browsers always send
// Origin on POST; absence is allowed (curl/manual use, no ambient auth
// to abuse without the session cookie).
export function originMismatch(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(req.url).host;
  } catch {
    return true;
  }
}

export function originDenied() {
  return Response.json({ error: "cross-origin request refused" }, { status: 403 });
}
