// Same-origin check for mutating dashboard proxies. The proxies hold
// server-side credentials and are cookie-authenticated when OIDC is on,
// so a forged cross-site POST must not reach them. Browsers always send
// Origin on POST; absence is allowed (curl/manual use, no ambient auth
// to abuse without the session cookie). X-Forwarded-Host is honored so the
// check survives tunnels/reverse proxies that rewrite Host: a CSRF attacker
// cannot forge Origin in a simple cross-site request, so requiring Origin
// to match either host keeps the protection intact.
export function originMismatch(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const from = new URL(origin).host;
    if (from === new URL(req.url).host) return false;
    const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    return forwarded ? from !== forwarded : true;
  } catch {
    return true;
  }
}

export function originDenied() {
  return Response.json({ error: "cross-origin request refused" }, { status: 403 });
}
