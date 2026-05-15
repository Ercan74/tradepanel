import type { Trade } from "./types"

export default function Sidebar({
  trades,
}: {
  trades: Trade[]
}) {
  return (
    <aside className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-5">
        <div className="text-3xl font-bold">
          TradePanel
        </div>

        <div className="text-cyan-300">
          Institutional v7
        </div>

        <div className="mt-5 rounded-2xl bg-black/30 p-4">
          <div className="flex justify-between text-sm text-slate-400">
            <span>ENGINE</span>
            <span className="text-emerald-400">LIVE</span>
          </div>

          <div className="mt-4 text-4xl font-bold text-emerald-400">
            BORSA PY
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-5">
        <div className="mb-4 text-2xl font-bold">
          Watchlist Intelligence
        </div>

        <div className="space-y-3">
          {trades.map((trade, i) => (
            <div
              key={i}
              className="rounded-2xl bg-black/30 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold">
                    {trade.symbol}
                  </div>

                  <div className="text-sm text-slate-400">
                    {trade.strategy}
                  </div>
                </div>

                <div className="rounded-full bg-rose-500/20 px-3 py-1 text-sm text-rose-300">
                  SHORT
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}