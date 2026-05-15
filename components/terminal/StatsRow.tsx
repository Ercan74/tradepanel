import { pnlColor } from "./helpers"

export default function StatsRow() {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
      <Card title="Open PnL" value="-0,07 ₺" negative />
      <Card title="Total PnL" value="-599,96 ₺" negative />
      <Card title="Open Positions" value="1" />
      <Card title="Long / Short" value="1 / 0" />
      <Card title="Win Rate" value="%8" />
      <Card title="Exposure" value="%20" />
    </div>
  )
}

function Card({
  title,
  value,
  negative,
}: {
  title: string
  value: string
  negative?: boolean
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-5">
      <div className="text-sm text-slate-400">{title}</div>

      <div
        className={`mt-3 text-3xl font-bold ${
          negative ? pnlColor(-1) : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  )
}