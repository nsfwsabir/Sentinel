import ProviderTest from "./provider-test";
import { Card, PageHeader } from "../components/ui";

const API = process.env.SENTINEL_API_URL ?? "http://localhost:3001";

async function getProviderStatus(): Promise<{ provider: string; mode?: string; warnings?: string[] }> {
  try {
    const r = await fetch(`${API}/v1/provider/status`, { cache: "no-store" });
    if (!r.ok) return { provider: "unknown" };
    return (await r.json()) as { provider: string; mode?: string; warnings?: string[] };
  } catch {
    return { provider: "unknown" };
  }
}

export default async function SettingsPage() {
  const status = await getProviderStatus();
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Settings" subtitle="Connection, thresholds, and provider configuration." />
      <Card title="Connection">
        <div className="flex flex-col gap-1.5 text-sm">
          <p>API: <span className="font-mono text-[13px]">{process.env.SENTINEL_API_URL ?? "http://localhost:3001"}</span></p>
          <p className="text-neutral-500 dark:text-neutral-400">Thresholds: high 0.90 · review below 0.80 (configurable via API env).</p>
          <p className="text-neutral-500 dark:text-neutral-400">Approvals require admin basic auth. Judgment provider key stays server-side.</p>
        </div>
      </Card>
      <Card title="Judgment provider">
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Provider: <span className="font-mono text-[13px]">{status.provider}</span>
            {status.mode && <> · Mode: <span className="font-mono text-[13px]">{status.mode}</span></>}
          </p>
          <p className="text-neutral-500 dark:text-neutral-400">Mock, Laya, OpenAI Decisions, Microsoft Decision-1, Jev, or a custom model via JUDGMENT_PROVIDER. Sentinel never hosts models; keys stay server-side.</p>
          {(status.warnings ?? []).map((w) => (
            <p key={w} className="text-neutral-500 dark:text-neutral-400">{w}</p>
          ))}
          <div className="mt-1">
            <ProviderTest />
          </div>
        </div>
      </Card>
    </div>
  );
}
