import { Card, PageHeader, EmptyState } from "../components/ui";
import CreateToolForm from "./create-form";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

async function getTools() {
  try {
    const r = await fetch(`${API}/v1/tools`, { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as { id: string; name: string; description: string; riskLevel: string }[];
  } catch {
    return [];
  }
}

export default async function ToolsPage() {
  const tools = await getTools();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Tools" subtitle="What agents are allowed to invoke, and how risky each is." />
      {tools.length === 0 ? (
        <EmptyState title="No tools registered." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-neutral-500 dark:text-neutral-400">
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium dark:border-neutral-800">Tool</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium dark:border-neutral-800">Description</th>
                  <th className="border-b border-neutral-200 py-2 font-medium dark:border-neutral-800">Risk</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs dark:border-neutral-800">{t.name}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">{t.description}</td>
                    <td className="border-b border-neutral-100 py-2 font-mono text-xs dark:border-neutral-800">{t.riskLevel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <CreateToolForm />
    </div>
  );
}
