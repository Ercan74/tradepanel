import type { Tone } from "./types";

export function Panel({
  title,
  sub,
  children,
  live = true,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  live?: boolean;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl backdrop-blur">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          {sub && <p className="mt-1 text-sm text-slate-400">{sub}</p>}
        </div>

        {live && (
          <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300">
            LIVE
          </span>
        )}
      </div>

      {children}
    </section>
  );
}

export function Metric({
  title,
  value,
  tone = "neutral",
}: {
  title: string;
  value: string;
  tone?: Tone;
}) {
  const color =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
      ? "text-rose-300"
      : tone === "warn"
      ? "text-amber-300"
      : "text-white";

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl">
      <p className="text-sm text-slate-400">{title}</p>
      <div className={`mt-3 text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

export function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: Exclude<Tone, "neutral">;
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-400/10 text-emerald-300"
      : tone === "bad"
      ? "bg-rose-400/10 text-rose-300"
      : "bg-amber-400/10 text-amber-300";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${cls}`}>
      {children}
    </span>
  );
}

export function InfoBox({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const color =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
      ? "text-rose-300"
      : tone === "warn"
      ? "text-amber-300"
      : "text-white";

  return (
    <div className="rounded-2xl bg-black/30 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 font-bold ${color}`}>{value}</p>
    </div>
  );
}

export function MiniBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));

  return (
    <div>
      <div className="mb-1 text-xs text-slate-400">%{Math.round(v)}</div>
      <div className="h-2 w-24 rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-400 shadow-[0_0_16px_rgba(34,211,238,.55)]"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

export function RiskBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));

  return (
    <div className="rounded-2xl bg-black/30 p-4">
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        <span>%{Math.round(v)}</span>
      </div>

      <div className="h-3 rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-400 shadow-[0_0_16px_rgba(34,211,238,.55)]"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-500">
      {text}
    </div>
  );
}