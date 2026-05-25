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
  pnl_amount: number | null;
  pnl_pct: number | null;
  close_reason: string | null;
  strategy_tag: string | null;
  timeframe: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function PositionsPage() {
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"OPEN" | "CLOSED" | "ALL">("CLOSED");

  async function loadPositions() {
    setLoading(true);

    const { data, error } = await supabase
      .from("positions")
      .select("*")
      .order("opened_at", { ascending: false });

    if (!error) setRows((data ?? []) as PositionRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadPositions();

    const channel = supabase
      .channel("positions-page-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "positions" },
        loadPositions
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const openRows = rows.filter((r) => r.status === "OPEN");
  const closedRows = rows.filter((r) => r.status === "CLOSED");

  const visibleRows =
    view === "OPEN" ? openRows : view === "CLOSED" ? closedRows : rows;

  const realizedPnl = closedRows.reduce((sum, r) => sum + number(r.pnl_amount), 0);
  const winners = closedRows.filter((r) => number(r.pnl_amount) > 0).length;
  const losers = closedRows.filter((r) => number(r.pnl_amount) < 0).length;
  const winRate = closedRows.length
    ? Math.round((winners / closedRows.length) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-[#03050a] p-5 text-zinc-100">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-300">
            Position Lifecycle Blotter
          </div>
          <h1 className="mt-2 text-2xl font-black">Open & Closed Positions</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Entry, exit, realized PnL, timeframe, strategy and close reason.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-bold text-cyan-300"
        >
          Back to Dashboard
        </Link>
      </header>

      <section className="mb-5 grid grid-cols-5 gap-3">
        <Metric label="Open" value={String(openRows.length)} tone="cyan" />
        <Metric label="Closed" value={String(closedRows.length)} tone="neutral" />
        <Metric
          label="Realized PnL"
          value={`${money(realizedPnl)} ₺`}
          tone={realizedPnl >= 0 ? "good" : "bad"}
        />
        <Metric label="Win Rate" value={`%${winRate}`} tone="good" />
        <Metric label="W / L" value={`${winners} / ${losers}`} tone="neutral" />
      </section>

      <section className="mb-4 flex gap-2">
        {(["CLOSED", "OPEN", "ALL"] as const).map((item) => (
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
        <div className="grid grid-cols-[90px_70px_70px_90px_90px_90px_90px_90px_120px_110px_140px_140px] border-b border-white/10 px-3 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
          <div>Symbol</div>
          <div>Side</div>
          <div>TF</div>
          <div>Entry</div>
          <div>Exit</div>
          <div>PnL ₺</div>
          <div>PnL %</div>
          <div>Status</div>
          <div>Reason</div>
          <div>Strategy</div>
          <div>Opened</div>
          <div>Closed</div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-zinc-500">Loading positions...</div>
        ) : visibleRows.length === 0 ? (
          <div className="p-6 text-sm text-zinc-500">No positions found.</div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            {visibleRows.map((row) => {
              const exit = row.exit_price ?? row.close_price ?? row.current_price;
              const pnlAmount =
                row.pnl_amount ??
                calcPnlAmount(row.side, row.entry_price, exit, row.quantity);
              const pnlPct =
                row.pnl_pct ?? calcPnlPct(row.side, row.entry_price, exit);

              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[90px_70px_70px_90px_90px_90px_90px_90px_120px_110px_140px_140px] items-center border-b border-white/5 px-3 py-3 text-xs hover:bg-white/[0.03]"
                >
                  <div className="font-black text-white">{row.symbol}</div>
                  <div className={sideClass(row.side)}>{row.side}</div>
                  <div className="text-zinc-300">{row.timeframe ?? "-"}</div>
                  <div>{price(row.entry_price)}</div>
                  <div>{price(exit)}</div>
                  <div className={pnlAmount >= 0 ? "text-emerald-300" : "text-red-300"}>
                    {money(pnlAmount)} ₺
                  </div>
                  <div className={pnlPct >= 0 ? "text-emerald-300" : "text-red-300"}>
                    {pnlPct >= 0 ? "+" : ""}
                    {pnlPct.toFixed(2)}%
                  </div>
                  <div>{row.status}</div>
                  <div className="truncate text-zinc-400">
                    {row.close_reason ?? "-"}
                  </div>
                  <div className="truncate text-zinc-400">
                    {row.strategy_tag ?? "-"}
                  </div>
                  <div className="text-zinc-500">{date(row.opened_at)}</div>
                  <div className="text-zinc-500">{date(row.closed_at)}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
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
      <div className="mt-2 text-xl font-black">{value}</div>
    </div>
  );
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function date(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sideClass(side: string) {
  if (side === "LONG") return "font-black text-emerald-300";
  if (side === "SHORT") return "font-black text-red-300";
  return "font-black text-zinc-300";
}

function calcPnlPct(
  side: string,
  entryValue: number | null,
  exitValue: number | null
) {
  const entry = number(entryValue);
  const exit = number(exitValue);
  if (!entry || !exit) return 0;

  if (side === "SHORT") return ((entry - exit) / entry) * 100;
  return ((exit - entry) / entry) * 100;
}

function calcPnlAmount(
  side: string,
  entryValue: number | null,
  exitValue: number | null,
  qtyValue: number | null
) {
  const entry = number(entryValue);
  const exit = number(exitValue);
  const qty = number(qtyValue) || 1;

  if (side === "SHORT") return (entry - exit) * qty;
  return (exit - entry) * qty;
}