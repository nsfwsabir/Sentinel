const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";
const KEY = process.env.SENTINEL_AGENT_KEY ?? "dev-key-1";
const ADMIN = "Basic " + Buffer.from(`${process.env.ADMIN_USER ?? "admin"}:${process.env.ADMIN_PASS ?? "admin"}`).toString("base64");

export async function GET() {
  const r = await fetch(`${API}/v1/approvals`, { cache: "no-store" });
  return Response.json(await r.json(), { status: r.status });
}

// Body: { id, action: "approve" | "reject" }. Admin creds stay server-side.
export async function POST(req: Request) {
  const { id, action } = (await req.json()) as { id: string; action: string };
  if (!id || (action !== "approve" && action !== "reject")) {
    return Response.json({ error: "id + action approve|reject required" }, { status: 400 });
  }
  const r = await fetch(`${API}/v1/approvals/${id}/${action}`, {
    method: "POST",
    headers: { authorization: ADMIN },
  });
  return Response.json(await r.json(), { status: r.status });
}
