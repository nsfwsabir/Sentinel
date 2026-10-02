import { getServerSession } from "next-auth";
import { authOptions, isOidcConfigured } from "../../../auth";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";
const KEY = process.env.SENTINEL_AGENT_KEY ?? "dev-key-1";

async function guard() {
  if (!isOidcConfigured()) return null;
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "sign-in required" }, { status: 401 });
  return null;
}

export async function GET() {
  const r = await fetch(`${API}/v1/policies`, { cache: "no-store" });
  return Response.json(await r.json(), { status: r.status });
}

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = await req.json();
  const r = await fetch(`${API}/v1/policies`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY },
    body: JSON.stringify(body),
  });
  return Response.json(await r.json(), { status: r.status });
}

export async function PATCH(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const { id, ...patch } = (await req.json()) as { id: string } & Record<string, unknown>;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const r = await fetch(`${API}/v1/policies/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-api-key": KEY },
    body: JSON.stringify(patch),
  });
  return Response.json(await r.json(), { status: r.status });
}
