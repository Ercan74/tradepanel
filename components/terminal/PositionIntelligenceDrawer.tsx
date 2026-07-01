"use client";

/**
 * TIOS Terminal — Position Intelligence Drawer
 *
 * Presentation layer only.
 * Renders Position Intelligence + Decision Engine output for a single position.
 * Called from inside PositionLine when expanded.
 * No business logic here — all calculation is in lib/intelligence/.
 */

import {
  getPositionContext,
  toPositionIntelligenceInput,
  SuggestedAction,
  MomentumSignal,
  TrendStrength,
  getDecision,
  buildDecisionInput,
  DecisionAction,
  DecisionUrgency,
} from "@/lib/intelligence";
import { getGlobalContext } from "@/lib/intelligence/global/globalContext";
import { getPortfolioContext } from "@/lib/intelligence/portfolio/portfolioContext";
import { toPortfolioPositionInputs } from "@/lib/intelligence/portfolio/positionAdapter";
import { DEFAULT_MARKET_INPUT } from "@/lib/intelligence/global/defaultMarketInput";

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
  { label: string; icon: string; classes: string }
> = {
  HOLD:     { label: "TUT",    icon: "◈", classes: "bg-zinc-800/80 border-zinc-600 text-zinc-200"    },
  INCREASE: { label: "ARTIR",  icon: "▲", classes: "bg-emerald-900/60 border-emerald-500/50 text-emerald-200" },
  REDUCE:   { label: "AZALT",  icon: "▽", classes: "bg-amber-900/60 border-amber-500/50 text-amber-200"   },
  EXIT:     { label: "ÇIKIŞ",  icon: "✕", classes: "bg-red-900/60 border-red-500/50 text-red-200"         },
  WATCH:    { label: "İZLE",   icon: "◎", classes: "bg-cyan-900/60 border-cyan-500/50 text-cyan-200"       },
};

const DECISION_CONFIG: Record<
  DecisionAction,
  { label: string; icon: string; border: string; bg: string; text: string }
> = {
  INCREASE: { label: "ARTIR",  icon: "▲", border: "border-emerald-500/60", bg: "bg-emerald-900/50", text: "text-emerald-200" },
  HOLD:     { label: "TUT",    icon: "◈", border: "border-zinc-600",       bg: "bg-zinc-800/60",    text: "text-zinc-200"    },
  REDUCE:   { label: "AZALT",  icon: "▽", border: "border-amber-500/60",   bg: "bg-amber-900/50",   text: "text-amber-200"   },
  EXIT:     { label: "ÇIKIŞ",  icon: "✕", border: "border-red-500/60",     bg: "bg-red-900/60",     text: "text-red-200"     },
  WATCH:    { label: "İZLE",   icon: "◎", border: "border-cyan-500/60",    bg: "bg-cyan-900/50",    text: "text-cyan-200"    },
};

const URGENCY_CONFIG: Record<DecisionUrgency, { label: string; color: string }> = {
  IMMEDIATE: { label: "ACİL",    color: "text-red-400 font-black" },
  TODAY:     { label: "BUGÜN",   color: "text-amber-400 font-semibold" },
  MONITOR:   { label: "İZLE",    color: "text-cyan-400" },
  NONE:      { label: "",        color: "" },
};

const MOMENTUM_LABEL: Record<MomentumSignal, { label: string; color: string }> = {
  STRONG_UP:   { label: "Güçlü ↑",  color: "text-emerald-300" },
  UP:          { label: "Yükseliş", color: "text-emerald-400" },
  FLAT:        { label: "Yatay",    color: "text-zinc-400"    },
  DOWN:        { label: "Düşüş",    color: "text-red-400"     },
  STRONG_DOWN: { label: "Güçlü ↓",  color: "text-red-300"     },
};

