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
    <section className="space-y-3">
      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-3" title="Regime Intelligence" badge="REGIME">
          <RegimeIntelligence
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

        <Panel className="2xl:col-span-3" title="Exposure Engine" badge="RISK">
          <ExposureEngine
            trades={trades}
            longCount={longCount}
            shortCount={shortCount}
            highRiskCount={highRiskCount}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-5" title="AI Score Layer" badge="AI SCORE">
          <AIScoreLayer signals={enrichedSignals} />
        </Panel>

        <Panel className="2xl:col-span-4" title="Signal Heatmap" badge="HEATMAP">
          <SignalHeatmap signals={enrichedSignals} />
        </Panel>

        <Panel className="2xl:col-span-3" title="Realtime Stream" badge="LIVE">
          <RealtimeStream trades={trades} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-4" title="Floating PnL Analytics" badge="PNL">
          <FloatingPnlAnalytics
            trades={trades}
            totalPnl={totalPnl}
            winners={winners}
            losers={losers}
            winRate={winRate}
          />
        </Panel>

        <Panel className="2xl:col-span-4" title="Volatility / Pressure Grid" badge="VOL">
          <VolatilityPressureGrid signals={enrichedSignals} />
        </Panel>

        <Panel className="2xl:col-span-4" title="Advanced Hierarchy Grid" badge="COMMAND">
          <AdvancedHierarchyGrid
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
            Bloomberg-style institutional intelligence
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

function RegimeIntelligence({
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
          Active Market State
        </div>

        <div className="mt-2 text-xl font-black text-cyan-300">
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
      <div className="h-[210px] rounded-xl border border-zinc-800 bg-black/20 p-3">
        <svg viewBox="0 0 720 210" className="h-full w-full">
          <path d="M0 105 H720" stroke="rgba(148,163,184,.16)" strokeWidth="1" />
          <path d="M0 55 H720" stroke="rgba(148,163,184,.08)" strokeWidth="1" />
          <path d="M0 155 H720" stroke="rgba(148,163,184,.08)" strokeWidth="1" />
          <polyline
            fill="none"
            stroke="rgb(34,211,238)"
            strokeWidth="3"
            points={points}
          />
          {trades.map((trade, index) => {
            const x = trades.length <= 1 ? 0 : (index / (trades.length - 1)) * 720;
            const y = trade.pnl >= 0 ? 70 : 140;

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

function ExposureEngine({
  trades,
  longCount,
  shortCount,
  highRiskCount,
}: {
  trades: Trade[];
  longCount: number;
  shortCount: number;
  highRiskCount: number;
}) {
  const maxPositions = 5;
  const exposure = Math.min(100, Math.round((trades.length / maxPositions) * 100));
  const longPct = Math.min(100, longCount * 25);
  const shortPct = Math.min(100, shortCount * 25);
  const riskPct = Math.min(100, highRiskCount * 25);

  return (
    <div className="space-y-3">
      <Bar label="Total Exposure" value={exposure} tone="cyan" />
      <Bar label="Long Pressure" value={longPct} tone="good" />
      <Bar label="Short Pressure" value={shortPct} tone="bad" />
      <Bar label="Risk Cluster" value={riskPct} tone="warn" />

      <div className="grid grid-cols-3 gap-2">
        <Metric label="Open" value={`${trades.length}/5`} />
        <Metric label="Long" value={longCount} tone="good" />
        <Metric label="Short" value={shortCount} tone="bad" />
      </div>
    </div>
  );
}

function AIScoreLayer({ signals }: { signals: EnrichedSignal[] }) {
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

          <div className="text-right text-[10px] text-zinc-500">
            {signal.regime}
          </div>
        </div>
      ))}
    </div>
  );
}

function SignalHeatmap({ signals }: { signals: EnrichedSignal[] }) {
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
            className={`min-h-[88px] rounded-xl border p-3 ${tileClass}`}
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
              {signal.riskLevel}
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

function FloatingPnlAnalytics({
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

function VolatilityPressureGrid({ signals }: { signals: EnrichedSignal[] }) {
  const avgAtr =
    signals.length > 0
      ? signals.reduce((sum, signal) => sum + (signal.atr ?? 0), 0) / signals.length
      : 0;

  const avgDist =
    signals.length > 0
      ? signals.reduce((sum, signal) => sum + Math.abs(signal.distAtr ?? 0), 0) /
        signals.length
      : 0;

  const volatilityScore = Math.min(100, Math.round(avgAtr * 18 + avgDist * 20));

  return (
    <div className="space-y-3">
      <Bar label="ATR Pressure" value={Math.min(100, Math.round(avgAtr * 25))} tone="cyan" />
      <Bar label="EMA Distance" value={Math.min(100, Math.round(avgDist * 28))} tone="warn" />
      <Bar label="Vol Composite" value={volatilityScore} tone={volatilityScore > 70 ? "bad" : "good"} />

      <div className="grid grid-cols-3 gap-2">
        <Metric label="ATR AVG" value={avgAtr.toFixed(2)} />
        <Metric label="DIST AVG" value={avgDist.toFixed(2)} />
        <Metric
          label="Mode"
          value={volatilityScore > 70 ? "HOT" : "NORMAL"}
          tone={volatilityScore > 70 ? "warn" : "good"}
        />
      </div>
    </div>
  );
}

function AdvancedHierarchyGrid({
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
        subtitle={bestSignal ? `${bestSignal.side} · ${bestSignal.aiScore}` : "No signal"}
        tone="cyan"
      />

      <CommandCard
        title="Risk"
        value={highRisk ? "WATCH" : "CLEAR"}
        subtitle="Cluster state"
        tone={highRisk ? "warn" : "good"}
      />

      <CommandCard
        title="Exposure"
        value={`${trades.length}/${maxPositions}`}
        subtitle="Open position policy"
        tone={trades.length >= maxPositions ? "bad" : "good"}
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
        <span className="text-zinc-300">%{value}</span>
      </div>

      <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function buildEquityPoints(trades: Trade[]) {
  if (!trades.length) return "0,105 720,105";

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
      const y = 190 - ((value - min) / range) * 170;
      return `${x},${y}`;
    })
    .join(" ");
}