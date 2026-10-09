"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "../components/ui";

const inputCls = "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-normal text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-500";

export default function CreateToolForm() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [description, setDescription] = useState("");
  const [riskLevel, setRiskLevel] = useState("low");
  const [error, setError] = useState("");

  async function save() {
    setError("");
    const r = await fetch("/api/tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: id.trim(), name: id.trim(), description: description.trim(), riskLevel }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setError((b as { error?: string }).error ?? "save failed");
      return;
    }
    setId("");
    setDescription("");
    router.refresh();
  }

  return (
    <Card title="Register tool">
      <div className="grid max-w-xl gap-3">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-[#b91c1c] dark:border-red-900 dark:bg-red-950 dark:text-red-400">{error}</p>}
        <label className="grid gap-1.5 text-sm font-medium text-neutral-900 dark:text-neutral-100">
          ID / name
          <input className={`${inputCls} font-mono text-xs`} value={id} onChange={(e) => setId(e.target.value)} placeholder="send_email" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Description
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this tool does" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Risk level
          <select className={inputCls} value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <div>
          <button onClick={save} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-ink dark:hover:bg-white">
            Register tool
          </button>
        </div>
      </div>
    </Card>
  );
}
