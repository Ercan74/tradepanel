import type { Trade } from "./types";
import { groupByPnl, money } from "./helpers";
import { InfoBox, Panel } from "./Panel";

export default function AnalyticsGrid({ trades }: { trades: Trade[] }) {
  const winners = trades.filter((t) => t.pnl > 0).length;
  const losers = trades.filter((t) => t.pnl < 0).length;
  const bySymbol = groupByPnl(trades, "symbol");
  const byStrategy = groupByPnl(trades, "strategy");

  return (
    <section className="grid grid-cols-1 gap-5 2xl:grid-cols-3">
      <Panel title="Performance Analytics" sub="Genel kârlılık, kazanan/kaybeden">
        <div className="grid grid-cols-2 gap-3">
          <InfoBox label="Winning Trades" value={String(winners)} tone="good" />
          <InfoBox label="Losing Trades" value={String(losers)} tone="bad" />
          <InfoBox
            label="Best Symbol"
            value={bySymbol[0] ? `${bySymbol[0].name} ${money(bySymbol[0].pnl)}₺` : "-"}
            tone="good"
          />
          <InfoBox
            label="Worst Symbol"
            value={
              bySymbol.length
                ? `${bySymbol[bySymbol.length - 1].name} ${money(bySymbol[bySymbol.length - 1].pnl)}₺`
                : "-"
            }
            tone="bad"
          />
        </div>
      </Panel>

      <Panel title="Strategy Intelligence" sub="Strateji bazlı PnL dağılımı">
        <RankList rows={byStrategy.slice(0, 5)} />
      </Panel>

      <Panel title="Symbol PnL Ranking" sub="Hisse bazlı toplam performans">
        <RankList rows={bySymbol.slice(0, 5)} />
      </Panel>
    </section>
  );
}

function RankList({ rows }: { rows: { name: string; pnl: number }[] }) {
  if (!rows.length) {
    return <div className="text-sm text-slate-500">Henüz veri yok.</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div
          key={r.name}
          className="flex items-center justify-between rounded-2xl bg-black/25 p-4"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs text-slate-300">
              {i + 1}
            </span>
            <span className="font-semibold">{r.name}</span>
          </div>

          <span
            className={
              r.pnl >= 0
                ? "font-bold text-emerald-300"
                : "font-bold text-rose-300"
            }
          >
            {money(r.pnl)} ₺
          </span>
        </div>
      ))}
    </div>
  );
}