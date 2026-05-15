import type { Trade } from "./types";
import { money, shortTime } from "./helpers";
import { Badge, InfoBox, Panel, RiskBar } from "./Panel";

export default function AdvancedTerminalGrid({ trades }: { trades: Trade[] }) {
  const openTrades = trades.filter((t) => t.status.toUpperCase() === "OPEN");
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const winners = trades.filter((t) => t.pnl > 0);
  const losers = trades.filter((t) => t.pnl < 0);
  const avgConfidence = trades.length
    ? Math.round(trades.reduce((sum, t) => sum + t.confidence, 0) / trades.length)
    : 0;

  const bestTrade = [...trades].sort((a, b) => b.pnl - a.pnl)[0];
  const worstTrade = [...trades].sort((a, b) => a.pnl - b.pnl)[0];

  const signalScore = Math.max(
    0,
    Math.min(100, Math.round(avgConfidence - openTrades.length * 3 + (totalPnl >= 0 ? 8 : -8)))
  );

  return (
    <section className="grid grid-cols-1 gap-3 2xl:grid-cols-[1.1fr_1fr_1fr]">
      <Panel title="PnL Analytics" sub="Kâr/zarar kalitesi ve trade istatistikleri">
        <div className="grid grid-cols-2 gap-3">
          <InfoBox
            label="Total PnL"
            value={`${money(totalPnl)}`}
            tone={totalPnl >= 0 ? "good" : "bad"}
          />
          <InfoBox label="Win / Loss" value={`${winners.length} / ${losers.length}`} />
          <InfoBox
            label="Best Trade"
            value={bestTrade ? `${bestTrade.symbol} ${money(bestTrade.pnl)}` : "-"}
            tone="good"
          />
          <InfoBox
            label="Worst Trade"
            value={worstTrade ? `${worstTrade.symbol} ${money(worstTrade.pnl)}` : "-"}
            tone="bad"
          />
        </div>
      </Panel>

      <Panel title="Strategy Lab" sub="Strateji, rejim ve confidence özeti">
        <div className="grid grid-cols-2 gap-3">
          <InfoBox label="Dominant Strategy" value="EMA100 CORE" tone="good" />
          <InfoBox label="Market Regime" value="RISK-ON" tone="good" />
          <InfoBox label="Avg Confidence" value={`%${avgConfidence}`} />
          <InfoBox label="Signal Mode" value="ACTIVE" tone="warn" />
        </div>
      </Panel>

      <Panel title="AI Signal Score" sub="Sinyal kalitesi ve otomasyon skoru">
        <div className="space-y-3">
          <RiskBar label="AI Signal Score" value={signalScore} />
          <div className="grid grid-cols-2 gap-3">
            <InfoBox
              label="Quality"
              value={signalScore >= 70 ? "STRONG" : signalScore >= 45 ? "NORMAL" : "WEAK"}
              tone={signalScore >= 70 ? "good" : signalScore >= 45 ? "warn" : "bad"}
            />
            <InfoBox
              label="Bias"
              value={totalPnl >= 0 ? "POSITIVE" : "NEGATIVE"}
              tone={totalPnl >= 0 ? "good" : "bad"}
            />
          </div>
        </div>
      </Panel>

      <Panel title="Risk Matrix" sub="Pozisyon yoğunluğu ve yön riski">
        <div className="grid grid-cols-2 gap-3">
          <InfoBox label="Open Trades" value={String(openTrades.length)} />
          <InfoBox
            label="Capacity"
            value={`%${Math.min(openTrades.length * 20, 100)}`}
            tone={openTrades.length >= 4 ? "warn" : "good"}
          />
          <InfoBox
            label="Long Count"
            value={String(openTrades.filter((t) => t.side === "LONG").length)}
            tone="good"
          />
          <InfoBox
            label="Short Count"
            value={String(openTrades.filter((t) => t.side === "SHORT").length)}
            tone="bad"
          />
        </div>
      </Panel>

      <Panel title="Signal Intelligence" sub="Son sinyallerin kalite sınıflaması">
        <div className="space-y-2">
          {trades.slice(0, 5).map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl bg-black/30 p-3">
              <div>
                <div className="font-bold">{t.symbol}</div>
                <div className="text-[11px] text-slate-500">
                  {t.strategy} · CONF %{Math.round(t.confidence)}
                </div>
              </div>
              <Badge tone={t.side === "LONG" ? "good" : "bad"}>{t.side}</Badge>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Trade Replay" sub="Son işlemlerin zaman akışı">
        <div className="space-y-2">
          {trades.slice(0, 5).map((t) => (
            <div key={t.id} className="rounded-xl bg-black/30 p-3">
              <div className="flex justify-between">
                <span className="font-bold">{t.symbol}</span>
                <span className={t.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}>
                  {money(t.pnl)}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">{shortTime(t.createdAt)}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Scanner Ranking" sub="En aktif sinyal üreten hisseler">
        <Ranking trades={trades} />
      </Panel>

      <Panel title="Position Detail Drawer" sub="Seçili pozisyon özeti">
        <PositionPreview trade={openTrades[0] || trades[0]} />
      </Panel>

      <Panel title="Advanced Heatmap" sub="Momentum ve PnL renk yoğunluğu">
        <MiniHeatmap trades={trades} />
      </Panel>
    </section>
  );
}

function Ranking({ trades }: { trades: Trade[] }) {
  const counts = new Map<string, number>();

  trades.forEach((t) => {
    counts.set(t.symbol, (counts.get(t.symbol) || 0) + 1);
  });

  const rows = Array.from(counts.entries())
    .map(([symbol, count]) => ({ symbol, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  if (!rows.length) return <div className="text-xs text-slate-500">Henüz veri yok.</div>;

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.symbol} className="flex justify-between rounded-xl bg-black/30 p-3">
          <span>
            {i + 1}. <b>{r.symbol}</b>
          </span>
          <span className="text-cyan-300">{r.count} signal</span>
        </div>
      ))}
    </div>
  );
}

function PositionPreview({ trade }: { trade?: Trade }) {
  if (!trade) return <div className="text-xs text-slate-500">Açık pozisyon yok.</div>;

  return (
    <div className="space-y-3">
      <InfoBox label="Symbol" value={trade.symbol} />
      <InfoBox label="Side" value={trade.side} tone={trade.side === "LONG" ? "good" : "bad"} />
      <InfoBox label="Entry / Current" value={money(trade.price)} />
      <InfoBox label="PnL" value={money(trade.pnl)} tone={trade.pnl >= 0 ? "good" : "bad"} />
    </div>
  );
}

function MiniHeatmap({ trades }: { trades: Trade[] }) {
  const rows = trades.slice(0, 12);

  if (!rows.length) return <div className="text-xs text-slate-500">Henüz veri yok.</div>;

  return (
    <div className="grid grid-cols-3 gap-2">
      {rows.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl p-3 text-center text-xs ${
            t.pnl >= 0 ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"
          }`}
        >
          <div className="font-bold">{t.symbol}</div>
          <div>{money(t.pnl)}</div>
        </div>
      ))}
    </div>
  );
}