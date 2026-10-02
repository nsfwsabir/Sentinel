const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";
const ADMIN = "Basic " + Buffer.from(`${process.env.ADMIN_USER ?? "admin"}:${process.env.ADMIN_PASS ?? "admin"}`).toString("base64");

// Provider metadata is public (name/mode/warnings only — never secrets).
export async function GET() {
  const r = await fetch(`${API}/v1/provider/status`, { cache: "no-store" });
  return Response.json(await r.json(), { status: r.status });
}

// Test connection. Admin creds stay server-side; the API key never leaves it.
export async function POST() {
  const r = await fetch(`${API}/v1/provider/test`, {
    method: "POST",
    headers: { authorization: ADMIN },
  });
  return Response.json(await r.json(), { status: r.status });
}
