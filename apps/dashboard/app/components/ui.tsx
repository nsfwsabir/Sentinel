import type { ReactNode } from "react";

export function Card({ title, subtitle, action, children, className = "" }: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-neutral-200 bg-white ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-3.5">
          <div>
            {title && <h2 className="text-[15px] font-bold tracking-tight text-ink">{title}</h2>}
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
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-bold leading-none tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const STAMP_TONES: Record<string, string> = {
  allow: "border-allow/60 text-allow",
  review: "border-review/60 text-review",
  block: "border-block/70 text-block",
};

// Verdict stamp: square rubber-stamp voice. Caps here are the subject's
// vernacular (a stamp reads ALLOW), not a label treatment.
export function StatusPill({ value }: { value: string }) {
  const tone = STAMP_TONES[value.toLowerCase()] ?? "border-neutral-300 text-neutral-500";
  return (
    <span className={`inline-block rounded-[3px] border-2 px-1.5 py-px font-mono text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
      {value}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-5 py-10 text-center">
      <p className="text-sm font-bold tracking-tight text-ink">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-[13px] text-neutral-500">{body}</p>}
    </div>
  );
}
