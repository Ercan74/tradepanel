export default function StatusBadge({ value }: { value?: string }) {
  const v = value || "-";
  const cls =
    v.includes("OPEN")
      ? "bg-emerald-500/15 text-emerald-300"
      : v.includes("CLOSED")
      ? "bg-slate-500/20 text-slate-300"
      : v.includes("REJECTED")
      ? "bg-red-500/15 text-red-300"
      : v.includes("TP")
      ? "bg-cyan-500/15 text-cyan-300"
      : "bg-blue-500/15 text-blue-300";

  return <span className={`rounded-full px-3 py-1 text-xs font-black ${cls}`}>{v}</span>;
}