"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TerminalSidebar from "@/components/terminal/TerminalSidebar";
import { createClient } from "@supabase/supabase-js";
import { getPositionContext, toPositionIntelligenceInput, SuggestedAction, MomentumSignal, TrendStrength } from "@/lib/intelligence";

type PositionRow = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT" | string;
  status: string;
  entry_price: number | null;
  exit_price: number | null;
  close_price: number | null;
  current_price: number | null;
  tp_price: number | null;
  sl_price: number | null;
  quantity: number | null;
  notional: number | null;
  allocated_amount: number | null;
  tp1_price: number | null;
  stop_price: number | null;
  trailing_stop_price: number | null;
  remaining_quantity: number | null;
  realized_partial_amount: number | null;
  trailing_stage: string | null;
  risk_state: string | null;
  tp1_hit: boolean | null;
  pnl_amount: number | null;
  pnl_pct: number | null;
  close_reason: string | null;
  strategy_tag: string | null;
  timeframe: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string | null;
};

type LivePriceRow = {
  symbol: string;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  last_price: number | null;
  last_trade_time: string | null;
  matriks_trade_time: string | null;
  updated_at: string | null;
  source: string | null;
  delay_note: string | null;
  is_stale: boolean | null;
};

type EnrichedPosition = PositionRow & {
  live?: LivePriceRow;
  calculated_current: number | null;
  calculated_quantity: number;
  calculated_allocated_amount: number;
  calculated_pnl_amount: number;
  calculated_pnl_pct: number;
  data_source: string;
  calculated_stop: number | null;
  calculated_tp1: number | null;
  calculated_remaining_quantity: number;
  calculated_realized_partial: number;
  calculated_age_label: string;
  calculated_age_minutes: number;
  calculated_risk_label: string;
  calculated_risk_pct: number;
  calculated_locked_profit_pct: number;
  calculated_locked_profit_amount: number;
};

