"use client";

import type { Trade, TradingSignal } from "./types";
import { formatPrice, formatPct, getSideClass, getRiskLevel } from "./helpers";

type Props = {
  trades: Trade[];
  signals: TradingSignal[];
};

export default function InstitutionalAnalyticsSuite({ trades, signals }: Props) {
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const winners = trades.filter((t) => t.pnl > 0).length;
  const losers = trades.filter((t) => t.pnl < 0).length;
  const winRate = trades.length ? Math.round((winners / trades.length) * 100) : 0;

  const longExposure = trades.filter((t) => t.side === "LONG").length;
  const shortExposure = trades.filter((t) => t.side === "SHORT").length;
  const exposurePct = Math.min(100, trades.length * 20);

  const equityPoints = buildEquityCurve(trades);
  const heatmap = buildHeatmap(signals);

  return (
    <section className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
      <Panel className="2xl:col-span-4" title="Live PnL Analytics" badge="PNL">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Total PnL" value={`${formatPrice(totalPnl)} ₺`} tone={totalPnl >= 0 ? "good" : "bad"} />
          <Metric label="Win Rate" value={`%${winRate}`} />
          <Metric label="W / L" value={`${winners} / ${losers}`} />
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">PnL Bias</span>
            <span className={totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
              {totalPnl >= 0 ? "POSITIVE" : "NEGATIVE"}
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-zinc-900 overflow-hidden">
            <div
              className={`h-full rounded-full ${totalPnl >= 0 ? "bg-emerald-400" : "bg-red-400"}`}
              style={{ width: `${Math.min(100, Math.abs(totalPnl) * 15)}%` }}
            />
          </div>
        </div>
      </Panel>

      <Panel className="2xl:col-span-5" title="Equity Curve" badge="CURVE">
        <div className="h-[180px] rounded-xl border border-zinc-800 bg-black/20 p-3">
          <svg viewBox="0 0 500 150" className="h-full w-full">
            <path d="M0 75 H500" stroke="rgba(148,163,184,.18)" strokeWidth="1" />
            <polyline
              fill="none"
              stroke="rgb(34,211,238)"
              strokeWidth="3"
              points={equityPoints}
            />
          </svg>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <Metric label="Trades" value={trades.length} />
          <Metric label="Best" value={`${formatPrice(Math.max(...trades.map((t) => t.pnl), 0))} ₺`} tone="good" />
          <Metric label="Worst" value={`${formatPrice(Math.min(...trades.map((t) => t.pnl), 0))} ₺`} tone="bad" />
          <Metric label="Mode" value="LIVE" />
        </div>
      </Panel>

      <Panel className="2xl:col-span-3" title="Exposure Engine" badge="RISK">
        <div className="space-y-3">
          <ExposureBar label="Total Exposure" value={exposurePct} />
          <ExposureBar label="Long Exposure" value={Math.min(100, longExposure * 25)} tone="long" />
          <ExposureBar label="Short Exposure" value={Math.min(100, shortExposure * 25)} tone="short" />

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Metric label="Long" value={longExposure} tone="good" />
            <Metric label="Short" value={shortExposure} tone="bad" />
          </div>
        </div>
      </Panel>

      <Panel className="2xl:col-span-5" title="Signal Heatmap" badge="HEAT">
        <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
          {heatmap.map((s) => (
            <div
              key={s.symbol}
              className={`rounded-xl border p-3 min-h-[82px] ${
                s.risk === "HIGH"
                  ? "border-red-500/30 bg-red-500/10"
                  : s.risk === "MEDIUM"
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-emerald-500/30 bg-emerald-500/10"
              }`}
            >
              <div className="text-xs font-bold text-zinc-100 truncate">{s.symbol}</div>
              <div className={`mt-1 text-[10px] ${getSideClass(s.side)}`}>{s.side}</div>
              <div className="mt-3 h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: `${s.score}%` }} />
              </div>
              <div className="mt-1 text-right text-[10px] text-zinc-400">{s.score}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="2xl:col-span-7" title="Realtime Activity Stream" badge="STREAM">
        <div className="space-y-2">
          {trades.slice(0, 7).map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-3 text-xs"
            >
              <div className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full ${t.side === "LONG" ? "bg-emerald-400" : "bg-red-400"}`} />
                <div>
                  <div className="font-semibold text-zinc-100">{t.symbol}</div>
                  <div className="text-[10px] text-zinc-500">{t.strategy}</div>
                </div>
              </div>

              <div className="flex items-center gap-5">
                <span className={getSideClass(t.side)}>{t.side}</span>
                <span className={t.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {formatPct(t.pnl)}
                </span>
                <span className="text-zinc-500">{t.createdAt.slice(11, 16)}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function Panel({
  title,
  badge,
  className,
  children,
}: {
  title: string;
  badge: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-zinc-800 bg-[#070b12] p-4 ${className ?? ""}`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xs uppercase tracking-[0.24em] text-cyan-300">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">Institutional analytics layer</p>
        </div>
        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold text-cyan-300">
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-zinc-100";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className={`mt-2 text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

function ExposureBar({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "long" | "short" | "neutral";
}) {
  const color = tone === "long" ? "bg-emerald-400" : tone === "short" ? "bg-red-400" : "bg-cyan-400";

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300">%{value}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function buildEquityCurve(trades: Trade[]) {
  if (!trades.length) return "0,75 500,75";

  let cumulative = 0;
  const values = trades.map((t) => {
    cumulative += t.pnl;
    return cumulative;
  });

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 500;
      const y = 140 - ((value - min) / range) * 120;
      return `${x},${y}`;
    })
    .join(" ");
}

function buildHeatmap(signals: TradingSignal[]) {
  return signals.slice(0, 12).map((s, index) => ({
    symbol: s.symbol,
    side: s.side,
    score: s.score ?? 60 + index * 4,
    risk: getRiskLevel(s),
  }));
}