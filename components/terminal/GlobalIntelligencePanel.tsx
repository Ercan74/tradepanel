"use client";

/**
 * TIOS Terminal — Global Intelligence Panel
 *
 * Presentation layer only.
 * This component calls getGlobalContext() and renders the result.
 * No business logic lives here — all intelligence is in lib/intelligence/.
 *
 * Default/mock inputs are imported from lib/intelligence/global/defaultMarketInput.ts.
 * When live market data is available, replace DEFAULT_MARKET_INPUT with the live feed.
 */

import {
  getGlobalContext,
  GlobalContext,
  RiskRegime,
  CONFIDENCE_DISPLAY_THRESHOLDS,
  RISK_REGIME_THRESHOLDS,
  DEFAULT_MARKET_INPUT,
} from "@/lib/intelligence";

// ---------------------------------------------------------------------------
// Display-only style maps. No business decisions here — only how to render
// values that the service has already decided.
// ---------------------------------------------------------------------------

const REGIME_BADGE: Record<RiskRegime, { label: string; classes: string }> = {
  RISK_ON: {
    label: "RISK ON",
    classes: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  },
  SELECTIVE_LONG: {
    label: "SEÇİCİ LONG",
    classes: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  },
  NEUTRAL: {
    label: "NÖTR",
    classes: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
  RISK_OFF: {
    label: "RISK OFF",
    classes: "border-red-400/30 bg-red-400/10 text-red-300",
  },
};

function confidenceColor(value: number): string {
  if (value >= CONFIDENCE_DISPLAY_THRESHOLDS.HIGH) return "bg-emerald-400";
  if (value >= CONFIDENCE_DISPLAY_THRESHOLDS.MODERATE) return "bg-cyan-400";
  if (value >= CONFIDENCE_DISPLAY_THRESHOLDS.LOW) return "bg-amber-400";
  return "bg-red-400";
}

function confidenceLabel(value: number): string {
  if (value >= CONFIDENCE_DISPLAY_THRESHOLDS.HIGH) return "Yüksek güven";
  if (value >= CONFIDENCE_DISPLAY_THRESHOLDS.MODERATE) return "Orta güven";
  if (value >= CONFIDENCE_DISPLAY_THRESHOLDS.LOW) return "Düşük güven";
  return "Veri yetersiz";
}

function scoreColor(score: number): string {
  if (score >= RISK_REGIME_THRESHOLDS.RISK_ON) return "text-emerald-300";
  if (score >= RISK_REGIME_THRESHOLDS.SELECTIVE_LONG) return "text-cyan-300";
  if (score >= RISK_REGIME_THRESHOLDS.NEUTRAL) return "text-amber-300";
  return "text-red-300";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function GlobalIntelligencePanel() {
  // All computation happens in lib/intelligence/global — this component
  // only renders the already-computed GlobalContext.
  const context: GlobalContext = getGlobalContext(DEFAULT_MARKET_INPUT);
  const badge = REGIME_BADGE[context.riskRegime];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#070b12] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.24em] text-cyan-300">
            Global Intelligence
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
            Market Skoru
          </div>
          <div className={`mt-1 text-3xl font-black ${scoreColor(context.marketScore)}`}>
            {context.marketScore.toFixed(1)}
          </div>
          <div className="text-[9px] text-zinc-600">/ 100</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
            Güven
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-zinc-900">
              <div
                className={`h-1.5 rounded-full ${confidenceColor(context.confidence)}`}
                style={{ width: `${context.confidence}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-zinc-400">
              {context.confidence.toFixed(0)}%
            </span>
          </div>
          <div className="mt-1 text-[9px] text-zinc-600">
            {confidenceLabel(context.confidence)}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3">
        <p className="text-xs leading-relaxed text-zinc-300">
          {context.commentary}
        </p>
      </div>

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
