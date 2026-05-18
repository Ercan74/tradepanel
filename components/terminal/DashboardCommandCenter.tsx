"use client";

import type { ReactNode } from "react";
import type { Trade, TradingSignal } from "./types";

type Props = {
  trades: Trade[];
  signals: TradingSignal[];
};

type Conviction = "WAIT" | "TACTICAL" | "STRONG" | "ELITE";

type EnrichedSignal = TradingSignal & {
  aiScore: number;
  riskLevel: string;
  pressure: number;
  regime: string;
  conviction: Conviction;
};

export default function DashboardCommandCenter({ trades, signals }: Props) {
  const enrichedSignals: EnrichedSignal[] = signals
    .map((signal, index) => {
      const aiScore = signal.score ?? 60 + index * 8;

      const conviction: Conviction =
        aiScore >= 86
          ? "ELITE"
          : aiScore >= 74
          ? "STRONG"
          : aiScore >= 60
          ? "TACTICAL"
          : "WAIT";

      return {
        ...signal,
        aiScore,
        riskLevel: aiScore >= 82 ? "LOW" : aiScore >= 68 ? "MEDIUM" : "HIGH",
        pressure: Math.min(100, aiScore + index * 4),
        regime:
          aiScore >= 82
            ? "MOMENTUM"
            : aiScore >= 70
            ? "TREND"
            : aiScore >= 55
            ? "SELECTIVE"
            : "DEFENSIVE",
        conviction,
      };
    })
    .sort((a, b) => b.aiScore - a.aiScore);

  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const winners = trades.filter((trade) => trade.pnl > 0).length;
  const losers = trades.filter((trade) => trade.pnl < 0).length;
  const winRate = trades.length ? Math.round((winners / trades.length) * 100) : 0;

  const avgAi =
    enrichedSignals.reduce((sum, signal) => sum + signal.aiScore, 0) /
    Math.max(enrichedSignals.length, 1);

  const avgPressure =
    enrichedSignals.reduce((sum, signal) => sum + signal.pressure, 0) /
    Math.max(enrichedSignals.length, 1);

  const longCount = trades.filter((t) => t.side === "LONG").length;
  const shortCount = trades.filter((t) => t.side === "SHORT").length;
  const exposurePct = Math.min(100, trades.length * 20);

  return (
    <section className="space-y-3">
      <MarketRegimeRibbon
        avgAi={avgAi}
        avgPressure={avgPressure}
        exposurePct={exposurePct}
        totalPnl={totalPnl}
      />

      <LiveTickerRail trades={trades} signals={enrichedSignals} />

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-8" title="Dominant Center Canvas" badge="CENTER">
          <DominantCenterCanvas
            trades={trades}
            signals={enrichedSignals}
            totalPnl={totalPnl}
            winRate={winRate}
            winners={winners}
            losers={losers}
          />
        </Panel>

        <Panel className="2xl:col-span-4" title="Floating Activity Stream" badge="LIVE">
          <FloatingActivityStream trades={trades} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-4" title="AI Conviction Engine" badge="AI">
          <AIConvictionEngine signals={enrichedSignals} />
        </Panel>

        <Panel className="2xl:col-span-5" title="Scanner Dominance Matrix" badge="MATRIX">
          <ScannerDominanceMatrix signals={enrichedSignals} />
        </Panel>

        <Panel className="2xl:col-span-3" title="Liquidity / Risk Pulse" badge="PULSE">
          <LiquidityRiskPulse
            exposurePct={exposurePct}
            longCount={longCount}
            shortCount={shortCount}
            avgPressure={avgPressure}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-4" title="Animated PnL Pulse" badge="PNL">
          <AnimatedPnlPulse trades={trades} totalPnl={totalPnl} />
        </Panel>

        <Panel className="2xl:col-span-8" title="Adaptive Sizing Hierarchy" badge="COMMAND">
          <AdaptiveSizingHierarchy
            trades={trades}
            signals={enrichedSignals}
            totalPnl={totalPnl}
            exposurePct={exposurePct}
          />
        </Panel>
      </div>
    </section>
  );
}

