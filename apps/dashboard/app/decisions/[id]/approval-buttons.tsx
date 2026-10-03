"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ApprovalButtons({ decisionId, status }: { decisionId: string; status?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (status === "approved" || status === "rejected") {
    return <p className="font-mono text-xs text-neutral-500">Decision {status}.</p>;
  }

  async function act(action: "approve" | "reject") {
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: decisionId, action }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setError((b as { error?: string }).error ?? "approval failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-[#b91c1c]">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => act("approve")}
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          Approve
        </button>
        <button
          onClick={() => act("reject")}
          disabled={busy}
          className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-60"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
