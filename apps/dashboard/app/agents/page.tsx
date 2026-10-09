import { Card, PageHeader, EmptyState } from "../components/ui";
import CreateAgentForm from "./create-form";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

async function getJSON<T>(path: string): Promise<T[]> {
  try {
    const r = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as T[];
  } catch {
    return [];
  }
}

type Agent = { id: string; name: string; status: string; description?: string };

export default async function AgentsPage() {
  const agents = await getJSON<Agent>("/v1/agents");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Agents" subtitle="Registered agents and their standing." />
      {agents.length === 0 ? (
        <EmptyState title="No agents registered." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-neutral-500 dark:text-neutral-400">
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium dark:border-neutral-800">Agent</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium dark:border-neutral-800">ID</th>
                  <th className="border-b border-neutral-200 py-2 font-medium dark:border-neutral-800">Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <td className="border-b border-neutral-100 py-2 pr-3 font-medium text-neutral-900 dark:border-neutral-800 dark:text-neutral-100">
                      <a className="underline decoration-neutral-300 underline-offset-2 dark:decoration-neutral-600" href={`/agents/${a.id}`}>{a.name}</a>
                    </td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs dark:border-neutral-800">{a.id}</td>
                    <td className="border-b border-neutral-100 py-2 font-mono text-xs dark:border-neutral-800">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <CreateAgentForm />
    </div>
  );
}
