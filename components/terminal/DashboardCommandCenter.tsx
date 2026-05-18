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

  return (
    <section className="space-y-3">
      <FloatingCommandCenter
        trades={trades}
        signals={enrichedSignals}
        totalPnl={totalPnl}
        avgAi={avgAi}
      />

      <LiveTickerTape trades={trades} signals={enrichedSignals} />

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-7" title="Command Center" badge="OPS">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricCard label="Market Pressure" value={`%${avgPressure.toFixed(0)}`} tone="good" />
            <MetricCard label="Scanner Dominance" value={`${signals.length}`} tone="cyan" />
            <MetricCard label="Risk Pulse" value="NORMAL" tone="warn" />
            <MetricCard label="Execution Flow" value="ACTIVE" tone="purple" />
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-white">AI Conviction Engine</div>
              <div className="text-[11px] text-zinc-500">Live institutional ranking</div>
            </div>

            <div className="space-y-2">
              {enrichedSignals.map((signal) => (
                <div
                  key={signal.id}
                  className="grid grid-cols-[1fr_70px_90px_80px] items-center gap-3 rounded-xl border border-zinc-800 bg-[#07111b] px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">{signal.symbol}</div>
                    <div className="text-[11px] text-zinc-500">
                      {signal.regime} · {signal.side}
                    </div>
                  </div>

                  <div className={sideClass(signal.side)}>{signal.side}</div>

                  <div>
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{ width: `${signal.aiScore}%` }}
                      />
                    </div>
                    <div className="mt-1 text-right text-[10px] text-zinc-400">
                      %{signal.aiScore}
                    </div>
                  </div>

                  <Badge value={signal.conviction} />
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel className="2xl:col-span-5" title="Realtime Activity" badge="LIVE">
          <RealtimeStream trades={trades} />

          <div className="mt-4 rounded-2xl border border-amber-500/10 bg-amber-500/5 p-3">
            <div className="mb-2 text-sm font-semibold text-amber-200">
              Liquidity / Risk Pulse
            </div>

            <div className="grid grid-cols-3 gap-2">
              <RiskBox label="VOLATILITY" value="NORMAL" />
              <RiskBox label="EXPOSURE" value={`%${Math.min(100, trades.length * 20)}`} />
              <RiskBox label="REGIME" value="RISK-ON" />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
        <Panel className="2xl:col-span-6" title="Live Equity Curve" badge="EQUITY">
          <EquityCurve trades={trades} />
        </Panel>

        <Panel className="2xl:col-span-3" title="Signal Heatmap" badge="HEAT">
          <Heatmap signals={enrichedSignals} />
        </Panel>

        <Panel className="2xl:col-span-3" title="Floating PnL" badge="PNL">
          <div className="grid grid-cols-3 gap-2">
            <MetricCard
              label="Total"
              value={`${money(totalPnl)} ₺`}
              tone={totalPnl >= 0 ? "good" : "bad"}
            />
            <MetricCard label="Win Rate" value={`%${winRate}`} tone="cyan" />
            <MetricCard label="W/L" value={`${winners}/${losers}`} tone="purple" />
          </div>
        </Panel>
      </div>
    </section>
  );
}

function FloatingCommandCenter({
  trades,
  signals,
  totalPnl,
  avgAi,
}: {
  trades: Trade[];
  signals: EnrichedSignal[];
  totalPnl: number;
  avgAi: number;
}) {
  const priority = signals[0];
  const exposure = trades.length >= 5 ? "MAXED" : trades.length >= 4 ? "ELEVATED" : "NORMAL";

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.035] p-3">
      <CommandChip
        label="Priority"
        value={priority ? priority.symbol : "-"}
        detail={priority ? `${priority.side} · ${priority.aiScore}` : "No signal"}
        tone="cyan"
      />
      <CommandChip label="System Risk" value="CLEAR" detail="cluster monitor" tone="good" />
      <CommandChip label="Exposure" value={exposure} detail={`${trades.length}/5 open`} tone="warn" />
      <CommandChip
        label="Terminal Pulse"
        value={totalPnl >= 0 ? "ONLINE +" : "ONLINE -"}
        detail={`AI ${avgAi.toFixed(0)}/100`}
        tone={totalPnl >= 0 ? "good" : "bad"}
      />
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
      value: pct(trade.pnl),
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
            <span className={item.tone === "good" ? "text-emerald-400" : "text-red-400"}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
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
          <p className="mt-1 text-sm text-zinc-500">Professional trading operating system</p>
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

function RealtimeStream({ trades }: { trades: Trade[] }) {
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

function EquityCurve({ trades }: { trades: Trade[] }) {
  const points = buildEquityPoints(trades);

  return (
    <div className="h-[220px] rounded-xl border border-zinc-800 bg-black/20 p-3">
      <svg viewBox="0 0 720 220" className="h-full w-full">
        <path d="M0 110 H720" stroke="rgba(148,163,184,.16)" strokeWidth="1" />
        <path d="M0 55 H720" stroke="rgba(148,163,184,.08)" strokeWidth="1" />
        <path d="M0 165 H720" stroke="rgba(148,163,184,.08)" strokeWidth="1" />
        <polyline fill="none" stroke="rgb(34,211,238)" strokeWidth="3" points={points} />
      </svg>
    </div>
  );
}

function Heatmap({ signals }: { signals: EnrichedSignal[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {signals.slice(0, 6).map((signal) => (
        <div
          key={signal.id}
          className={`rounded-xl border p-3 ${
            signal.riskLevel === "HIGH"
              ? "border-red-500/30 bg-red-500/10"
              : signal.riskLevel === "MEDIUM"
              ? "border-amber-500/30 bg-amber-500/10"
              : "border-emerald-500/30 bg-emerald-500/10"
          }`}
        >
          <div className="text-xs font-bold text-white">{signal.symbol}</div>
          <div className={`mt-1 text-[10px] ${sideClass(signal.side)}`}>{signal.side}</div>
          <div className="mt-3 h-1.5 rounded-full bg-zinc-900 overflow-hidden">
            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${signal.aiScore}%` }} />
          </div>
        </div>
      ))}
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