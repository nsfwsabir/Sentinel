import Link from "next/link";
import { Card } from "../../components/ui";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

export default async function AgentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let agent: { id: string; name: string; status: string; description?: string; recentActions?: { id: string; toolId: string }[] } | null = null;
  try {
    const r = await fetch(`${API}/v1/agents/${id}`, { cache: "no-store" });
    if (r.ok) agent = await r.json();
  } catch {
    agent = null;
  }
  if (!agent) {
    return (
      <div>
        <Link href="/agents" className="text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">← Agents</Link>
        <p className="mt-4">Not found.</p>
      </div>
    );
  }
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <Link href="/agents" className="text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">← Agents</Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">{agent.name}</h1>
        <p className="mt-1 font-mono text-xs text-neutral-500 dark:text-neutral-400">{agent.id} · {agent.status}</p>
        {agent.description && <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{agent.description}</p>}
      </div>
      <Card title="Recent activity">
        {(agent.recentActions ?? []).length === 0 ? (
          <p className="text-[13px] text-neutral-500 dark:text-neutral-400">No actions yet.</p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-neutral-500 dark:text-neutral-400">
                <th className="border-b border-neutral-200 py-2 pr-3 font-medium dark:border-neutral-800">Action</th>
                <th className="border-b border-neutral-200 py-2 font-medium dark:border-neutral-800">Tool</th>
              </tr>
            </thead>
            <tbody>
              {agent.recentActions!.map((a) => (
                <tr key={a.id}>
                  <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs dark:border-neutral-800">{a.id}</td>
                  <td className="border-b border-neutral-100 py-2 font-mono text-xs dark:border-neutral-800">{a.toolId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
