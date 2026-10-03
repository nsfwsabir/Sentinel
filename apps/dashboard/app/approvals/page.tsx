"use client";
import { useEffect, useState } from "react";
import { Card, PageHeader, EmptyState } from "../components/ui";

type Item = { id: string; reason: string; approvalStatus?: string };

export default function ApprovalsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const r = await fetch("/api/approvals", { cache: "no-store" });
    setItems(await r.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function act(id: string, action: "approve" | "reject") {
    setError("");
    const r = await fetch("/api/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setError((b as { error?: string }).error ?? "approval failed");
      return;
    }
    await load();
  }

  return (
    <div>
      <PageHeader title="Pending approval" subtitle="Review decisions awaiting a human." />
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-[#b91c1c]">{error}</p>
      )}
      {items.length === 0 ? (
        <EmptyState title="No pending approvals." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Decision</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Reason</th>
                  <th className="border-b border-neutral-200 py-2 pr-3 font-medium">Status</th>
                  <th className="border-b border-neutral-200 py-2 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="hover:bg-neutral-50">
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">
                      <a className="underline decoration-neutral-300 underline-offset-2" href={`/decisions/${d.id}`}>{d.id}</a>
                    </td>
                    <td className="border-b border-neutral-100 py-2 pr-3 text-neutral-600">{d.reason}</td>
                    <td className="border-b border-neutral-100 py-2 pr-3 font-mono text-xs">{d.approvalStatus ?? "pending"}</td>
                    <td className="border-b border-neutral-100 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => act(d.id, "approve")}
                          className="rounded-md bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => act(d.id, "reject")}
                          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-900 hover:bg-neutral-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
