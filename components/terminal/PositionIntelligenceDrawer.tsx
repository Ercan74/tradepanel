"use client";

/**
 * TIOS Terminal — Position Intelligence Drawer
 *
 * Presentation layer only.
 * Renders the intelligence analysis for a single position.
 * Called from inside PositionLine when expanded.
 * No business logic here — all calculation is in lib/intelligence/position/.
 */

import {
  getPositionContext,
  toPositionIntelligenceInput,
  SuggestedAction,
  MomentumSignal,
  TrendStrength,
} from "@/lib/intelligence";

type PortfolioRowShape = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT" | "-";
  entry: number;
  current: number;
  stop: number;
  tp1: number;
  pnlPct: number;
  pnl: number;
  slDistancePct: number | null;
  age: string;
  score: number;
  allocated: number;
  qty: number;
};

const ACTION_CONFIG: Record<
  SuggestedAction,
  { label: string; classes: string; icon: string }
> = {
  HOLD:     { label: "TUTE",    icon: "◈", classes: "bg-zinc-800/80 border-zinc-600 text-zinc-200" },
  INCREASE: { label: "ARTIR",   icon: "▲", classes: "bg-emerald-900/60 border-emerald-500/50 text-emerald-200" },
  REDUCE:   { label: "AZALT",   icon: "▽", classes: "bg-amber-900/60 border-amber-500/50 text-amber-200" },
  EXIT:     { label: "ÇIKIŞ",   icon: "✕", classes: "bg-red-900/60 border-red-500/50 text-red-200" },
  WATCH:    { label: "İZLE",    icon: "◎", classes: "bg-cyan-900/60 border-cyan-500/50 text-cyan-200" },
};

const MOMENTUM_LABEL: Record<MomentumSignal, { label: string; color: string }> = {
  STRONG_UP:   { label: "Güçlü Yükseliş", color: "text-emerald-300" },
  UP:          { label: "Yükseliş",        color: "text-emerald-400" },
  FLAT:        { label: "Yatay",           color: "text-zinc-400"   },
  DOWN:        { label: "Düşüş",           color: "text-red-400"    },
  STRONG_DOWN: { label: "Güçlü Düşüş",    color: "text-red-300"    },
};

const TREND_LABEL: Record<TrendStrength, { label: string; color: string }> = {
  STRONG:   { label: "Güçlü",     color: "text-emerald-300" },
  MODERATE: { label: "Orta",      color: "text-cyan-300"    },
  WEAK:     { label: "Zayıf",     color: "text-amber-300"   },
  STALLING: { label: "Duraksıyor", color: "text-red-300"    },
};

function MiniBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="h-1 w-full rounded-full bg-zinc-800">
      <div
        className={`h-1 rounded-full ${color}`}
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  );
}

export default function PositionIntelligenceDrawer({ row }: { row: PortfolioRowShape }) {
  const input = toPositionIntelligenceInput(row);
  const ctx = getPositionContext(input);
  const { value: m } = ctx;

  const action = ACTION_CONFIG[m.suggestedAction];
  const momentum = MOMENTUM_LABEL[m.momentum];
  const trend = TREND_LABEL[m.trendStrength];

  return (
    <div className="border-t border-white/5 bg-[#070b12]/80 px-4 py-3">
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-start">

        {/* Suggested action badge */}
        <div
          className={`col-span-2 flex items-center gap-2 rounded-lg border px-3 py-2 ${action.classes}`}
        >
          <span className="text-base">{action.icon}</span>
          <div>
            <span className="text-xs font-black tracking-widest">{action.label}</span>
            <span className="ml-2 text-[10px] opacity-60">
              güven {ctx.confidence.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Momentum */}
        <div className="space-y-1">
          <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Momentum</div>
          <div className={`text-xs font-semibold ${momentum.color}`}>{momentum.label}</div>
          <MiniBar value={m.momentumScore} color="bg-cyan-500" />
        </div>

        {/* Trend */}
        <div className="space-y-1">
          <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Trend Gücü</div>
          <div className={`text-xs font-semibold ${trend.color}`}>{trend.label}</div>
          <MiniBar value={m.trendStrengthScore} color="bg-purple-500" />
        </div>

        {/* Reversal probability */}
        <div className="space-y-1">
          <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Dönüş İhtimali</div>
          <div className={`text-xs font-semibold ${
            m.reversalProbability >= 65 ? "text-red-300"
            : m.reversalProbability >= 40 ? "text-amber-300"
            : "text-zinc-300"
          }`}>
            %{m.reversalProbability.toFixed(0)}
          </div>
          <MiniBar value={m.reversalProbability} color="bg-red-500" />
        </div>

        {/* Target progress */}
        {m.targetProgress !== null && (
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Hedefe İlerleme</div>
            <div className="text-xs font-semibold text-zinc-300">
              %{Math.max(0, m.targetProgress).toFixed(0)}
            </div>
            <MiniBar
              value={Math.max(0, m.targetProgress)}
              color="bg-emerald-500"
            />
          </div>
        )}

        {/* R/R & Holding */}
        <div className="col-span-2 grid grid-cols-2 gap-3 border-t border-white/5 pt-2">
          {m.riskRewardCurrent !== null && (
            <div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Risk / Ödül</div>
              <div className="text-xs font-black text-zinc-200">{m.riskRewardCurrent.toFixed(1)}x</div>
            </div>
          )}
          {m.holdingDays !== null && (
            <div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Tutma Süresi</div>
              <div className="text-xs font-black text-zinc-200">
                {m.holdingDays < 1
                  ? `${(m.holdingDays * 24).toFixed(0)}s`
                  : `${m.holdingDays.toFixed(0)}g`}
              </div>
            </div>
          )}
        </div>

        {/* Warnings */}
        {ctx.warnings.length > 0 && (
          <div className="col-span-2 space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            {ctx.warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-1.5 text-[10px] text-amber-300">
                <span className="shrink-0">⚠</span>{w}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
