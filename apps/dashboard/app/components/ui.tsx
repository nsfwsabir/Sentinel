import type { ReactNode } from "react";

export function Card({ title, subtitle, action, children, className = "" }: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-neutral-200 bg-white ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-neutral-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const PILL_TONES: Record<string, string> = {
  allow: "border-allow/40 bg-green-50 text-allow",
  review: "border-review/40 bg-amber-50 text-review",
  block: "border-block/40 bg-red-50 text-block",
};

export function StatusPill({ value }: { value: string }) {
  const tone = PILL_TONES[value.toLowerCase()] ?? "border-neutral-200 bg-neutral-100 text-neutral-600";
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${tone}`}>
      {value}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-5 py-10 text-center">
      <p className="text-sm font-medium text-neutral-900">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-[13px] text-neutral-500">{body}</p>}
    </div>
  );
}
