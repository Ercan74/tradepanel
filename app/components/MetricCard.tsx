export default function MetricCard({
  title,
  value,
  sub,
  tone = "neutral",
}: {
  title: string;
  value: string | number;
  sub?: string;
  tone?: "green" | "red" | "yellow" | "blue" | "neutral";
}) {
  const color =
    tone === "green"
      ? "text-emerald-300"
      : tone === "red"
      ? "text-red-300"
      : tone === "yellow"
      ? "text-yellow-300"
      : tone === "blue"
      ? "text-blue-300"
      : "text-white";

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b1626] p-5 shadow-xl shadow-black/10">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</div>
      <div className={`mt-3 text-3xl font-black ${color}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}