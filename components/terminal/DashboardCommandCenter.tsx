"use client";

import type { ReactNode } from "react";
import type { Trade, TradingSignal } from "./types";
import {
  formatPct,
  formatPrice,
  getRiskLevel,
  getSideClass,
  getSignalScore,
} from "./helpers";

type Props = {
  trades: Trade[];
  signals: TradingSignal[];
};

type EnrichedSignal = TradingSignal & {
  aiScore: number;
  riskLevel: string;
};

export default function DashboardCommandCenter({ trades, signals }: Props) {
  const enrichedSignals: EnrichedSignal[] = signals
    .map((signal) => ({
      ...signal,
      aiScore: signal.score ?? getSignalScore(signal),
      riskLevel: getRiskLevel(signal),
    }))
    .sort((a, b) => b.aiScore - a.aiScore);

  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const winners = trades.filter((trade) => trade.pnl > 0).length;
  const losers = trades.filter((trade) => trade.pnl < 0).length;
  const winRate = trades.length ? Math.round((winners / trades.length) * 100) : 0;

  const longCount = trades.filter((trade) => trade.side === "LONG").length;
  const shortCount = trades.filter((trade) => trade.side === "SHORT").length;

  const avgAiScore = enrichedSignals.length
    ? Math.round(
        enrichedSignals.reduce((sum, signal) => sum + signal.aiScore, 0) /
          enrichedSignals.length
      )
    : 0;

  const marketRegime =
    avgAiScore >= 82
      ? "AGGRESSIVE MOMENTUM"
      : avgAiScore >= 70
      ? "CONTROLLED TREND"
      : avgAiScore >= 55
      ? "SELECTIVE MARKET"
      : "DEFENSIVE MODE";

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-3" title="Market Regime" badge="REGIME">
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Active Condition
            </div>
            <div className="mt-2 text-xl font-bold text-cyan-300">
              {marketRegime}
            </div>
            <div className="mt-4 h-2 rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-400"
                style={{ width: `${avgAiScore}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-zinc-500">
              <span>AI Confidence</span>
              <span>{avgAiScore}/100</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric label="Long Bias" value={longCount} tone="good" />
            <Metric label="Short Bias" value={shortCount} tone="bad" />
          </div>
        </Panel>

        <Panel className="2xl:col-span-5" title="Live Equity Curve" badge="EQUITY">
          <EquityCurve trades={trades} />
        </Panel>

        <Panel className="2xl:col-span-4" title="Floating Risk Engine" badge="RISK">
          <FloatingRiskEngine trades={trades} signals={enrichedSignals} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-5" title="AI Signal Ranking" badge="AI SCORE">
          <SignalRanking signals={enrichedSignals} />
        </Panel>

        <Panel className="2xl:col-span-4" title="Scanner Heatmap" badge="HEATMAP">
          <ScannerHeatmap signals={enrichedSignals} />
        </Panel>

        <Panel className="2xl:col-span-3" title="Realtime Stream" badge="LIVE">
          <RealtimeStream trades={trades} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-4" title="PnL Command" badge="PNL">
          <div className="grid grid-cols-3 gap-2">
            <Metric
              label="Total PnL"
              value={`${formatPrice(totalPnl)} ₺`}
              tone={totalPnl >= 0 ? "good" : "bad"}
            />
            <Metric label="Win Rate" value={`%${winRate}`} />
            <Metric label="W/L" value={`${winners}/${losers}`} />
          </div>
        </Panel>

        <Panel className="2xl:col-span-8" title="Institutional Exposure Map" badge="EXPOSURE">
          <ExposureMap trades={trades} />
        </Panel>
      </div>
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
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-zinc-800 bg-[#070b12] p-4 shadow-[0_0_40px_rgba(0,0,0,0.25)] ${
        className ?? ""
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.24em] text-cyan-300">
            {title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Institutional trading intelligence
          </p>
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
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
      ? "text-red-400"
      : "text-zinc-100";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </div>
      <div className={`mt-2 text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

function EquityCurve({ trades }: { trades: Trade[] }) {
  const points = buildEquityPoints(trades);
  const total = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const best = Math.max(...trades.map((trade) => trade.pnl), 0);
  const worst = Math.min(...trades.map((trade) => trade.pnl), 0);

  return (
    <>
      <div className="h-[190px] rounded-xl border border-zinc-800 bg-black/20 p-3">
        <svg viewBox="0 0 600 180" className="h-full w-full">
          <path d="M0 90 H600" stroke="rgba(148,163,184,.16)" strokeWidth="1" />
          <path d="M0 40 H600" stroke="rgba(148,163,184,.08)" strokeWidth="1" />
          <path d="M0 140 H600" stroke="rgba(148,163,184,.08)" strokeWidth="1" />
          <polyline
            fill="none"
            stroke="rgb(34,211,238)"
            strokeWidth="3"
            points={points}
          />
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric
          label="Total"
          value={`${formatPrice(total)} ₺`}
          tone={total >= 0 ? "good" : "bad"}
        />
        <Metric label="Best" value={`${formatPrice(best)} ₺`} tone="good" />
        <Metric label="Worst" value={`${formatPrice(worst)} ₺`} tone="bad" />
      </div>
    </>
  );
}

function FloatingRiskEngine({
  trades,
  signals,
}: {
  trades: Trade[];
  signals: EnrichedSignal[];
}) {
  const exposure = Math.min(100, trades.length * 20);
  const highRisk = signals.filter((signal) => signal.riskLevel === "HIGH").length;
  const longRisk = trades.filter((trade) => trade.side === "LONG").length * 25;
  const shortRisk = trades.filter((trade) => trade.side === "SHORT").length * 25;

  return (
    <div className="space-y-3">
      <RiskBar label="Total Exposure" value={exposure} tone="cyan" />
      <RiskBar label="Long Pressure" value={Math.min(100, longRisk)} tone="good" />
      <RiskBar label="Short Pressure" value={Math.min(100, shortRisk)} tone="bad" />
      <RiskBar label="High Risk Cluster" value={Math.min(100, highRisk * 25)} tone="warn" />

      <div className="grid grid-cols-3 gap-2 pt-1">
        <Metric label="Open" value={trades.length} />
        <Metric label="High" value={highRisk} tone={highRisk > 0 ? "bad" : "good"} />
        <Metric label="Mode" value="ACTIVE" />
      </div>
    </div>
  );
}

function RiskBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "good" | "bad" | "warn";
}) {
  const color =
    tone === "good"
      ? "bg-emerald-400"
      : tone === "bad"
      ? "bg-red-400"
      : tone === "warn"
      ? "bg-amber-400"
      : "bg-cyan-400";

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

function SignalRanking({ signals }: { signals: EnrichedSignal[] }) {
  return (
    <div className="space-y-2">
      {signals.slice(0, 6).map((signal) => (
        <div
          key={signal.id}
          className="grid grid-cols-[1fr_64px_90px_70px] items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs"
        >
          <div>
            <div className="font-semibold text-zinc-100">{signal.symbol}</div>
            <div className="text-[10px] text-zinc-500">
              RSI {signal.rsi ?? "-"} · ATR {signal.atr ?? "-"}
            </div>
          </div>

          <div className={`font-semibold ${getSideClass(signal.side)}`}>
            {signal.side}
          </div>

          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-400"
                style={{ width: `${signal.aiScore}%` }}
              />
            </div>
            <span className="w-6 text-right text-zinc-200">{signal.aiScore}</span>
          </div>

          <div className="text-right text-[10px] text-zinc-500">
            {signal.riskLevel}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScannerHeatmap({ signals }: { signals: EnrichedSignal[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {signals.slice(0, 9).map((signal) => {
        const tileClass =
          signal.riskLevel === "HIGH"
            ? "border-red-500/30 bg-red-500/10"
            : signal.riskLevel === "MEDIUM"
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-emerald-500/30 bg-emerald-500/10";

        return (
          <div
            key={signal.id}
            className={`min-h-[82px] rounded-xl border p-3 ${tileClass}`}
          >
            <div className="truncate text-xs font-bold text-zinc-100">
              {signal.symbol}
            </div>
            <div className={`mt-1 text-[10px] ${getSideClass(signal.side)}`}>
              {signal.side}
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-400"
                style={{ width: `${signal.aiScore}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RealtimeStream({ trades }: { trades: Trade[] }) {
  return (
    <div className="space-y-2">
      {trades.slice(0, 6).map((trade) => (
        <div
          key={trade.id}
          className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2"
        >
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  trade.side === "LONG" ? "bg-emerald-400" : "bg-red-400"
                }`}
              />
              <span className="font-semibold text-zinc-100">{trade.symbol}</span>
            </div>
            <span className={getSideClass(trade.side)}>{trade.side}</span>
          </div>

          <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
            <span>{trade.strategy}</span>
            <span>{trade.createdAt.slice(11, 16)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExposureMap({ trades }: { trades: Trade[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {trades.map((trade) => (
        <div
          key={trade.id}
          className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-100">{trade.symbol}</span>
            <span className={`text-[10px] ${getSideClass(trade.side)}`}>
              {trade.side}
            </span>
          </div>

          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="text-[10px] text-zinc-500">Entry</div>
              <div className="text-xs text-zinc-300">{formatPrice(trade.entry)}</div>
            </div>
            <div
              className={`text-sm font-bold ${
                trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {formatPct(trade.pnl)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildEquityPoints(trades: Trade[]) {
  if (!trades.length) return "0,90 600,90";

  let cumulative = 0;
  const values = trades.map((trade) => {
    cumulative += trade.pnl;
    return cumulative;
  });

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 600;
      const y = 160 - ((value - min) / range) * 140;
      return `${x},${y}`;
    })
    .join(" ");
}