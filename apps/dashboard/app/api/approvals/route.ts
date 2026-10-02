import { getServerSession } from "next-auth";
import { authOptions, isOidcConfigured } from "../../../auth";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";
const KEY = process.env.SENTINEL_AGENT_KEY ?? "dev-key-1";
const ADMIN = "Basic " + Buffer.from(`${process.env.ADMIN_USER ?? "admin"}:${process.env.ADMIN_PASS ?? "admin"}`).toString("base64");

async function requireSession() {
  if (!isOidcConfigured()) return;
  const session = await getServerSession(authOptions);
  if (!session) {
    throw Object.assign(new Error("sign-in required"), { statusCode: 401 });
  }
}

export async function GET() {
  const r = await fetch(`${API}/v1/approvals`, { cache: "no-store" });
  return Response.json(await r.json(), { status: r.status });
}

// Body: { id, action: "approve" | "reject" }. Admin creds stay server-side.
export async function POST(req: Request) {
  try {
    await requireSession();
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 401;
    return Response.json({ error: (err as Error).message }, { status });
  }
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
