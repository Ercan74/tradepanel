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
  pressure: number;
  regime: string;
  conviction: "ELITE" | "STRONG" | "TACTICAL" | "WAIT";
};

export default function DashboardCommandCenter({ trades, signals }: Props) {
  const enrichedSignals: EnrichedSignal[] = signals
    .map((signal, index) => {
      const aiScore = signal.score ?? getSignalScore(signal);
      const riskLevel = getRiskLevel(signal);

      return {
        ...signal,
        aiScore,
        riskLevel,
        pressure: Math.min(100, aiScore + index * 4),
        regime:
          aiScore >= 82
            ? "MOMENTUM"
            : aiScore >= 70
            ? "TREND"
            : aiScore >= 55
            ? "SELECTIVE"
            : "DEFENSIVE",
        conviction:
          aiScore >= 86
            ? "ELITE"
            : aiScore >= 74
            ? "STRONG"
            : aiScore >= 60
            ? "TACTICAL"
            : "WAIT",
      };
    })
    .sort((a, b) => b.aiScore - a.aiScore);

  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const winners = trades.filter((trade) => trade.pnl > 0).length;
  const losers = trades.filter((trade) => trade.pnl < 0).length;
  const winRate = trades.length ? Math.round((winners / trades.length) * 100) : 0;

  const longCount = trades.filter((trade) => trade.side === "LONG").length;
  const shortCount = trades.filter((trade) => trade.side === "SHORT").length;
  const highRiskCount = enrichedSignals.filter((s) => s.riskLevel === "HIGH").length;

  const avgAiScore = enrichedSignals.length
    ? Math.round(
        enrichedSignals.reduce((sum, signal) => sum + signal.aiScore, 0) /
          enrichedSignals.length
      )
    : 0;

  const avgPressure = enrichedSignals.length
    ? Math.round(
        enrichedSignals.reduce((sum, signal) => sum + signal.pressure, 0) /
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
    <section className="relative space-y-3">
      <FloatingCommandCenter
        trades={trades}
        signals={enrichedSignals}
        totalPnl={totalPnl}
        avgAiScore={avgAiScore}
      />

      <LiveTickerTape trades={trades} signals={enrichedSignals} />

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-3" title="Market Pressure Radar" badge="RADAR">
          <MarketPressureRadar
            marketRegime={marketRegime}
            avgAiScore={avgAiScore}
            avgPressure={avgPressure}
            longCount={longCount}
            shortCount={shortCount}
          />
        </Panel>

        <Panel className="2xl:col-span-6" title="Live Equity Curve" badge="EQUITY">
          <EquityCurve trades={trades} />
        </Panel>

        <Panel className="2xl:col-span-3" title="Liquidity / Risk Pulse" badge="PULSE">
          <LiquidityRiskPulse
            trades={trades}
            signals={enrichedSignals}
            highRiskCount={highRiskCount}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-5" title="AI Conviction Engine v2" badge="CONVICTION">
          <AIConvictionEngine signals={enrichedSignals} />
        </Panel>

        <Panel className="2xl:col-span-4" title="Dynamic Heat Clusters" badge="CLUSTERS">
          <DynamicHeatClusters signals={enrichedSignals} />
        </Panel>

        <Panel className="2xl:col-span-3" title="Animated Execution Stream" badge="LIVE">
          <AnimatedExecutionStream trades={trades} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-4" title="Animated PnL Flow" badge="PNL">
          <AnimatedPnlFlow
            trades={trades}
            totalPnl={totalPnl}
            winners={winners}
            losers={losers}
            winRate={winRate}
          />
        </Panel>

        <Panel className="2xl:col-span-4" title="Scanner Dominance Map" badge="SCANNER">
          <ScannerDominanceMap signals={enrichedSignals} />
        </Panel>

        <Panel className="2xl:col-span-4" title="Adaptive Hierarchy Grid" badge="COMMAND">
          <AdaptiveHierarchyGrid
            trades={trades}
            signals={enrichedSignals}
            totalPnl={totalPnl}
          />
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
      className={`rounded-2xl border border-zinc-800 bg-[#070b12] p-4 shadow-[0_0_40px_rgba(0,0,0,0.28)] ${
        className ?? ""
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.24em] text-cyan-300">
            {title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Professional trading operating system
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

function FloatingCommandCenter({
  trades,
  signals,
  totalPnl,
  avgAiScore,
}: {
  trades: Trade[];
  signals: EnrichedSignal[];
  totalPnl: number;
  avgAiScore: number;
}) {
  const priority = signals[0];
  const highRisk = signals.some((signal) => signal.riskLevel === "HIGH");
  const exposureState = trades.length >= 5 ? "MAXED" : trades.length >= 4 ? "ELEVATED" : "NORMAL";

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.035] p-3">
      <CommandChip
        label="Priority"
        value={priority ? priority.symbol : "-"}
        detail={priority ? `${priority.side} · ${priority.aiScore}` : "No signal"}
        tone="cyan"
      />

      <CommandChip
        label="System Risk"
        value={highRisk ? "WATCH" : "CLEAR"}
        detail="cluster monitor"
        tone={highRisk ? "warn" : "good"}
      />

      <CommandChip
        label="Exposure"
        value={exposureState}
        detail={`${trades.length}/5 open`}
        tone={exposureState === "MAXED" ? "bad" : exposureState === "ELEVATED" ? "warn" : "good"}
      />

      <CommandChip
        label="Terminal Pulse"
        value={totalPnl >= 0 ? "ONLINE +" : "ONLINE -"}
        detail={`AI ${avgAiScore}/100`}
        tone={totalPnl >= 0 ? "good" : "bad"}
      />
    </div>
  );
}

function CommandChip({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "cyan" | "good" | "bad" | "warn";
}) {
  const color =
    tone === "good"
      ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
      : tone === "bad"
      ? "text-red-400 border-red-500/20 bg-red-500/5"
      : tone === "warn"
      ? "text-amber-400 border-amber-500/20 bg-amber-500/5"
      : "text-cyan-300 border-cyan-500/20 bg-cyan-500/5";

  return (
    <div className={`rounded-xl border px-3 py-2 ${color}`}>
      <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-base font-black">{value}</div>
      <div className="text-[10px] text-zinc-500">{detail}</div>
    </div>
  );
}

function LiveTickerTape({
  trades,
  signals,
}: {
  trades: Trade[];
  signals: EnrichedSignal[];
}) {
  const items = [
    ...signals.slice(0, 4).map((signal) => ({
      key: `s-${signal.id}`,
      label: signal.symbol,
      value: `${signal.side} ${signal.aiScore}`,
      tone: signal.side === "LONG" ? "good" : "bad",
    })),
    ...trades.slice(0, 4).map((trade) => ({
      key: `t-${trade.id}`,
      label: trade.symbol,
      value: formatPct(trade.pnl),
      tone: trade.pnl >= 0 ? "good" : "bad",
    })),
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#070b12] px-3 py-2">
      <div className="flex min-w-max items-center gap-3">
        <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-300">
          LIVE TAPE
        </span>

        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-xs"
          >
            <span className="font-semibold text-zinc-200">{item.label}</span>
            <span
              className={
                item.tone === "good" ? "text-emerald-400" : "text-red-400"
              }
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketPressureRadar({
  marketRegime,
  avgAiScore,
  avgPressure,
  longCount,
  shortCount,
}: {
  marketRegime: string;
  avgAiScore: number;
  avgPressure: number;
  longCount: number;
  shortCount: number;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          Active Regime
        </div>

        <div className="mt-2 text-lg font-black text-cyan-300">
          {marketRegime}
        </div>

        <Bar label="AI Confidence" value={avgAiScore} tone="cyan" />
        <Bar label="Market Pressure" value={avgPressure} tone="warn" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Long Bias" value={longCount} tone="good" />
        <Metric label="Short Bias" value={shortCount} tone="bad" />
      </div>
    </div>
  );
}

function EquityCurve({ trades }: { trades: Trade[] }) {
  const points = buildEquityPoints(trades);
  const total = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const best = Math.max(...trades.map((trade) => trade.pnl), 0);
  const worst = Math.min(...trades.map((trade) => trade.pnl), 0);
  const drawdown = Math.abs(Math.min(0, worst));

  return (
    <>
      <div className="h-[220px] rounded-xl border border-zinc-800 bg-black/20 p-3">
        <svg viewBox="0 0 720 220" className="h-full w-full">
          <path d="M0 110 H720" stroke="rgba(148,163,184,.16)" strokeWidth="1" />
          <path d="M0 55 H720" stroke="rgba(148,163,184,.08)" strokeWidth="1" />
          <path d="M0 165 H720" stroke="rgba(148,163,184,.08)" strokeWidth="1" />

          <polyline
            fill="none"
            stroke="rgb(34,211,238)"
            strokeWidth="3"
            points={points}
          />

          {trades.map((trade, index) => {
            const x = trades.length <= 1 ? 0 : (index / (trades.length - 1)) * 720;
            const y = trade.pnl >= 0 ? 76 : 148;

            return (
              <circle
                key={trade.id}
                cx={x}
                cy={y}
                r="4"
                fill={trade.pnl >= 0 ? "rgb(52,211,153)" : "rgb(248,113,113)"}
              />
            );
          })}
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <Metric label="Total" value={`${formatPrice(total)} ₺`} tone={total >= 0 ? "good" : "bad"} />
        <Metric label="Best" value={`${formatPrice(best)} ₺`} tone="good" />
        <Metric label="Worst" value={`${formatPrice(worst)} ₺`} tone="bad" />
        <Metric label="Drawdown" value={`${formatPrice(drawdown)} ₺`} tone={drawdown > 0 ? "warn" : "good"} />
      </div>
    </>
  );
}

function LiquidityRiskPulse({
  trades,
  signals,
  highRiskCount,
}: {
  trades: Trade[];
  signals: EnrichedSignal[];
  highRiskCount: number;
}) {
  const longCount = trades.filter((trade) => trade.side === "LONG").length;
  const shortCount = trades.filter((trade) => trade.side === "SHORT").length;
  const avgPressure = signals.length
    ? Math.round(signals.reduce((sum, s) => sum + s.pressure, 0) / signals.length)
    : 0;

  return (
    <div className="space-y-3">
      <Bar label="Liquidity Demand" value={Math.min(100, trades.length * 22)} tone="cyan" />
      <Bar label="Long Pressure" value={Math.min(100, longCount * 30)} tone="good" />
      <Bar label="Short Pressure" value={Math.min(100, shortCount * 30)} tone="bad" />
      <Bar label="Risk Pulse" value={Math.min(100, highRiskCount * 25 + avgPressure / 4)} tone="warn" />

      <div className="grid grid-cols-3 gap-2">
        <Metric label="Open" value={`${trades.length}/5`} />
        <Metric label="Risk" value={highRiskCount} tone={highRiskCount > 0 ? "warn" : "good"} />
        <Metric label="Pulse" value={avgPressure} />
      </div>
    </div>
  );
}

function AIConvictionEngine({ signals }: { signals: EnrichedSignal[] }) {
  return (
    <div className="space-y-2">
      {signals.slice(0, 7).map((signal) => (
        <div
          key={signal.id}
          className="grid grid-cols-[1fr_64px_110px_72px] items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs"
        >
          <div>
            <div className="font-semibold text-zinc-100">{signal.symbol}</div>
            <div className="text-[10px] text-zinc-500">
              RSI {signal.rsi ?? "-"} · ATR {signal.atr ?? "-"} · DIST{" "}
              {signal.distAtr ?? "-"}
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
            <span className="w-7 text-right text-zinc-200">{signal.aiScore}</span>
          </div>

          <div className="text-right text-[10px] text-cyan-300">
            {signal.conviction}
          </div>
        </div>
      ))}
    </div>
  );
}

function DynamicHeatClusters({ signals }: { signals: EnrichedSignal[] }) {
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
            className={`min-h-[92px] rounded-xl border p-3 ${tileClass}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-xs font-bold text-zinc-100">
                {signal.symbol}
              </div>
              <div className="text-[10px] text-zinc-400">{signal.aiScore}</div>
            </div>

            <div className={`mt-1 text-[10px] ${getSideClass(signal.side)}`}>
              {signal.side}
            </div>

            <div className="mt-3 h-1.5 rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-400"
                style={{ width: `${signal.pressure}%` }}
              />
            </div>

            <div className="mt-1 text-[9px] text-zinc-500">
              {signal.conviction}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnimatedExecutionStream({ trades }: { trades: Trade[] }) {
  return (
    <div className="space-y-2">
      {trades.slice(0, 7).map((trade) => (
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

          <div className="mt-2 flex items-center justify-between text-[10px]">
            <span className="text-zinc-500">PnL</span>
            <span className={trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
              {formatPct(trade.pnl)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AnimatedPnlFlow({
  trades,
  totalPnl,
  winners,
  losers,
  winRate,
}: {
  trades: Trade[];
  totalPnl: number;
  winners: number;
  losers: number;
  winRate: number;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Total PnL" value={`${formatPrice(totalPnl)} ₺`} tone={totalPnl >= 0 ? "good" : "bad"} />
        <Metric label="Win Rate" value={`%${winRate}`} />
        <Metric label="W/L" value={`${winners}/${losers}`} />
      </div>

      <div className="space-y-2">
        {trades.slice(0, 5).map((trade) => (
          <div key={trade.id}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-zinc-400">{trade.symbol}</span>
              <span className={trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                {formatPct(trade.pnl)}
              </span>
            </div>

            <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  trade.pnl >= 0 ? "bg-emerald-400" : "bg-red-400"
                }`}
                style={{ width: `${Math.min(100, Math.abs(trade.pnl) * 60)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScannerDominanceMap({ signals }: { signals: EnrichedSignal[] }) {
  const top = signals[0];

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Dominant Candidate
        </div>
        <div className="mt-2 text-2xl font-black text-cyan-300">
          {top?.symbol ?? "-"}
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          {top ? `${top.side} · ${top.conviction} · ${top.aiScore}/100` : "No signal"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {signals.slice(0, 4).map((signal) => (
          <div
            key={signal.id}
            className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-100">{signal.symbol}</span>
              <span className={getSideClass(signal.side)}>{signal.side}</span>
            </div>
            <Bar label={signal.conviction} value={signal.aiScore} tone="cyan" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AdaptiveHierarchyGrid({
  trades,
  signals,
  totalPnl,
}: {
  trades: Trade[];
  signals: EnrichedSignal[];
  totalPnl: number;
}) {
  const bestSignal = signals[0];
  const highRisk = signals.some((signal) => signal.riskLevel === "HIGH");
  const maxPositions = 5;

  return (
    <div className="grid grid-cols-2 gap-2">
      <CommandCard
        title="Priority"
        value={bestSignal?.symbol ?? "-"}
        subtitle={bestSignal ? `${bestSignal.side} · ${bestSignal.conviction}` : "No signal"}
        tone="cyan"
      />

      <CommandCard
        title="Risk"
        value={highRisk ? "WATCH" : "CLEAR"}
        subtitle="cluster state"
        tone={highRisk ? "warn" : "good"}
      />

      <CommandCard
        title="Exposure"
        value={`${trades.length}/${maxPositions}`}
        subtitle="position policy"
        tone={trades.length >= maxPositions ? "bad" : trades.length >= 4 ? "warn" : "good"}
      />

      <CommandCard
        title="PnL State"
        value={totalPnl >= 0 ? "POSITIVE" : "NEGATIVE"}
        subtitle={`${formatPrice(totalPnl)} ₺`}
        tone={totalPnl >= 0 ? "good" : "bad"}
      />
    </div>
  );
}

function CommandCard({
  title,
  value,
  subtitle,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  tone: "cyan" | "good" | "bad" | "warn";
}) {
  const color =
    tone === "good"
      ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
      : tone === "bad"
      ? "text-red-400 border-red-500/20 bg-red-500/5"
      : tone === "warn"
      ? "text-amber-400 border-amber-500/20 bg-amber-500/5"
      : "text-cyan-300 border-cyan-500/20 bg-cyan-500/5";

  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        {title}
      </div>
      <div className="mt-2 text-lg font-black">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>
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
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
      ? "text-red-400"
      : tone === "warn"
      ? "text-amber-400"
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

function Bar({
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
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300">%{Math.round(value)}</span>
      </div>

      <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.round(value))}%` }}
        />
      </div>
    </div>
  );
}

function buildEquityPoints(trades: Trade[]) {
  if (!trades.length) return "0,110 720,110";

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
      const x = (index / Math.max(1, values.length - 1)) * 720;
      const y = 200 - ((value - min) / range) * 180;
      return `${x},${y}`;
    })
    .join(" ");
}