const ACCOUNT_CAPITAL = 100_000;
const MAX_OPEN_POSITIONS = 10;
const POSITION_BUDGET = 10_000;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function PositionsPage() {
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [livePrices, setLivePrices] = useState<LivePriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"OPEN" | "CLOSED" | "ALL">("OPEN");

  async function loadData() {
    setLoading(true);

    const [positionsResult, livePricesResult] = await Promise.all([
      supabase
        .from("positions")
        .select("*")
        .order("opened_at", { ascending: false }),
      supabase
        .from("live_prices")
        .select("*")
        .order("updated_at", { ascending: false }),
    ]);

    if (!positionsResult.error) {
      setRows((positionsResult.data ?? []) as PositionRow[]);
    }

    if (!livePricesResult.error) {
      setLivePrices((livePricesResult.data ?? []) as LivePriceRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("positions-page-live-v4")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "positions" },
        loadData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_prices" },
        loadData,
      )
      .subscribe();

    const poll = window.setInterval(loadData, 10000);

    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  const liveMap = useMemo(() => {
    const map = new Map<string, LivePriceRow>();
    livePrices.forEach((row) => map.set(cleanSymbol(row.symbol), row));
    return map;
  }, [livePrices]);

  const enrichedRows: EnrichedPosition[] = useMemo(() => {
    return rows.map((row) => {
      const live = liveMap.get(cleanSymbol(row.symbol));
      const status = String(row.status ?? "").toUpperCase();
      const livePrice = positiveNumber(live?.last_price);
      const fallbackExit =
        row.exit_price ?? row.close_price ?? row.current_price;
      const current =
        status === "OPEN"
          ? (livePrice ?? row.current_price ?? row.entry_price)
          : fallbackExit;
      const quantity = Math.max(0, number(row.quantity));
      const safeQuantity = quantity || 1;
      const allocatedAmount = number(
        row.allocated_amount ??
          row.notional ??
          number(row.entry_price) * safeQuantity,
      );

      const pnlAmount =
        status === "CLOSED" &&
        row.pnl_amount !== null &&
        row.pnl_amount !== undefined
          ? number(row.pnl_amount)
          : calcPnlAmount(row.side, row.entry_price, current, safeQuantity);

      const pnlPct =
        status === "CLOSED" && row.pnl_pct !== null && row.pnl_pct !== undefined
          ? number(row.pnl_pct)
          : calcPnlPct(row.side, row.entry_price, current);

      const stop = row.trailing_stop_price ?? row.stop_price ?? row.sl_price;
      const ageSource =
        status === "CLOSED"
          ? (row.closed_at ?? row.opened_at ?? row.created_at)
          : (row.opened_at ?? row.created_at);
      const ageInfo = ageLabel(ageSource);
      const riskPct = calcRiskPct(row.side, current, stop);
      const lockedPct = calcLockedProfitPct(row.side, row.entry_price, stop);
      const remainingQty = Math.max(
        0,
        number(row.remaining_quantity ?? safeQuantity),
      );
      const lockedAmount = calcLockedProfitAmount(
        row.side,
        row.entry_price,
        stop,
        remainingQty,
      );

      return {
        ...row,
        live,
        calculated_current: current,
        calculated_quantity: safeQuantity,
        calculated_allocated_amount: allocatedAmount,
        calculated_pnl_amount: pnlAmount,
        calculated_pnl_pct: pnlPct,
        data_source: livePrice
          ? (live?.source ?? "MATRIKS_DDE")
          : "NO_LIVE_PRICE",
        calculated_stop: stop,
        calculated_tp1: row.tp1_price ?? row.tp_price,
        calculated_remaining_quantity: remainingQty,
        calculated_realized_partial: number(row.realized_partial_amount),
        calculated_age_label: ageInfo.label,
        calculated_age_minutes: ageInfo.minutes,
        calculated_risk_label: riskLabel(
          row.side,
          row.entry_price,
          current,
          row.trailing_stage,
          row.status,
        ),
        calculated_risk_pct: riskPct,
        calculated_locked_profit_pct: lockedPct,
        calculated_locked_profit_amount: lockedAmount,
      };
    });
  }, [liveMap, rows]);

  const openRows = enrichedRows.filter(
    (r) => String(r.status).toUpperCase() === "OPEN",
  );
  const closedRows = enrichedRows.filter(
    (r) => String(r.status).toUpperCase() === "CLOSED",
  );
  const visibleRows =
    view === "OPEN" ? openRows : view === "CLOSED" ? closedRows : enrichedRows;

  const openPnl = openRows.reduce(
    (sum, r) => sum + number(r.calculated_pnl_amount),
    0,
  );
  const realizedPnl = closedRows.reduce(
    (sum, r) => sum + number(r.calculated_pnl_amount),
    0,
  );
  const winners = closedRows.filter(
    (r) => number(r.calculated_pnl_amount) > 0,
  ).length;
  const winRate = closedRows.length
    ? Math.round((winners / closedRows.length) * 100)
    : 0;
  const exposurePct = Math.min(
    100,
    Math.round((openRows.length / MAX_OPEN_POSITIONS) * 100),
  );
  const allocatedTotal = openRows.reduce(
    (sum, r) => sum + number(r.calculated_allocated_amount),
    0,
  );
  const longCount = openRows.filter(
    (r) => String(r.side).toUpperCase() === "LONG",
  ).length;
  const shortCount = openRows.filter(
    (r) => String(r.side).toUpperCase() === "SHORT",
  ).length;
  const trailActive = openRows.filter(
    (r) => String(r.trailing_stage ?? "INITIAL").toUpperCase() !== "INITIAL",
  ).length;
  const staleCount = openRows.filter(
    (r) => r.data_source === "NO_LIVE_PRICE",
  ).length;
  const bestOpen = getBestPosition(openRows);
  const worstOpen = getWorstPosition(openRows);

  return (
    <main className="flex min-h-screen bg-[#03050a] text-zinc-100">
      <TerminalSidebar />
      <div className="min-w-0 flex-1 p-5">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-300">
            Position Intelligence Center V2
          </div>
          <h1 className="mt-2 text-3xl font-black">Open & Closed Positions</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sermaye: {money(ACCOUNT_CAPITAL)} TL · Max pozisyon:{" "}
            {MAX_OPEN_POSITIONS} · Pozisyon başı hedef: {money(POSITION_BUDGET)}{" "}
            TL · Ana fiyat: Matriks DDE last_price.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-bold text-cyan-300"
        >
          Back to Dashboard
        </Link>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-8">
        <Metric
          label="Open"
          value={`${openRows.length}/${MAX_OPEN_POSITIONS}`}
          tone={openRows.length >= MAX_OPEN_POSITIONS ? "bad" : "cyan"}
        />
        <Metric
          label="Open PnL"
          value={`${money(openPnl)} ₺`}
          tone={openPnl >= 0 ? "good" : "bad"}
        />
        <Metric
          label="Allocated"
          value={`${money(allocatedTotal)} ₺`}
          tone="neutral"
        />
        <Metric
          label="Exposure"
          value={`%${exposurePct}`}
          tone={exposurePct >= 100 ? "bad" : "cyan"}
        />
        <PositionMetric
          label="Best"
          symbol={bestOpen ? cleanSymbol(bestOpen.symbol) : "-"}
          value={bestOpen ? signedPct(bestOpen.calculated_pnl_pct) : "-"}
          tone="good"
        />
        <PositionMetric
          label="Worst"
          symbol={worstOpen ? cleanSymbol(worstOpen.symbol) : "-"}
          value={worstOpen ? signedPct(worstOpen.calculated_pnl_pct) : "-"}
          tone={
            worstOpen && worstOpen.calculated_pnl_pct < 0 ? "bad" : "neutral"
          }
        />
        <Metric
          label="Realized"
          value={`${money(realizedPnl)} ₺`}
          tone={realizedPnl >= 0 ? "good" : "bad"}
        />
        <Metric label="Win Rate" value={`%${winRate}`} tone="cyan" />
      </section>

      <section className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["OPEN", "CLOSED", "ALL"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setView(item)}
              className={`rounded-xl border px-4 py-2 text-xs font-black ${
                view === item
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                  : "border-white/10 bg-white/[0.03] text-zinc-400"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Pill label={`Long ${longCount}`} tone="good" />
          <Pill label={`Short ${shortCount}`} tone="bad" />
          <Pill label={`Trail ${trailActive}`} tone="warn" />
          <Pill
            label={`No Live ${staleCount}`}
            tone={staleCount ? "warn" : "good"}
          />
          <Pill label={`Live ${livePrices.length}`} tone="neutral" />
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#050812] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-300">
            Position Lifecycle Feed
          </div>
          <div className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-300">
            {view} / {visibleRows.length}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 p-6 text-sm text-zinc-500">
            Loading positions...
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 p-6 text-sm text-zinc-500">
            No positions found.
          </div>
        ) : (
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-2">
            {visibleRows.map((row) => (
              <PositionCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </section>
      </div>
    </main>
  );
}

function PositionCard({ row }: { row: EnrichedPosition }) {
  const [expanded, setExpanded] = useState(false);
  const status = String(row.status ?? "-").toUpperCase();
  const pnlAmount = number(row.calculated_pnl_amount);
  const pnlPct = number(row.calculated_pnl_pct);
  const isProfit = pnlAmount >= 0;
  const hasLive = row.data_source !== "NO_LIVE_PRICE";
  const trailStage = String(row.trailing_stage ?? "INITIAL").toUpperCase();
  const lifecycleBadges = buildLifecycleBadges(row);

  // --- Position Intelligence ---
  const side = (row.side === "LONG" || row.side === "SHORT") ? row.side : "-" as "LONG" | "SHORT" | "-";
  const intelligenceInput = toPositionIntelligenceInput({
    id: row.id,
    symbol: cleanSymbol(row.symbol),
    side,
    entry: number(row.entry_price),
    current: number(row.calculated_current),
    stop: number(row.calculated_stop),
    tp1: number(row.calculated_tp1),
    pnlPct: row.calculated_pnl_pct ?? 0,
    pnl: row.calculated_pnl_amount ?? 0,
    slDistancePct: row.calculated_risk_pct > 0 ? row.calculated_risk_pct : null,
    age: row.calculated_age_label,
    score: 80,
    allocated: row.calculated_allocated_amount,
    qty: row.calculated_quantity,
  });
  const intel = getPositionContext(intelligenceInput);
  const m = intel.value;

  const ACTION_CONFIG: Record<SuggestedAction, { label: string; icon: string; border: string; bg: string; text: string }> = {
    HOLD:     { label: "TUT",    icon: "◈", border: "border-zinc-600",       bg: "bg-zinc-800/60",       text: "text-zinc-200"    },
    INCREASE: { label: "ARTIR",  icon: "▲", border: "border-emerald-500/50", bg: "bg-emerald-900/40",    text: "text-emerald-200" },
    REDUCE:   { label: "AZALT",  icon: "▽", border: "border-amber-500/50",   bg: "bg-amber-900/40",      text: "text-amber-200"   },
    EXIT:     { label: "ÇIKIŞ",  icon: "✕", border: "border-red-500/50",     bg: "bg-red-900/50",        text: "text-red-200"     },
    WATCH:    { label: "İZLE",   icon: "◎", border: "border-cyan-500/50",    bg: "bg-cyan-900/40",       text: "text-cyan-200"    },
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
  const action = ACTION_CONFIG[m.suggestedAction];
  const momentum = MOMENTUM_LABEL[m.momentum];
  const trend = TREND_LABEL[m.trendStrength];

  // Exit scenarios
  const tpGain = row.calculated_tp1 && row.entry_price
    ? Math.abs((row.calculated_tp1 - number(row.entry_price)) / number(row.entry_price) * row.calculated_allocated_amount)
    : null;
  const stopLoss = row.calculated_stop && row.entry_price
    ? Math.abs((number(row.entry_price) - row.calculated_stop) / number(row.entry_price) * row.calculated_allocated_amount)
    : null;

  return (
    <article className="rounded-2xl border border-white/10 bg-[#070b18] overflow-hidden transition hover:border-cyan-400/20">
      {/* Intelligence header strip — sadece AÇIK pozisyonlarda; kapalıda kapanış özeti */}
      {status === "OPEN" ? (
        <div className={`flex items-center justify-between px-4 py-2.5 border-b border-white/5 ${action.bg}`}>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${action.border} ${action.bg}`}>
              <span className={`text-base ${action.text}`}>{action.icon}</span>
              <span className={`text-sm font-black tracking-widest ${action.text}`}>{action.label}</span>
            </div>
            <div className="flex gap-4 text-xs">
              <span className={momentum.color}>{momentum.label}</span>
              <span className="text-zinc-600">·</span>
              <span className={trend.color}>{trend.label}</span>
              <span className="text-zinc-600">·</span>
              <span className={m.reversalProbability >= 65 ? "text-red-300" : m.reversalProbability >= 40 ? "text-amber-300" : "text-zinc-400"}>
                Dönüş %{m.reversalProbability.toFixed(0)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {intel.warnings.length > 0 && (
              <span className="text-[10px] text-amber-300 font-semibold">⚠ {intel.warnings[0]}</span>
            )}
            <span className="text-[10px] text-zinc-600">güven {intel.confidence.toFixed(0)}%</span>
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-[10px] text-zinc-500 hover:text-cyan-400 transition"
            >
              {expanded ? "▲ gizle" : "▼ detay"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-zinc-900/30">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`rounded-lg border px-3 py-1.5 text-sm font-black tracking-widest ${isProfit ? "border-emerald-500/40 bg-emerald-900/20 text-emerald-300" : "border-red-500/40 bg-red-900/30 text-red-300"}`}>
              KAPANDI {money(pnlAmount)} ₺
            </span>
            <span className="truncate text-xs text-zinc-400">{row.close_reason ?? "-"}</span>
          </div>
          <span className="shrink-0 text-[10px] text-zinc-600">{date(row.closed_at ?? null)}</span>
        </div>
      )}

      {/* Main row — ham veriler */}
      <div className="grid grid-cols-[220px_72px_repeat(7,minmax(88px,1fr))_150px] items-center gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-xl font-black text-white">
              {cleanSymbol(row.symbol)}
            </h2>
            <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${statusClass(status)}`}>
              {status}
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {row.strategy_tag ?? "EMA100_PRO"} · TF {row.timeframe ?? "-"} · {row.calculated_age_label}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lifecycleBadges.map((badge) => (
              <span key={badge.label} className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${badge.cls}`}>
                {badge.label}
              </span>
            ))}
          </div>
        </div>

        <div className={sideClass(row.side)}>{row.side}</div>
        <ValueBlock label="Entry" value={price(row.entry_price)} />
        <ValueBlock label="Current" value={price(row.calculated_current)} tone={hasLive ? "cyan" : "warn"} />
        <ValueBlock label="PnL ₺" value={`${money(pnlAmount)} ₺`} tone={isProfit ? "good" : "bad"} />
        <ValueBlock label="PnL %" value={signedPct(pnlPct)} tone={pnlPct >= 0 ? "good" : "bad"} />
        {status === "OPEN" ? (
          <>
            <ValueBlock label="Risk" value={plainPct(Math.abs(row.calculated_risk_pct))} tone={Math.abs(row.calculated_risk_pct) >= 3 ? "bad" : Math.abs(row.calculated_risk_pct) > 0 ? "warn" : "neutral"} />
            <ValueBlock label="Locked" value={plainPct(row.calculated_locked_profit_pct)} tone={row.calculated_locked_profit_pct > 0 ? "good" : "neutral"} />
          </>
        ) : (
          <>
            <ValueBlock label="Exit" value={price(row.exit_price ?? row.close_price ?? row.calculated_current)} />
            <ValueBlock label="Sebep" value={shortCloseReason(row.close_reason)} />
          </>
        )}
        <ValueBlock label="Allocated" value={`${money(row.calculated_allocated_amount)} ₺`} />
        <TrailBlock value={trailStage} />
      </div>

      {/* Alt satır — TP/Stop/Lot/Live */}
      <div className="grid grid-cols-[repeat(5,minmax(92px,1fr))_1.4fr_1.4fr] gap-2 px-4 pb-3 text-xs">
        <Mini label="Lot" value={integer(row.calculated_quantity)} />
        <Mini label="Remain" value={integer(row.calculated_remaining_quantity)} />
        <Mini label="TP1" value={price(row.calculated_tp1)} tone={row.tp1_hit ? "good" : "neutral"} />
        <Mini label="Stop" value={price(row.calculated_stop)} tone={row.calculated_locked_profit_pct > 0 ? "good" : "neutral"} />
        {status === "OPEN" ? (
          <Mini label="Locked ₺" value={`${money(row.calculated_locked_profit_amount)} ₺`} tone={row.calculated_locked_profit_amount > 0 ? "good" : "neutral"} />
        ) : (
          <Mini label="Realized ₺" value={`${money(row.calculated_realized_partial)} ₺`} tone={row.calculated_realized_partial > 0 ? "good" : "neutral"} />
        )}
        <InfoLine label="Live" value={date(row.live?.matriks_trade_time ?? null)} />
        <InfoLine label="Data" value={`${row.data_source}${row.close_reason ? ` · ${row.close_reason}` : ""}`} tone={hasLive ? "neutral" : "warn"} />
      </div>

      {/* Expandable intelligence detay */}
      {expanded && (
        <div className="border-t border-white/5 bg-[#050810] px-4 py-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {/* Momentum bar */}
            <div className="space-y-1.5">
              <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Momentum</div>
              <div className={`text-sm font-bold ${momentum.color}`}>{momentum.label}</div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800">
                <div className="h-1.5 rounded-full bg-cyan-500" style={{ width: `${m.momentumScore}%` }} />
              </div>
            </div>
            {/* Trend strength */}
            <div className="space-y-1.5">
              <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Trend Gücü</div>
              <div className={`text-sm font-bold ${trend.color}`}>{trend.label}</div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800">
                <div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${m.trendStrengthScore}%` }} />
              </div>
            </div>
            {/* Reversal */}
            <div className="space-y-1.5">
              <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Dönüş İhtimali</div>
              <div className={`text-sm font-bold ${m.reversalProbability >= 65 ? "text-red-300" : m.reversalProbability >= 40 ? "text-amber-300" : "text-zinc-300"}`}>
                %{m.reversalProbability.toFixed(0)}
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800">
                <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${m.reversalProbability}%` }} />
              </div>
            </div>
            {/* Target progress */}
            {m.targetProgress !== null && (
              <div className="space-y-1.5">
                <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Hedefe İlerleme</div>
                <div className="text-sm font-bold text-zinc-300">%{Math.max(0, m.targetProgress).toFixed(0)}</div>
                <div className="h-1.5 w-full rounded-full bg-zinc-800">
                  <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, m.targetProgress))}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Exit scenarios + R/R */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {m.riskRewardCurrent !== null && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Risk / Ödül</div>
                <div className="mt-1 text-lg font-black text-zinc-100">{m.riskRewardCurrent.toFixed(1)}x</div>
              </div>
            )}
            {m.holdingDays !== null && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Tutma Süresi</div>
                <div className="mt-1 text-lg font-black text-zinc-100">
                  {m.holdingDays < 1 ? `${(m.holdingDays * 24).toFixed(0)}s` : `${m.holdingDays.toFixed(0)}g`}
                </div>
              </div>
            )}
            {tpGain !== null && (
              <div className="rounded-xl border border-emerald-800/40 bg-emerald-900/20 p-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">TP Senaryosu</div>
                <div className="mt-1 text-lg font-black text-emerald-300">+{money(tpGain)} ₺</div>
              </div>
            )}
            {stopLoss !== null && (
              <div className="rounded-xl border border-red-800/40 bg-red-900/20 p-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Stop Senaryosu</div>
                <div className="mt-1 text-lg font-black text-red-300">-{money(stopLoss)} ₺</div>
              </div>
            )}
          </div>

          {/* Pozisyon Sağlık Skoru */}
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Pozisyon Sağlık Skoru</div>
              <div className={`text-sm font-black ${
                m.momentumScore >= 60 && m.trendStrengthScore >= 50 && m.reversalProbability < 40
                  ? "text-emerald-300" : m.reversalProbability >= 65 || m.stopProximityRisk === "CRITICAL"
                  ? "text-red-300" : "text-amber-300"
              }`}>
                {m.momentumScore >= 60 && m.trendStrengthScore >= 50 && m.reversalProbability < 40
                  ? "GÜÇLÜ" : m.reversalProbability >= 65 || m.stopProximityRisk === "CRITICAL"
                  ? "DİKKAT" : "NÖTR"}
              </div>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-zinc-800">
              <div
                className={`h-2 rounded-full ${
                  m.momentumScore >= 60 ? "bg-emerald-500" : m.reversalProbability >= 65 ? "bg-red-500" : "bg-amber-500"
                }`}
                style={{ width: `${Math.round((m.momentumScore * 0.35 + m.trendStrengthScore * 0.35 + (100 - m.reversalProbability) * 0.3))}%` }}
              />
            </div>
          </div>

          {/* Sinyaller */}
          {intel.reasons.length > 0 && (
            <div className="mt-3 space-y-1">
              {intel.reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-400">
                  <span className="text-cyan-600">›</span>{r}
                </div>
              ))}
            </div>
          )}

          {/* Uyarılar */}
          {intel.warnings.length > 0 && (
            <div className="mt-3 space-y-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              {intel.warnings.map((w, i) => (
                <p key={i} className="flex items-start gap-1.5 text-[11px] text-amber-300">
                  <span>⚠</span>{w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}


function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "cyan" | "neutral";
}) {
  const cls = {
    good: "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300",
    bad: "border-red-400/20 bg-red-400/[0.08] text-red-300",
    cyan: "border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-300",
    neutral: "border-white/10 bg-white/[0.04] text-zinc-300",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="text-[10px] uppercase tracking-[0.22em] opacity-60">
        {label}
      </div>
      <div className="mt-2 truncate text-xl font-black" title={value}>
        {value}
      </div>
    </div>
  );
}

