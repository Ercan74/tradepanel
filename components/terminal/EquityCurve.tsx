import type { Trade } from "./types";
import { InfoBox, Panel } from "./Panel";

export default function EquityCurve({ trades }: { trades: Trade[] }) {
  const values = trades.slice(0, 70).reverse().map((t) => t.pnl);
  const base = values.length ? values : [0, 1, -1, 2, -2, 3];

  let acc = 0;
  const cumulative = base.map((v) => {
    acc += v;
    return acc;
  });

  const min = Math.min(...cumulative);
  const max = Math.max(...cumulative);
  const range = max - min || 1;

  const path = cumulative
    .map((v, i) => {
      const x = (i / Math.max(cumulative.length - 1, 1)) * 1000;
      const y = 260 - ((v - min) / range) * 220;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <section className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.4fr_0.8fr]">
      <Panel title="Equity Curve" sub="Sinyal bazlı kümülatif PnL eğrisi">
        <div className="rounded-2xl bg-black/30 p-4">
          <svg viewBox="0 0 1000 300" className="h-[300px] w-full">
            <defs>
              <linearGradient id="curve" x1="0" x2="1">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="60%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#f43f5e" />
              </linearGradient>
            </defs>

            <path d={path} fill="none" stroke="url(#curve)" strokeWidth="5" />
            <line
              x1="0"
              y1="260"
              x2="1000"
              y2="260"
              stroke="rgba(255,255,255,.12)"
            />
          </svg>
        </div>
      </Panel>

      <Panel title="Strategy Lab" sub="Rejim, momentum ve risk özeti">
        <div className="grid grid-cols-1 gap-3">
          <InfoBox label="Market Regime" value="RISK-ON / MOMENTUM" tone="good" />
          <InfoBox label="Dominant Strategy" value="EMA100 CORE" tone="good" />
          <InfoBox label="Volatility Class" value="NORMAL VOL" />
          <InfoBox label="Automation Status" value="SIGNAL MODE ACTIVE" tone="warn" />
        </div>
      </Panel>
    </section>
  );
}