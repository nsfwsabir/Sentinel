"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "../components/ui";

const inputCls = "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-normal text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none";

export default function CreateAgentForm() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setError("");
    const r = await fetch("/api/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: id.trim(), name: name.trim(), description: description.trim() || undefined, status: "active" }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setError((b as { error?: string }).error ?? "save failed");
      return;
    }
    setId("");
    setName("");
    setDescription("");
    router.refresh();
  }

  return (
    <Card title="Register agent">
      <div className="grid max-w-xl gap-3">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-[#b91c1c]">{error}</p>}
        <label className="grid gap-1.5 text-sm font-medium text-neutral-900">
          ID
          <input className={`${inputCls} font-mono text-xs`} value={id} onChange={(e) => setId(e.target.value)} placeholder="research-agent" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-neutral-900">
          Name
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Research Agent" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-neutral-900">
          Description
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this agent does" />
        </label>
        <div>
          <button onClick={save} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700">
            Register agent
          </button>
        </div>
      </div>
    </Card>
  );
}
