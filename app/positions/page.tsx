"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

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
  updated_at: string | null;
  source: string | null;
  delay_note: string | null;
  is_stale: boolean | null;
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

    if (!positionsResult.error) setRows((positionsResult.data ?? []) as PositionRow[]);
    if (!livePricesResult.error) setLivePrices((livePricesResult.data ?? []) as LivePriceRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("positions-page-live-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "positions" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_prices" }, loadData)
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

  const enrichedRows = rows.map((row) => {
    const live = liveMap.get(cleanSymbol(row.symbol));
    const status = String(row.status ?? "").toUpperCase();
    const livePrice = positiveNumber(live?.last_price);
    const fallbackExit = row.exit_price ?? row.close_price ?? row.current_price;
    const current = status === "OPEN" ? livePrice ?? row.current_price ?? row.entry_price : fallbackExit;
    const quantity = number(row.quantity) || 1;
    const allocatedAmount = number(row.allocated_amount ?? row.notional ?? (number(row.entry_price) * quantity));

    const pnlAmount =
      status === "CLOSED" && row.pnl_amount !== null && row.pnl_amount !== undefined
        ? number(row.pnl_amount)
        : calcPnlAmount(row.side, row.entry_price, current, quantity);

    const pnlPct =
      status === "CLOSED" && row.pnl_pct !== null && row.pnl_pct !== undefined
        ? number(row.pnl_pct)
        : calcPnlPct(row.side, row.entry_price, current);

    return {
      ...row,
      live,
      calculated_current: current,
      calculated_quantity: quantity,
      calculated_allocated_amount: allocatedAmount,
      calculated_pnl_amount: pnlAmount,
      calculated_pnl_pct: pnlPct,
      data_source: livePrice ? live?.source ?? "MATRIKS_DDE" : "NO_LIVE_PRICE",
      calculated_stop: row.trailing_stop_price ?? row.stop_price ?? row.sl_price,
      calculated_tp1: row.tp1_price ?? row.tp_price,
      calculated_remaining_quantity: number(row.remaining_quantity ?? quantity),
      calculated_realized_partial: number(row.realized_partial_amount),
    };
  });

  const openRows = enrichedRows.filter((r) => String(r.status).toUpperCase() === "OPEN");
  const closedRows = enrichedRows.filter((r) => String(r.status).toUpperCase() === "CLOSED");
  const visibleRows = view === "OPEN" ? openRows : view === "CLOSED" ? closedRows : enrichedRows;

  const openPnl = openRows.reduce((sum, r) => sum + number(r.calculated_pnl_amount), 0);
  const realizedPnl = closedRows.reduce((sum, r) => sum + number(r.calculated_pnl_amount), 0);
  const winners = closedRows.filter((r) => number(r.calculated_pnl_amount) > 0).length;
  const winRate = closedRows.length ? Math.round((winners / closedRows.length) * 100) : 0;
  const exposurePct = Math.min(100, Math.round((openRows.length / MAX_OPEN_POSITIONS) * 100));
  const allocatedTotal = openRows.reduce((sum, r) => sum + number(r.calculated_allocated_amount), 0);

  return (
    <main className="min-h-screen bg-[#03050a] p-5 text-zinc-100">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-300">
            Position Lifecycle Blotter
          </div>
          <h1 className="mt-2 text-2xl font-black">Open & Closed Positions</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sermaye: 100.000 TL · Max pozisyon: 10 · Pozisyon başı hedef: 10.000 TL · Ana fiyat: Matriks DDE last_price.
          </p>
        </div>

        <Link href="/dashboard" className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-bold text-cyan-300">
          Back to Dashboard
        </Link>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-7">
        <Metric label="Open" value={`${openRows.length}/${MAX_OPEN_POSITIONS}`} tone={openRows.length >= MAX_OPEN_POSITIONS ? "bad" : "cyan"} />
        <Metric label="Open PnL" value={`${money(openPnl)} ₺`} tone={openPnl >= 0 ? "good" : "bad"} />
        <Metric label="Allocated" value={`${money(allocatedTotal)} ₺`} tone="neutral" />
        <Metric label="Exposure" value={`%${exposurePct}`} tone={exposurePct >= 100 ? "bad" : "cyan"} />
        <Metric label="Closed" value={String(closedRows.length)} tone="neutral" />
        <Metric label="Realized PnL" value={`${money(realizedPnl)} ₺`} tone={realizedPnl >= 0 ? "good" : "bad"} />
        <Metric label="Live Prices" value={String(livePrices.length)} tone="cyan" />
      </section>

      <section className="mb-4 flex gap-2">
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
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#050812]">
        <div className="grid grid-cols-[90px_70px_60px_90px_90px_70px_80px_100px_90px_90px_90px_90px_110px_120px_130px_120px] border-b border-white/10 px-3 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
          <div>Symbol</div><div>Side</div><div>TF</div><div>Entry</div><div>Current</div><div>Lot</div><div>Remain</div><div>Allocated</div><div>TP1</div><div>Stop</div><div>PnL ₺</div><div>PnL %</div><div>Trail</div><div>Status</div><div>Live Time</div><div>Data</div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-zinc-500">Loading positions...</div>
        ) : visibleRows.length === 0 ? (
          <div className="p-6 text-sm text-zinc-500">No positions found.</div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            {visibleRows.map((row) => {
              const pnlAmount = number(row.calculated_pnl_amount);
              const pnlPct = number(row.calculated_pnl_pct);
              const hasLive = row.data_source !== "NO_LIVE_PRICE";

              return (
                <div key={row.id} className="grid grid-cols-[90px_70px_60px_90px_90px_70px_80px_100px_90px_90px_90px_90px_110px_120px_130px_120px] items-center border-b border-white/5 px-3 py-3 text-xs hover:bg-white/[0.03]">
                  <div className="font-black text-white">{row.symbol}</div>
                  <div className={sideClass(row.side)}>{row.side}</div>
                  <div className="text-zinc-300">{row.timeframe ?? "-"}</div>
                  <div>{price(row.entry_price)}</div>
                  <div className={hasLive ? "font-bold text-cyan-200" : "font-bold text-amber-300"}>{price(row.calculated_current)}</div>
                  <div>{row.calculated_quantity}</div>
                  <div>{row.calculated_remaining_quantity}</div>
                  <div>{money(row.calculated_allocated_amount)} ₺</div>
                  <div>{price(row.calculated_tp1)}</div>
                  <div>{price(row.calculated_stop)}</div>
                  <div className={pnlAmount >= 0 ? "text-emerald-300" : "text-red-300"}>{money(pnlAmount)} ₺</div>
                  <div className={pnlPct >= 0 ? "text-emerald-300" : "text-red-300"}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</div>
                  <div className="text-zinc-400">{row.trailing_stage ?? "INITIAL"}</div>
                  <div>{row.status}</div>
                  <div className="text-zinc-500">{date(row.live?.last_trade_time ?? null)}</div>
                  <div className={hasLive ? "truncate text-zinc-500" : "truncate text-amber-300"}>{row.data_source}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "cyan" | "neutral" }) {
  const cls = {
    good: "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300",
    bad: "border-red-400/20 bg-red-400/[0.08] text-red-300",
    cyan: "border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-300",
    neutral: "border-white/10 bg-white/[0.04] text-zinc-300",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="text-[10px] uppercase tracking-[0.22em] opacity-60">{label}</div>
      <div className="mt-2 text-xl font-black">{value}</div>
    </div>
  );
}

function cleanSymbol(value: unknown) {
  return String(value ?? "").replace("BIST:", "").replace("BIST.", "").trim().toUpperCase();
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
  return parsed.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function money(value: number) {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function date(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function sideClass(side: string) {
  if (side === "LONG") return "font-black text-emerald-300";
  if (side === "SHORT") return "font-black text-red-300";
  return "font-black text-zinc-300";
}
function calcPnlPct(side: string, entryValue: number | null, exitValue: number | null) {
  const entry = number(entryValue);
  const exit = number(exitValue);
  if (!entry || !exit) return 0;
  if (side === "SHORT") return ((entry - exit) / entry) * 100;
  return ((exit - entry) / entry) * 100;
}
function calcPnlAmount(side: string, entryValue: number | null, exitValue: number | null, qtyValue: number | null | number) {
  const entry = number(entryValue);
  const exit = number(exitValue);
  const qty = number(qtyValue) || 1;
  if (!entry || !exit) return 0;
  if (side === "SHORT") return (entry - exit) * qty;
  return (exit - entry) * qty;
}