function PositionMetric({
  label,
  symbol,
  value,
  tone,
}: {
  label: string;
  symbol: string;
  value: string;
  tone: "good" | "bad" | "neutral";
}) {
  const cls = {
    good: "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300",
    bad: "border-red-400/20 bg-red-400/[0.08] text-red-300",
    neutral: "border-white/10 bg-white/[0.04] text-zinc-300",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="text-[10px] uppercase tracking-[0.22em] opacity-60">
        {label}
      </div>
      <div className="mt-1 truncate text-lg font-black" title={symbol}>
        {symbol}
      </div>
      <div className="text-base font-black" title={value}>
        {value}
      </div>
    </div>
  );
}

function ValueBlock({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "cyan" | "warn" | "neutral";
}) {
  const cls = {
    good: "text-emerald-300",
    bad: "text-red-300",
    cyan: "text-cyan-200",
    warn: "text-amber-300",
    neutral: "text-zinc-100",
  }[tone];

  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 truncate text-lg font-black ${cls}`} title={value}>
        {value}
      </div>
    </div>
  );
}

function TrailBlock({ value }: { value: string }) {
  const isInitial = value === "INITIAL";
  return (
    <div
      className={`rounded-xl border px-3 py-1.5 ${isInitial ? "border-white/10 bg-white/[0.03]" : "border-amber-400/25 bg-amber-400/[0.09]"}`}
    >
      <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
        Trail
      </div>
      <div
        className={`mt-1 whitespace-normal break-words text-sm font-black ${isInitial ? "text-zinc-100" : "text-amber-300"}`}
        title={value}
      >
        {formatTrail(value)}
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "neutral";
}) {
  const cls =
    tone === "good"
      ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"
      : tone === "warn"
        ? "border-amber-400/20 bg-amber-400/[0.08] text-amber-300"
        : "border-white/10 bg-white/[0.03] text-zinc-100";

  return (
    <div className={`rounded-xl border px-3 py-1.5 ${cls}`}>
      <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-black" title={value}>
        {value}
      </div>
    </div>
  );
}

function InfoLine({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "warn" | "neutral";
}) {
  const cls = tone === "warn" ? "text-amber-300" : "text-zinc-300";

  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-1.5">
      <span className="mr-2 text-[9px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <span className={`font-bold ${cls}`} title={value}>
        {value}
      </span>
    </div>
  );
}

function Pill({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "bad" | "warn" | "neutral";
}) {
  const cls = {
    good: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    bad: "border-red-400/30 bg-red-400/10 text-red-300",
    warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    neutral: "border-white/10 bg-white/[0.03] text-zinc-400",
  }[tone];

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-black ${cls}`}
    >
      {label}
    </span>
  );
}

