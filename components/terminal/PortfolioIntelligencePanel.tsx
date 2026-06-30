"use client";

import {
  getPortfolioContext,
  toPortfolioPositionInputs,
  PortfolioContext,
  PortfolioHeatLevel,
} from "@/lib/intelligence";
import { HEAT_LEVEL_THRESHOLDS } from "@/lib/intelligence/portfolio/constants";

type Props = {
  positions: unknown[];
  accountCapital: number;
};

const HEAT_BADGE: Record<PortfolioHeatLevel, { label: string; classes: string }> = {
  LOW: { label: "DÜŞÜK ISI", classes: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  MODERATE: { label: "ORTA ISI", classes: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300" },
  ELEVATED: { label: "YÜKSELEN ISI", classes: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  HIGH: { label: "YÜKSEK ISI", classes: "border-red-400/30 bg-red-400/10 text-red-300" },
};

function riskScoreColor(score: number): string {
  if (score >= HEAT_LEVEL_THRESHOLDS.HIGH) return "text-red-300";
  if (score >= HEAT_LEVEL_THRESHOLDS.ELEVATED) return "text-amber-300";
  if (score >= HEAT_LEVEL_THRESHOLDS.MODERATE) return "text-cyan-300";
  return "text-emerald-300";
}

export default function PortfolioIntelligencePanel({ positions, accountCapital }: Props) {
  const portfolioPositions = toPortfolioPositionInputs(positions);
  const context: PortfolioContext = getPortfolioContext({
    positions: portfolioPositions,
    accountCapital,
  });

  const { value: metrics } = context;
  const badge = HEAT_BADGE[metrics.heatLevel];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#070b12] p-4">
      {/* TEMP DEBUG BLOCK — remove after diagnosis */}
      <div className="mb-3 rounded-lg border border-red-500 bg-red-950/40 p-2 text-[10px] text-red-200 overflow-auto max-h-40">
        <div>raw positions[0] keys: {positions[0] ? Object.keys(positions[0] as object).join(", ") : "EMPTY"}</div>
        <div>raw positions[0].symbol: {String((positions[0] as any)?.symbol)}</div>
        <div>adapted[0]: {JSON.stringify(portfolioPositions[0])}</div>
      </div>
      {/* END TEMP DEBUG BLOCK */}

      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.24em] text-cyan-300">
            Portfolio Intelligence
          </h2>
          <p className="mt-1 text-[10px] text-zinc-500">
            {new Date(context.timestamp).toLocaleString("tr-TR")} ·{" "}
            {context.sources.join(", ")}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-widest ${badge.classes}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
            Portföy Risk Skoru
          </div>
          <div className={`mt-1 text-3xl font-black ${riskScoreColor(metrics.portfolioRiskScore)}`}>
            {metrics.portfolioRiskScore.toFixed(1)}
          </div>
          <div className="text-[9px] text-zinc-600">/ 100</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
            Çeşitlendirme
          </div>
          <div className="mt-1 text-3xl font-black text-cyan-300">
            {metrics.diversificationScore.toFixed(1)}
          </div>
          <div className="text-[9px] text-zinc-600">/ 100</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3">
          <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">
            Kullanılan Sermaye
          </div>
          <div className="mt-1 font-black text-zinc-100">
            %{metrics.cashUsagePct.toFixed(0)}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3">
          <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">
            Korelasyon Riski
          </div>
          <div className="mt-1 font-black text-zinc-100">
            {metrics.correlationScore.toFixed(0)}
          </div>
        </div>
      </div>

      {metrics.sectorExposure.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[9px] uppercase tracking-[0.18em] text-zinc-500">
            Sektör Dağılımı
          </div>
          <div className="space-y-1.5">
            {metrics.sectorExposure.slice(0, 5).map((s) => (
              <div key={s.sector} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[10px] text-zinc-400">
                  {s.sector}
                </span>
                <div className="h-1.5 flex-1 rounded-full bg-zinc-900">
                  <div
                    className="h-1.5 rounded-full bg-cyan-500"
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[10px] text-zinc-400">
                  %{s.pct.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {context.reasons.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[9px] uppercase tracking-[0.18em] text-zinc-500">
            Sinyaller
          </div>
          <ul className="space-y-1">
            {context.reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-400">
                <span className="mt-0.5 text-cyan-500">›</span>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {context.warnings.length > 0 && (
        <div className="mt-3 space-y-1 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          {context.warnings.map((warning, i) => (
            <p key={i} className="flex items-start gap-1.5 text-[11px] text-amber-300">
              <span className="shrink-0">⚠</span>
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
