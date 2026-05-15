import type { Trade } from "./types"
import { pnlColor } from "./helpers"

export default function ExecutionDesk({
  trades,
}: {
  trades: Trade[]
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-4xl font-bold">
            Execution Desk
          </div>

          <div className="text-slate-400">
            Canlı açık pozisyonlar
          </div>
        </div>

        <div className="rounded-full bg-cyan-500/20 px-4 py-1 text-cyan-300">
          LIVE
        </div>
      </div>

      <table className="w-full">
        <thead className="text-left text-sm text-slate-500">
          <tr>
            <th>SYMBOL</th>
            <th>SIDE</th>
            <th>STRATEGY</th>
            <th>PRICE</th>
            <th>CONFIDENCE</th>
            <th>PNL</th>
          </tr>
        </thead>

        <tbody>
          {trades.map((trade) => (
            <tr
              key={trade.symbol}
              className="border-t border-white/5"
            >
              <td className="py-5 text-xl font-bold">
                {trade.symbol}
              </td>

              <td>
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm text-emerald-400">
                  {trade.side}
                </span>
              </td>

              <td>{trade.strategy}</td>

              <td>{trade.entry}</td>

              <td>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-24 rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-cyan-400"
                      style={{
                        width: `${trade.confidence}%`,
                      }}
                    />
                  </div>

                  <span>%{trade.confidence}</span>
                </div>
              </td>

              <td className={pnlColor(trade.pnl)}>
                {trade.pnl} ₺
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}