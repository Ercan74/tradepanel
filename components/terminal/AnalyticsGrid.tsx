export default function AnalyticsGrid() {
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-3">
      <AnalyticsCard
        title="Performance Analytics"
        items={[
          "Best Trade: +842₺",
          "Worst Trade: -310₺",
          "Avg RR: 2.1",
          "Win Rate: %61",
        ]}
      />

      <AnalyticsCard
        title="Strategy Intelligence"
        items={[
          "EMA100 CORE: +1820₺",
          "REVERSAL: -220₺",
          "TREND FOLLOW: +640₺",
          "SCALP: +91₺",
        ]}
      />

      <AnalyticsCard
        title="Symbol PnL Ranking"
        items={[
          "ASELS +920₺",
          "THYAO +610₺",
          "EKGYO +420₺",
          "SASA -180₺",
        ]}
      />
    </div>
  )
}

function AnalyticsCard({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-5">
      <div className="mb-5 flex items-center justify-between">
        <div className="text-2xl font-bold">{title}</div>

        <div className="rounded-full bg-cyan-500/20 px-3 py-1 text-sm text-cyan-300">
          LIVE
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-2xl bg-black/30 px-4 py-3"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}