function cleanSymbol(value: unknown) {
  return String(value ?? "")
    .replace("BIST:", "")
    .replace("BIST.", "")
    .trim()
    .toUpperCase();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function price(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function money(value: number) {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function integer(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return Math.round(parsed).toLocaleString("tr-TR");
}

function date(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ageLabel(value: string | null | undefined) {
  if (!value) return { label: "-", minutes: 0 };

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { label: "-", minutes: 0 };

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - parsed.getTime()) / 60000),
  );
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days > 0) return { label: `${days}g ${hours}s`, minutes };
  if (hours > 0) return { label: `${hours}s ${mins}d`, minutes };
  return { label: `${mins}d`, minutes };
}

function sideClass(side: string) {
  const normalized = String(side ?? "").toUpperCase();
  if (normalized === "LONG") return "text-lg font-black text-emerald-300";
  if (normalized === "SHORT") return "text-lg font-black text-red-300";
  return "text-lg font-black text-zinc-300";
}

function statusClass(status: string) {
  if (status === "OPEN")
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (status === "CLOSED")
    return "border-zinc-400/30 bg-zinc-400/10 text-zinc-300";
  return "border-amber-400/30 bg-amber-400/10 text-amber-300";
}

function riskLabel(
  side: string,
  entryValue: number | null,
  currentValue: number | null,
  trailingStage: string | null,
  statusValue: string | null,
) {
  const status = String(statusValue ?? "").toUpperCase();
  if (status === "CLOSED") return "CLOSED";

  const pnlPct = calcPnlPct(side, entryValue, currentValue);
  const trail = String(trailingStage ?? "INITIAL").toUpperCase();

  if (trail !== "INITIAL") return `TRAIL ${formatTrail(trail)}`;
  if (pnlPct >= 3) return "PROFIT ZONE";
  if (pnlPct <= -2) return "LOSS WATCH";
  return "INITIAL";
}

