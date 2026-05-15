export default function Topbar() {
  return (
    <div className="mb-5 flex flex-wrap gap-3 rounded-3xl border border-cyan-500/10 bg-[#071018] px-5 py-4">
      <BarItem label="BIST100" value="+1.42%" positive />
      <BarItem label="BANKS" value="+2.08%" positive />
      <BarItem label="INDUSTRIAL" value="-0.36%" />
      <BarItem label="USDTRY" value="32.21" neutral />
      <BarItem label="VOL" value="NORMAL" neutral />
      <BarItem label="REGIME" value="RISK-ON" positive />
    </div>
  )
}

function BarItem({
  label,
  value,
  positive,
  neutral,
}: {
  label: string
  value: string
  positive?: boolean
  neutral?: boolean
}) {
  return (
    <div className="rounded-2xl bg-black/40 px-4 py-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-400">{label}</span>

        <span
          className={
            neutral
              ? "text-white"
              : positive
              ? "text-emerald-400"
              : "text-rose-400"
          }
        >
          {value}
        </span>
      </div>
    </div>
  )
}