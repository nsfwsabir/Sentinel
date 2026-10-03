const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await fetch(`${API}/v1/policies/${id}/versions`, { cache: "no-store" });
  return Response.json(await r.json(), { status: r.status });
}