function calcPnlPct(
  side: string,
  entryValue: number | null,
  exitValue: number | null,
) {
  const entry = number(entryValue);
  const exit = number(exitValue);
  const normalized = String(side ?? "").toUpperCase();

  if (!entry || !exit) return 0;
  if (normalized === "SHORT") return ((entry - exit) / entry) * 100;
  return ((exit - entry) / entry) * 100;
}

function calcPnlAmount(
  side: string,
  entryValue: number | null,
  exitValue: number | null,
  qtyValue: number | null | number,
) {
  const entry = number(entryValue);
  const exit = number(exitValue);
  const qty = number(qtyValue) || 1;
  const normalized = String(side ?? "").toUpperCase();

  if (!entry || !exit) return 0;
  if (normalized === "SHORT") return (entry - exit) * qty;
  return (exit - entry) * qty;
}

function calcRiskPct(
  side: string,
  currentValue: number | null,
  stopValue: number | null,
) {
  const current = number(currentValue);
  const stop = number(stopValue);
  const normalized = String(side ?? "").toUpperCase();

  if (!current || !stop) return 0;
  if (normalized === "SHORT") return ((current - stop) / current) * 100;
  return ((stop - current) / current) * 100;
}

function calcLockedProfitPct(
  side: string,
  entryValue: number | null,
  stopValue: number | null,
) {
  const entry = number(entryValue);
  const stop = number(stopValue);
  const normalized = String(side ?? "").toUpperCase();

  if (!entry || !stop) return 0;

  const raw =
    normalized === "SHORT"
      ? ((entry - stop) / entry) * 100
      : ((stop - entry) / entry) * 100;

  return Math.max(0, raw);
}

