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

export default function VisualIntelligenceLayer({ signals }: Props) {
  const ranked = [...signals]
    .map((s) => ({
      ...s,
      intelligenceScore: s.score ?? getSignalScore(s),
      riskLevel: getRiskLevel(s),
    }))
    .sort((a, b) => b.intelligenceScore - a.intelligenceScore)
    .slice(0, 8);

  const longCount = signals.filter((s) => s.side === "LONG").length;
  const shortCount = signals.filter((s) => s.side === "SHORT").length;
  const highRiskCount = ranked.filter((s) => s.riskLevel === "HIGH").length;

  return (
    <section className="grid grid-cols-1 xl:grid-cols-12 gap-3">
      <div className="xl:col-span-4 rounded-xl border border-zinc-800 bg-[#080b12] p-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              Visual Intelligence
            </h2>
            <p className="text-sm text-zinc-300">Signal pressure map</p>
          </div>

          <div className="text-right">
            <p className="text-[10px] text-zinc-500 uppercase">Pulse</p>
            <p className="text-emerald-400 text-sm font-semibold">LIVE</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MiniMetric label="Long Bias" value={longCount} tone="emerald" />
          <MiniMetric label="Short Bias" value={shortCount} tone="red" />
          <MiniMetric label="High Risk" value={highRiskCount} tone="amber" />
        </div>

        <div className="mt-4 space-y-2">
          {ranked.slice(0, 5).map((signal) => (
            <div key={signal.id} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-300">{signal.symbol}</span>
                <span className={getSideClass(signal.side)}>{signal.side}</span>
              </div>

              <div className="h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-400"
                  style={{ width: `${signal.intelligenceScore}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>AI Score</span>
                <span>{signal.intelligenceScore}/100</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="xl:col-span-5 rounded-xl border border-zinc-800 bg-[#080b12] p-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              Scanner Ranking
            </h2>
            <p className="text-sm text-zinc-300">Best trade candidates</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-xs">
            <thead className="bg-zinc-950 text-zinc-500 uppercase">
              <tr>
                <th className="px-2 py-2 text-left">Symbol</th>
                <th className="px-2 py-2 text-left">Side</th>
                <th className="px-2 py-2 text-right">Price</th>
                <th className="px-2 py-2 text-right">PnL</th>
                <th className="px-2 py-2 text-right">Score</th>
                <th className="px-2 py-2 text-right">Risk</th>
              </tr>
            </thead>

            <tbody>
              {ranked.map((signal) => (
                <tr
                  key={signal.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900/60"
                >
                  <td className="px-2 py-2 font-medium text-zinc-200">
                    {signal.symbol}
                  </td>

                  <td className={`px-2 py-2 ${getSideClass(signal.side)}`}>
                    {signal.side}
                  </td>

                  <td className="px-2 py-2 text-right text-zinc-300">
                    {formatPrice(signal.price)}
                  </td>

                  <td
                    className={`px-2 py-2 text-right ${
                      (signal.pnlPct ?? 0) >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {formatPct(signal.pnlPct)}
                  </td>

                  <td className="px-2 py-2 text-right text-zinc-200">
                    {signal.intelligenceScore}
                  </td>

                  <td className="px-2 py-2 text-right">
                    <span
                      className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] ${getRiskClass(
                        signal.riskLevel
                      )}`}
                    >
                      {signal.riskLevel}
                    </span>
                  </td>
                </tr>
              ))}

              {ranked.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-zinc-500"
                  >
                    No realtime signals yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="xl:col-span-3 rounded-xl border border-zinc-800 bg-[#080b12] p-3">
        <div className="mb-3">
          <h2 className="text-xs uppercase tracking-[0.22em] text-zinc-500">
            Risk Matrix
          </h2>
          <p className="text-sm text-zinc-300">Exposure intelligence</p>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {ranked.map((signal) => (
            <div
              key={signal.id}
              className={`aspect-square rounded-lg border p-2 flex flex-col justify-between ${
                signal.riskLevel === "HIGH"
                  ? "border-red-500/30 bg-red-500/10"
                  : signal.riskLevel === "MEDIUM"
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-emerald-500/30 bg-emerald-500/10"
              }`}
            >
              <span className="text-[10px] text-zinc-300 truncate">
                {signal.symbol}
              </span>
              <span className={`text-[10px] ${getSideClass(signal.side)}`}>
                {signal.side}
              </span>
              <span className="text-xs font-semibold text-zinc-100">
                {signal.intelligenceScore}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "red" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-400"
      : tone === "red"
      ? "text-red-400"
      : "text-amber-400";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}