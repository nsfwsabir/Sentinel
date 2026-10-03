const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

export async function GET() {
  const r = await fetch(`${API}/v1/decisions?limit=200`, { cache: "no-store" });
  return Response.json(await r.json(), { status: r.status });
}