const TREND_LABEL: Record<TrendStrength, { label: string; color: string }> = {
  STRONG:   { label: "Güçlü",      color: "text-emerald-300" },
  MODERATE: { label: "Orta",       color: "text-cyan-300"    },
  WEAK:     { label: "Zayıf",      color: "text-amber-300"   },
  STALLING: { label: "Duraksıyor", color: "text-red-300"     },
};

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1 w-full rounded-full bg-zinc-800">
      <div className={`h-1 rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

export default function PositionIntelligenceDrawer({
  row,
  allRows,
}: {
  row: PortfolioRowShape;
  allRows?: PortfolioRowShape[];
}) {
  const input = toPositionIntelligenceInput(row);
  const ctx = getPositionContext(input);
  const { value: m } = ctx;

  // Decision Engine — aggregates all signals
  const globalCtx = getGlobalContext(DEFAULT_MARKET_INPUT);
  const portfolioPositions = toPortfolioPositionInputs(allRows ?? [row]);
  const portfolioCtx = getPortfolioContext({
    positions: portfolioPositions,
    accountCapital: 100_000,
  });
  const decInput = buildDecisionInput({
    positionInput: input,
    globalContext: globalCtx,
    portfolioMetrics: portfolioCtx.value,
    positionMetrics: m,
  });
  const dec = getDecision(decInput);
  const decConf = DECISION_CONFIG[dec.value.action];
  const urgencyConf = URGENCY_CONFIG[dec.value.urgency];

  const action = ACTION_CONFIG[m.suggestedAction];
  const momentum = MOMENTUM_LABEL[m.momentum];
  const trend = TREND_LABEL[m.trendStrength];

  return (
    <div className="border-t border-white/5 bg-[#070b12]/80">
      {/* ── Decision Engine band ── */}
      <div className={`flex items-center justify-between px-4 py-3 border-b border-white/5 ${decConf.bg}`}>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${decConf.border}`}>
            <span className={`text-xl ${decConf.text}`}>{decConf.icon}</span>
            <div>
              <div className={`text-xs font-black tracking-widest ${decConf.text}`}>
                {decConf.label}
              </div>
              <div className="text-[9px] text-zinc-500">AI Kararı</div>
            </div>
          </div>
          <div className="space-y-0.5">
            <div className={`text-xs font-semibold ${decConf.text}`}>
              {dec.value.primaryReason}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              <span>Piyasa: {globalCtx.riskRegime}</span>
              <span>·</span>
              <span>Portföy: {portfolioCtx.value.heatLevel}</span>
              <span>·</span>
              <span>Conviction: {dec.value.convictionScore.toFixed(0)}/100</span>
              {urgencyConf.label && (
                <>
                  <span>·</span>
                  <span className={urgencyConf.color}>{urgencyConf.label}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-widest text-zinc-600">Güven</div>
          <div className={`text-sm font-black ${decConf.text}`}>{dec.value.confidence}</div>
        </div>
      </div>

      {/* ── Position Intelligence detail ── */}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-start px-4 py-3">
        <div className={`col-span-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${action.classes}`}>
          <span className="text-base">{action.icon}</span>
          <div>
            <span className="font-black tracking-widest">{action.label}</span>
            <span className="ml-2 opacity-60">pozisyon sinyali · güven {ctx.confidence.toFixed(0)}%</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Momentum</div>
          <div className={`text-xs font-semibold ${momentum.color}`}>{momentum.label}</div>
          <MiniBar value={m.momentumScore} color="bg-cyan-500" />
        </div>

        <div className="space-y-1">
          <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Trend Gücü</div>
          <div className={`text-xs font-semibold ${trend.color}`}>{trend.label}</div>
          <MiniBar value={m.trendStrengthScore} color="bg-purple-500" />
        </div>

        <div className="space-y-1">
          <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Dönüş İhtimali</div>
          <div className={`text-xs font-semibold ${m.reversalProbability >= 65 ? "text-red-300" : m.reversalProbability >= 40 ? "text-amber-300" : "text-zinc-300"}`}>
            %{m.reversalProbability.toFixed(0)}
          </div>
          <MiniBar value={m.reversalProbability} color="bg-red-500" />
        </div>

        {m.targetProgress !== null && (
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Hedefe İlerleme</div>
            <div className="text-xs font-semibold text-zinc-300">%{Math.max(0, m.targetProgress).toFixed(0)}</div>
            <MiniBar value={Math.max(0, m.targetProgress)} color="bg-emerald-500" />
          </div>
        )}

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
                {m.holdingDays < 1 ? `${(m.holdingDays * 24).toFixed(0)}s` : `${m.holdingDays.toFixed(0)}g`}
              </div>
            </div>
          )}
        </div>

        {(ctx.warnings.length > 0 || dec.warnings.length > 0) && (
          <div className="col-span-2 space-y-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            {[...dec.warnings, ...ctx.warnings].map((w, i) => (
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
