"use client";

export function MetricCard({
  title,
  value,
  sub,
  tone = "neutral",
}: {
  title: string;
  value: any;
  sub?: string;
  tone?: "green" | "red" | "yellow" | "blue" | "neutral";
}) {
  const color =
    tone === "green"
      ? "text-emerald-400"
      : tone === "red"
      ? "text-red-300"
      : tone === "yellow"
      ? "text-yellow-300"
      : tone === "blue"
      ? "text-blue-300"
      : "text-white";

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b1626] p-5 shadow-xl shadow-black/20">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
        {title}
      </div>
      <div className={`mt-3 text-3xl font-black ${color}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-[#0e1b2d] p-6 shadow-2xl shadow-black/20">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Pill({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: "blue" | "green" | "red" | "yellow" | "gray";
}) {
  const cls =
    tone === "green"
      ? "border-emerald-700 bg-emerald-950/60 text-emerald-300"
      : tone === "red"
      ? "border-red-700 bg-red-950/60 text-red-300"
      : tone === "yellow"
      ? "border-yellow-700 bg-yellow-950/60 text-yellow-300"
      : tone === "gray"
      ? "border-slate-700 bg-slate-900 text-slate-300"
      : "border-blue-800 bg-blue-950/60 text-blue-300";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${cls}`}>
      {children}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/30 text-slate-500">
      {text}
    </div>
  );
}