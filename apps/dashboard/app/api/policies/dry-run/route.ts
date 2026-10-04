import { getServerSession } from "next-auth";
import { authOptions, isOidcConfigured } from "../../../../auth";
import { originMismatch, originDenied } from "../../_lib";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";
const KEY = process.env.SENTINEL_AGENT_KEY ?? "dev-key-1";

export async function POST(req: Request) {
  if (originMismatch(req)) return originDenied();
  if (isOidcConfigured()) {
    const session = await getServerSession(authOptions);
    if (!session) return Response.json({ error: "sign-in required" }, { status: 401 });
  }
  const body = await req.json();
  const r = await fetch(`${API}/v1/policies/dry-run`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY },
    body: JSON.stringify(body),
  });
  return Response.json(await r.json(), { status: r.status });
}
