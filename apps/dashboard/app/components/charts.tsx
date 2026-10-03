// Zero-dependency SVG charts. Flat fills only (DESIGN.md: no gradients).

export function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  const w = 120;
  const h = 32;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`);
  return (
    <svg width={w} height={h} role="img" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function AreaChart({ series }: { series: { allow: number[]; review: number[]; block: number[] } }) {
  const w = 560;
  const h = 180;
  const pad = 8;
  const n = series.allow.length;
  const totals = series.allow.map((_, i) => series.allow[i] + series.review[i] + series.block[i]);
  const max = Math.max(1, ...totals);
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const layers = [
    { fill: "#15803d", opacity: 0.75, pick: (i: number) => series.allow[i] },
    { fill: "#b45309", opacity: 0.75, pick: (i: number) => series.review[i] },
    { fill: "#b91c1c", opacity: 0.8, pick: (i: number) => series.block[i] },
  ];
  // Stack bottom-up: allow at base, then review, then block.
  let acc: number[] = new Array(n).fill(0);
  const polys = layers.map((l) => {
    const upper = acc.map((a, i) => a + l.pick(i));
    const pts = [...upper.map((v, i) => `${x(i)},${y(v)}`), ...[...acc].reverse().map((v, i) => `${x(n - 1 - i)},${y(v)}`)];
    acc = upper;
    return { ...l, pts: pts.join(" ") };
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Decisions over the last 24 hours">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad} x2={w - pad} y1={h * f} y2={h * f} stroke="#e5e7eb" strokeWidth="1" />
      ))}
      {polys.map((p, i) => (
        <polygon key={i} points={p.pts} fill={p.fill} opacity={p.opacity} />
      ))}
    </svg>
  );
}

export function Donut({ allow, review, block }: { allow: number; review: number; block: number }) {
  const total = Math.max(1, allow + review + block);
  const segs = [
    { v: allow, color: "#15803d" },
    { v: review, color: "#b45309" },
    { v: block, color: "#b91c1c" },
  ];
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Decision mix">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#f0f0f0" strokeWidth="16" />
        {segs.map((s, i) => {
          const frac = s.v / total;
          const el = (
            <circle
              key={i}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeDasharray={`${frac * C} ${C}`}
              strokeDashoffset={-offset * C}
              strokeLinecap="butt"
              transform="rotate(-90 70 70)"
            />
          );
          offset += frac;
          return el;
        })}
        <text x="70" y="70" textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight="600" fill="#111">
          {allow + review + block}
        </text>
      </svg>
      <ul className="space-y-2 text-[13px]">
        <li className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#15803d]" />Allowed · {allow}</li>
        <li className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#b45309]" />Review · {review}</li>
        <li className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#b91c1c]" />Blocked · {block}</li>
      </ul>
    </div>
  );
}
