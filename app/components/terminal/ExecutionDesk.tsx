import type { Trade } from "./types";
import { Badge, Empty, MiniBar, Panel } from "./Panel";
import { money, shortTime } from "./helpers";

export default function ExecutionDesk({
  loading,
  trades,
}: {
  loading: boolean;
  trades: Trade[];
}) {
  return (
    <Panel
      title="Execution Desk"
      sub="Canlı açık pozisyonlar, risk, confidence ve PnL"
    >
      {loading ? (
        <Empty text="Veriler yükleniyor..." />
      ) : trades.length === 0 ? (
        <Empty text="Açık pozisyon bulunamadı." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-500">
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Side</th>
                <th className="px-4 py-3">Strategy</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stop</th>
                <th className="px-4 py-3">TP</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">PnL</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>

            <tbody>
              {trades.map((t) => (
                <tr
                  key={t.id}
                  className="bg-white/[0.035] transition hover:bg-white/[0.07]"
                >
                  <td className="rounded-l-2xl px-4 py-4 font-bold">
                    {t.symbol}
                  </td>

                  <td className="px-4 py-4">
                    <Badge tone={t.side === "LONG" ? "good" : "bad"}>
                      {t.side}
                    </Badge>
                  </td>

                  <td className="px-4 py-4 text-slate-300">{t.strategy}</td>
                  <td className="px-4 py-4">{money(t.price)}</td>
                  <td className="px-4 py-4 text-slate-400">
                    {t.stopLoss ? money(t.stopLoss) : "-"}
                  </td>
                  <td className="px-4 py-4 text-slate-400">
                    {t.takeProfit ? money(t.takeProfit) : "-"}
                  </td>

                  <td className="px-4 py-4">
                    <MiniBar value={t.confidence} />
                  </td>

                  <td
                    className={
                      t.pnl >= 0
                        ? "px-4 py-4 font-bold text-emerald-300"
                        : "px-4 py-4 font-bold text-rose-300"
                    }
                  >
                    {money(t.pnl)} ₺
                  </td>

                  <td className="rounded-r-2xl px-4 py-4 text-slate-400">
                    {shortTime(t.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}