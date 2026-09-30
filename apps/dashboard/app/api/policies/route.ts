const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";
const KEY = process.env.SENTINEL_AGENT_KEY ?? "dev-key-1";

export async function GET() {
  const r = await fetch(`${API}/v1/policies`, { cache: "no-store" });
  return Response.json(await r.json(), { status: r.status });
}

export async function POST(req: Request) {
  const body = await req.json();
  const r = await fetch(`${API}/v1/policies`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY },
    body: JSON.stringify(body),
  });
  return Response.json(await r.json(), { status: r.status });
}
