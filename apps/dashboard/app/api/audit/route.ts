const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";
const ADMIN = "Basic " + Buffer.from(`${process.env.ADMIN_USER ?? "admin"}:${process.env.ADMIN_PASS ?? "admin"}`).toString("base64");

export async function GET() {
  const r = await fetch(`${API}/v1/audit/verify`, {
    cache: "no-store",
    headers: { authorization: ADMIN },
  });
  return Response.json(await r.json(), { status: r.status });
}
