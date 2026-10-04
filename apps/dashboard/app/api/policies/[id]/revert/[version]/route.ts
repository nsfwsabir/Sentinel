import { getServerSession } from "next-auth";
import { authOptions, isOidcConfigured } from "../../../../../../auth";
import { originMismatch, originDenied } from "../../../../_lib";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";
const KEY = process.env.SENTINEL_AGENT_KEY ?? "dev-key-1";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  if (originMismatch(req)) return originDenied();
  if (isOidcConfigured()) {
    const session = await getServerSession(authOptions);
    if (!session) return Response.json({ error: "sign-in required" }, { status: 401 });
  }
  const { id, version } = await params;
  const r = await fetch(`${API}/v1/policies/${id}/revert/${version}`, {
    method: "POST",
    headers: { "x-api-key": KEY },
  });
  return Response.json(await r.json(), { status: r.status });
}
