"use client";
import { useEffect, useState } from "react";

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
      <h1>Pending approval</h1>
      {error && <p>{error}</p>}
      {items.length === 0 ? <p className="muted">No pending approvals.</p> : (
        <table><thead><tr><th>Decision</th><th>Reason</th><th>Status</th><th></th></tr></thead>
        <tbody>{items.map((d) => (
          <tr key={d.id}>
            <td className="mono"><a href={`/decisions/${d.id}`}>{d.id}</a></td>
            <td className="muted">{d.reason}</td>
            <td className="mono">{d.approvalStatus ?? "pending"}</td>
            <td>
              <button onClick={() => act(d.id, "approve")}>Approve</button>{" "}
              <button className="secondary" onClick={() => act(d.id, "reject")}>Reject</button>
            </td>
          </tr>
        ))}</tbody></table>
      )}
    </div>
  );
}