function MarketRegimeRibbon({
  avgAi,
  avgPressure,
  exposurePct,
  totalPnl,
}: {
  avgAi: number;
  avgPressure: number;
  exposurePct: number;
  totalPnl: number;
}) {
  const regime =
    avgAi >= 82
      ? "AGGRESSIVE MOMENTUM"
      : avgAi >= 70
      ? "CONTROLLED TREND"
      : avgAi >= 55
      ? "SELECTIVE MARKET"
      : "DEFENSIVE MODE";

  return (
    <div className="grid grid-cols-2 xl:grid-cols-5 gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.035] p-3">
      <CommandChip label="Market Regime" value={regime} detail="adaptive macro state" tone="cyan" />
      <CommandChip label="AI Confidence" value={`%${avgAi.toFixed(0)}`} detail="signal intelligence" tone="good" />
      <CommandChip label="Pressure" value={`%${avgPressure.toFixed(0)}`} detail="market pulse" tone="warn" />
      <CommandChip label="Exposure" value={`%${exposurePct}`} detail="position load" tone={exposurePct >= 80 ? "bad" : "good"} />
      <CommandChip label="PnL State" value={totalPnl >= 0 ? "POSITIVE" : "NEGATIVE"} detail={`${money(totalPnl)} ₺`} tone={totalPnl >= 0 ? "good" : "bad"} />
    </div>
  );
}

function LiveTickerRail({
  trades,
  signals,
}: {
  trades: Trade[];
  signals: EnrichedSignal[];
}) {
  const items = [
    ...signals.slice(0, 5).map((s) => ({
      key: `s-${s.id}`,
      label: s.symbol,
      value: `${s.side} · ${s.conviction} · ${s.aiScore}`,
      tone: s.side === "LONG" ? "good" : "bad",
    })),
    ...trades.slice(0, 5).map((t) => ({
      key: `t-${t.id}`,
      label: t.symbol,
      value: pct(t.pnl),
      tone: t.pnl >= 0 ? "good" : "bad",
    })),
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#070b12] px-3 py-2">
      <div className="flex min-w-max items-center gap-3">
        <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-300">
          LIVE TICKER RAIL
        </span>

        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-xs"
          >
            <span className="font-semibold text-zinc-200">{item.label}</span>
            <span className={item.tone === "good" ? "text-emerald-400" : "text-red-400"}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DominantCenterCanvas({
  trades,
  signals,
  totalPnl,
  winRate,
  winners,
  losers,
}: {
  trades: Trade[];
  signals: EnrichedSignal[];
  totalPnl: number;
  winRate: number;
  winners: number;
  losers: number;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
      <div className="xl:col-span-8">
        <div className="h-[280px] rounded-2xl border border-zinc-800 bg-black/25 p-3">
          <svg viewBox="0 0 860 280" className="h-full w-full">
            <path d="M0 140 H860" stroke="rgba(148,163,184,.16)" strokeWidth="1" />
            <path d="M0 70 H860" stroke="rgba(148,163,184,.08)" strokeWidth="1" />
            <path d="M0 210 H860" stroke="rgba(148,163,184,.08)" strokeWidth="1" />
            <polyline
              fill="none"
              stroke="rgb(34,211,238)"
              strokeWidth="4"
              points={buildEquityPoints(trades)}
            />
            {trades.map((trade, index) => {
              const x = trades.length <= 1 ? 0 : (index / (trades.length - 1)) * 860;
              const y = trade.pnl >= 0 ? 92 : 188;

              return (
                <circle
                  key={trade.id}
                  cx={x}
                  cy={y}
                  r="5"
                  fill={trade.pnl >= 0 ? "rgb(52,211,153)" : "rgb(248,113,113)"}
                />
              );
            })}
          </svg>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <MetricCard label="Total PnL" value={`${money(totalPnl)} ₺`} tone={totalPnl >= 0 ? "good" : "bad"} />
          <MetricCard label="Win Rate" value={`%${winRate}`} tone="cyan" />
          <MetricCard label="Winners" value={`${winners}`} tone="good" />
          <MetricCard label="Losers" value={`${losers}`} tone="bad" />
        </div>
      </div>

      <div className="xl:col-span-4 space-y-2">
        {signals.slice(0, 5).map((signal) => (
          <div key={signal.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-white">{signal.symbol}</div>
                <div className="text-[10px] text-zinc-500">
                  {signal.regime} · {signal.conviction}
                </div>
              </div>
              <div className={sideClass(signal.side)}>{signal.side}</div>
            </div>

            <Bar label="AI Score" value={signal.aiScore} tone="cyan" />
          </div>
        ))}
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
          className="grid grid-cols-[1fr_64px_92px_80px] items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs"
        >
          <div>
            <div className="font-semibold text-white">{signal.symbol}</div>
            <div className="text-[10px] text-zinc-500">
              RSI {signal.rsi ?? "-"} · ATR {signal.atr ?? "-"}
            </div>
          </div>

          <div className={sideClass(signal.side)}>{signal.side}</div>

          <div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full rounded-full bg-cyan-400" style={{ width: `${signal.aiScore}%` }} />
            </div>
            <div className="mt-1 text-right text-[10px] text-zinc-400">%{signal.aiScore}</div>
          </div>

          <Badge value={signal.conviction} />
        </div>
      ))}
    </div>
  );
}