function calcLockedProfitAmount(
  side: string,
  entryValue: number | null,
  stopValue: number | null,
  qtyValue: number,
) {
  const entry = number(entryValue);
  const stop = number(stopValue);
  const qty = number(qtyValue) || 1;
  const normalized = String(side ?? "").toUpperCase();

  if (!entry || !stop) return 0;

  const raw =
    normalized === "SHORT" ? (entry - stop) * qty : (stop - entry) * qty;

  return Math.max(0, raw);
}

function signedPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function plainPct(value: number) {
  return `${Math.max(0, value).toFixed(2)}%`;
}

function formatTrail(value: string) {
  return String(value ?? "-")
    .replaceAll("_", " ")
    .replace("BREAKEVEN", "BREAKEVEN")
    .trim();
}

function buildLifecycleBadges(row: EnrichedPosition) {
  const status = String(row.status ?? "-").toUpperCase();
  const trail = String(row.trailing_stage ?? "INITIAL").toUpperCase();
  const badges: { label: string; cls: string }[] = [];

  badges.push({ label: status, cls: statusClass(status) });

  if (row.tp1_hit) {
    badges.push({
      label: "TP1 HIT",
      cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    });
  }

  if (trail !== "INITIAL") {
    badges.push({
      label: formatTrail(trail),
      cls: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    });
  }

  if (row.calculated_locked_profit_pct > 0) {
    badges.push({
      label: "LOCKED",
      cls: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
    });
  }

  return badges;
}

function getBestPosition(rows: EnrichedPosition[]) {
  if (!rows.length) return null;
  return [...rows].sort(
    (a, b) => b.calculated_pnl_pct - a.calculated_pnl_pct,
  )[0];
}

function getWorstPosition(rows: EnrichedPosition[]) {
  if (!rows.length) return null;
  return [...rows].sort(
    (a, b) => a.calculated_pnl_pct - b.calculated_pnl_pct,
  )[0];
}

function shortCloseReason(reason: string | null): string {
  if (!reason) return "-";
  const raw = String(reason);
  if (raw.startsWith("AI_DECISION")) return "AI KARARI";
  return raw.length > 14 ? `${raw.slice(0, 13)}…` : raw;
}
