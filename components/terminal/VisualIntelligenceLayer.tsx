"use client";

import { TradingSignal } from "./types";
import {
  formatPct,
  formatPrice,
  getRiskClass,
  getRiskLevel,
  getSideClass,
  getSignalScore,
} from "./helpers";

type Props = {
  signals: TradingSignal[];
};

type EnrichedSignal = TradingSignal & {
  intelligenceScore: number;
  riskLevel: string;
};

export default function VisualIntelligenceLayer({ signals }: Props) {
  const enriched: EnrichedSignal[] = signals
    .map((signal) => ({
      ...signal,
      intelligenceScore: signal.score ?? getSignalScore(signal),
      riskLevel: getRiskLevel(signal),
    }))
    .sort((a, b) => b.intelligenceScore - a.intelligenceScore);

  const topSignals = enriched.slice(0, 6);

  const longCount = enriched.filter((s) => s.side === "LONG").length;
  const shortCount = enriched.filter((s) => s.side === "SHORT").length;
  const highRiskCount = enriched.filter((s) => s.riskLevel === "HIGH").length;

  const avgScore =
    enriched.length > 0
      ? Math.round(
          enriched.reduce((sum, s) => sum + s.intelligenceScore, 0) /
            enriched.length
        )
      : 0;

  const marketBias =
    longCount > shortCount
      ? "LONG BIAS"
      : shortCount > longCount
      ? "SHORT BIAS"
      : "BALANCED";

  const pressure =
    enriched.length > 0
      ? Math.min(100, Math.round((highRiskCount / enriched.length) * 100))
      : 0;

  return (
    <section className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
      <div className="2xl:col-span-3 rounded-2xl border border-cyan-500/20 bg-[#070b12] p-4 shadow-[0_0_40px_rgba(6,182,212,0.05)]">
        <Header
          title="Visual Intelligence"
          subtitle="Realtime signal pressure"
          badge="LIVE"
        />

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Metric label="Bias" value={marketBias} />
          <Metric label="Avg Score" value={`${avgScore}/100`} />
          <Metric label="Long" value={longCount} tone="long" />
          <Metric label="Short" value={shortCount} tone="short" />
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-black/20 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">Risk Pressure</span>
            <span className="text-amber-300">{pressure}%</span>
          </div>

          <div className="mt-3 h-2 rounded-full bg-zinc-900 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-400"
              style={{ width: `${pressure}%` }}
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
            <MiniStat label="Signals" value={enriched.length} />
            <MiniStat label="High Risk" value={highRiskCount} />
            <MiniStat label="Mode" value="ACTIVE" />
          </div>
        </div>
      </div>

      <div className="2xl:col-span-6 rounded-2xl border border-zinc-800 bg-[#070b12] p-4">
        <Header
          title="Scanner Ranking"
          subtitle="Institutional signal priority"
          badge="AI SCORE"
        />

        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full table-fixed text-xs">
            <thead className="bg-zinc-950/80 text-zinc-500 uppercase tracking-[0.16em]">
              <tr>
                <th className="w-[18%] px-3 py-3 text-left">Symbol</th>
                <th className="w-[14%] px-3 py-3 text-left">Side</th>
                <th className="w-[16%] px-3 py-3 text-right">Price</th>
                <th className="w-[16%] px-3 py-3 text-right">PnL</th>
                <th className="w-[22%] px-3 py-3 text-right">Score</th>
                <th className="w-[14%] px-3 py-3 text-right">Risk</th>
              </tr>
            </thead>

            <tbody>
              {topSignals.map((signal) => (
                <tr
                  key={signal.id}
                  className="border-t border-zinc-800 bg-zinc-950/20 hover:bg-zinc-900/60"
                >
                  <td className="px-3 py-3 font-semibold text-zinc-100 truncate">
                    {signal.symbol}
                  </td>

                  <td className={`px-3 py-3 font-semibold ${getSideClass(signal.side)}`}>
                    {signal.side}
                  </td>

                  <td className="px-3 py-3 text-right text-zinc-300">
                    {formatPrice(signal.price)}
                  </td>

                  <td
                    className={`px-3 py-3 text-right font-semibold ${
                      (signal.pnlPct ?? 0) >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {formatPct(signal.pnlPct)}
                  </td>

                  <td className="px-3 py-3 text-right">
                    <div className="ml-auto flex max-w-[120px] items-center justify-end gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-cyan-400"
                          style={{ width: `${signal.intelligenceScore}%` }}
                        />
                      </div>
                      <span className="min-w-[24px] text-right text-zinc-100">
                        {signal.intelligenceScore}
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-3 text-right">
                    <span
                      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold ${getRiskClass(
                        signal.riskLevel
                      )}`}
                    >
                      {signal.riskLevel}
                    </span>
                  </td>
                </tr>
              ))}

              {topSignals.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-zinc-500">
                    No realtime signals yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="2xl:col-span-3 rounded-2xl border border-zinc-800 bg-[#070b12] p-4">
        <Header
          title="Risk Matrix"
          subtitle="Exposure intelligence map"
          badge="MATRIX"
        />

        <div className="mt-4 grid grid-cols-2 gap-2">
          {topSignals.map((signal) => (
            <RiskTile key={signal.id} signal={signal} />
          ))}

          {topSignals.length === 0 && (
            <div className="col-span-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-6 text-center text-sm text-zinc-500">
              Waiting for signals...
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RiskTile({ signal }: { signal: EnrichedSignal }) {
  const bgClass =
    signal.riskLevel === "HIGH"
      ? "border-red-500/30 bg-red-500/10"
      : signal.riskLevel === "MEDIUM"
      ? "border-amber-500/30 bg-amber-500/10"
      : "border-emerald-500/30 bg-emerald-500/10";

  return (
    <div
      className={`rounded-xl border p-3 min-h-[86px] flex flex-col justify-between ${bgClass}`}
    >
      <div>
        <div className="text-xs font-semibold text-zinc-100 truncate">
          {signal.symbol}
        </div>
        <div className={`mt-1 text-[10px] ${getSideClass(signal.side)}`}>
          {signal.side}
        </div>
      </div>

      <div className="flex items-end justify-between">
        <span className="text-lg font-bold text-zinc-100">
          {signal.intelligenceScore}
        </span>
        <span className="text-[9px] text-zinc-500">{signal.riskLevel}</span>
      </div>
    </div>
  );
}

function Header({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-xs uppercase tracking-[0.24em] text-cyan-300">
          {title}
        </h2>
        <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
      </div>

      <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold text-cyan-300">
        {badge}
      </span>
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
  tone?: "neutral" | "long" | "short";
}) {
  const toneClass =
    tone === "long"
      ? "text-emerald-400"
      : tone === "short"
      ? "text-red-400"
      : "text-zinc-100";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div className={`mt-2 text-sm font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
      <div className="text-[9px] uppercase text-zinc-500">{label}</div>
      <div className="mt-1 text-xs font-semibold text-zinc-200">{value}</div>
    </div>
  );
}