function ScannerDominanceMatrix({ signals }: { signals: EnrichedSignal[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {signals.slice(0, 9).map((signal) => {
        const intensity =
          signal.aiScore >= 82
            ? "border-emerald-500/30 bg-emerald-500/10"
            : signal.aiScore >= 68
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-red-500/30 bg-red-500/10";

        return (
          <div key={signal.id} className={`min-h-[100px] rounded-2xl border p-3 ${intensity}`}>
            <div className="flex items-center justify-between">
              <div className="truncate text-xs font-black text-white">{signal.symbol}</div>
              <div className="text-[10px] text-zinc-400">{signal.aiScore}</div>
            </div>

            <div className={`mt-1 text-[10px] ${sideClass(signal.side)}`}>{signal.side}</div>

            <div className="mt-3 h-1.5 rounded-full bg-zinc-900 overflow-hidden">
              <div className="h-full rounded-full bg-cyan-400" style={{ width: `${signal.pressure}%` }} />
            </div>

            <div className="mt-2 text-[9px] text-zinc-500">{signal.conviction}</div>
          </div>
        );
      })}
    </div>
  );
}

function LiquidityRiskPulse({
  exposurePct,
  longCount,
  shortCount,
  avgPressure,
}: {
  exposurePct: number;
  longCount: number;
  shortCount: number;
  avgPressure: number;
}) {
  return (
    <div className="space-y-3">
      <Bar label="Liquidity Demand" value={Math.min(100, avgPressure)} tone="cyan" />
      <Bar label="Exposure Load" value={exposurePct} tone={exposurePct >= 80 ? "bad" : "good"} />
      <Bar label="Long Pressure" value={Math.min(100, longCount * 30)} tone="good" />
      <Bar label="Short Pressure" value={Math.min(100, shortCount * 30)} tone="bad" />

      <div className="grid grid-cols-3 gap-2">
        <RiskBox label="VOL" value="NORMAL" />
        <RiskBox label="LIQ" value="OK" />
        <RiskBox label="MODE" value="RISK-ON" />
      </div>
    </div>
  );
}

function FloatingActivityStream({ trades }: { trades: Trade[] }) {
  return (
    <div className="space-y-3">
      {trades.map((trade) => (
        <div key={trade.id} className="rounded-2xl border border-zinc-800 bg-[#09131d] p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-white">{trade.symbol}</div>
              <div className="text-[11px] text-zinc-500">{trade.strategy}</div>
            </div>

            <div
              className={`rounded-xl px-2 py-1 text-[10px] font-bold ${
                trade.side === "LONG"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-red-500/20 text-red-300"
              }`}
            >
              {trade.side}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Small label="ENTRY" value={money(trade.entry)} />
            <Small label="CONF" value={`%${trade.confidence}`} />
            <Small label="PNL" value={pct(trade.pnl)} tone={trade.pnl >= 0 ? "good" : "bad"} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AnimatedPnlPulse({
  trades,
  totalPnl,
}: {
  trades: Trade[];
  totalPnl: number;
}) {
  return (
    <div className="space-y-3">
      <MetricCard label="Net PnL Pulse" value={`${money(totalPnl)} ₺`} tone={totalPnl >= 0 ? "good" : "bad"} />

      {trades.slice(0, 5).map((trade) => (
        <div key={trade.id}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-zinc-400">{trade.symbol}</span>
            <span className={trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
              {pct(trade.pnl)}
            </span>
          </div>

          <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
            <div
              className={`h-full rounded-full ${trade.pnl >= 0 ? "bg-emerald-400" : "bg-red-400"}`}
              style={{ width: `${Math.min(100, Math.abs(trade.pnl) * 60)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AdaptiveSizingHierarchy({
  trades,
  signals,
  totalPnl,
  exposurePct,
}: {
  trades: Trade[];
  signals: EnrichedSignal[];
  totalPnl: number;
  exposurePct: number;
}) {
  const priority = signals[0];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <CommandCard
        title="Primary Action"
        value={priority?.symbol ?? "-"}
        subtitle={priority ? `${priority.side} · ${priority.conviction}` : "No signal"}
        tone="cyan"
      />

      <CommandCard
        title="Risk State"
        value={exposurePct >= 80 ? "ELEVATED" : "NORMAL"}
        subtitle={`Exposure %${exposurePct}`}
        tone={exposurePct >= 80 ? "warn" : "good"}
      />

      <CommandCard
        title="Position Policy"
        value={`${trades.length}/5`}
        subtitle="max open positions"
        tone={trades.length >= 5 ? "bad" : "good"}
      />

      <CommandCard
        title="PnL Command"
        value={totalPnl >= 0 ? "POSITIVE" : "NEGATIVE"}
        subtitle={`${money(totalPnl)} ₺`}
        tone={totalPnl >= 0 ? "good" : "bad"}
      />
    </div>
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
    <div className={`rounded-2xl border border-zinc-800 bg-[#070b12] p-4 ${className ?? ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.24em] text-cyan-300">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">Institutional asymmetric terminal system</p>
        </div>

        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold text-cyan-300">
          {badge}
        </span>
      </div>

      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "cyan" | "warn" | "purple";
}) {
  const colors = {
    good: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    bad: "border-red-500/20 bg-red-500/10 text-red-300",
    cyan: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
    warn: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    purple: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  };

  return (
    <div className={`rounded-2xl border p-3 ${colors[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
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
  const colors = {
    good: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    bad: "text-red-400 border-red-500/20 bg-red-500/5",
    warn: "text-amber-400 border-amber-500/20 bg-amber-500/5",
    cyan: "text-cyan-300 border-cyan-500/20 bg-cyan-500/5",
  };

  return (
    <div className={`rounded-xl border px-3 py-2 ${colors[tone]}`}>
      <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className="mt-1 text-base font-black">{value}</div>
      <div className="text-[10px] text-zinc-500">{detail}</div>
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
  const colors = {
    good: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    bad: "text-red-400 border-red-500/20 bg-red-500/5",
    warn: "text-amber-400 border-amber-500/20 bg-amber-500/5",
    cyan: "text-cyan-300 border-cyan-500/20 bg-cyan-500/5",
  };

  return (
    <div className={`rounded-2xl border p-4 ${colors[tone]}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{title}</div>
      <div className="mt-2 text-lg font-black">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>
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
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.round(value))}%` }} />
      </div>
    </div>
  );
}

function RiskBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0b1620] p-2">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function Small({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-white";

  return (
    <div>
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

function Badge({ value }: { value: Conviction }) {
  const classes =
    value === "ELITE"
      ? "bg-emerald-500/20 text-emerald-300"
      : value === "STRONG"
      ? "bg-cyan-500/20 text-cyan-300"
      : value === "TACTICAL"
      ? "bg-amber-500/20 text-amber-300"
      : "bg-red-500/20 text-red-300";

  return (
    <div className={`rounded-xl px-2 py-1 text-center text-[10px] font-bold ${classes}`}>
      {value}
    </div>
  );
}

function sideClass(side: string) {
  if (side === "LONG") return "text-emerald-400";
  if (side === "SHORT") return "text-red-400";
  return "text-zinc-400";
}

function money(value: number) {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function buildEquityPoints(trades: Trade[]) {
  if (!trades.length) return "0,140 860,140";

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
      const x = (index / Math.max(1, values.length - 1)) * 860;
      const y = 255 - ((value - min) / range) * 230;
      return `${x},${y}`;
    })
    .join(" ");
}