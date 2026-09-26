export async function POST(req: Request) {
  const api = process.env.SENTINEL_API_URL ?? "http://localhost:3001";
  const body = await req.json();
  // Server-side only: agent key never exposed toyx browser bundle beyond this route.
  const r = await fetch(`${api}/v1/actions/evaluate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.SENTINEL_AGENT_KEY ?? "dev-key-1",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  return Response.json(data, { status: r.status });
}
