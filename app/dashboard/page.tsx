"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

import MarketBar from "@/components/terminal/MarketBar";
import Sidebar from "@/components/terminal/Sidebar";
import ExecutionDesk from "@/components/terminal/ExecutionDesk";
import RiskDesk from "@/components/terminal/RiskDesk";
import AnalyticsGrid from "@/components/terminal/AnalyticsGrid";
import EquityCurve from "@/components/terminal/EquityCurve";

import { Metric } from "@/components/terminal/Panel";
import { money, normalizeSignal } from "@/components/terminal/helpers";
import type { RawSignal } from "@/components/terminal/types";

export default function DashboardPage() {
  const [signals, setSignals] = useState<RawSignal[]>([]);
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [loading, setLoading] = useState(true);

  async function loadSignals() {
    const { data } = await supabase
      .from("signals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(250);

    setSignals(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadSignals();

    const channel = supabase
      .channel("institutional-terminal")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signals" },
        loadSignals
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const trades = useMemo(() => signals.map(normalizeSignal), [signals]);

  const openTrades = trades.filter((t) => t.status.toUpperCase() === "OPEN");
  const filteredOpen =
    filter === "ALL" ? openTrades : openTrades.filter((t) => t.side === filter);

  const totalPnl = trades.reduce((a, b) => a + b.pnl, 0);
  const openPnl = openTrades.reduce((a, b) => a + b.pnl, 0);
  const winners = trades.filter((t) => t.pnl > 0).length;
  const winRate = trades.length ? Math.round((winners / trades.length) * 100) : 0;
  const exposure = Math.min(openTrades.length * 20, 100);

  const longCount = openTrades.filter((t) => t.side === "LONG").length;
  const shortCount = openTrades.filter((t) => t.side === "SHORT").length;

  return (
    <main className="min-h-screen bg-[#050812] text-white">
      <div className="mx-auto max-w-[1920px] px-3 py-3 text-[13px]">
        <MarketBar />

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[280px_1fr]">
          <Sidebar trades={trades} />

          <section className="space-y-3 overflow-hidden">
            <Header filter={filter} setFilter={setFilter} />

            <section className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-6">
              <Metric
                title="Open PnL"
                value={`${money(openPnl)} ₺`}
                tone={openPnl >= 0 ? "good" : "bad"}
              />
              <Metric
                title="Total PnL"
                value={`${money(totalPnl)} ₺`}
                tone={totalPnl >= 0 ? "good" : "bad"}
              />
              <Metric title="Open Positions" value={String(openTrades.length)} />
              <Metric title="Long / Short" value={`${longCount} / ${shortCount}`} />
              <Metric title="Win Rate" value={`%${winRate}`} />
              <Metric
                title="Exposure"
                value={`%${exposure}`}
                tone={exposure >= 80 ? "warn" : "neutral"}
              />
            </section>

            <section className="grid grid-cols-1 gap-3 2xl:grid-cols-[1.5fr_400px]">
              <ExecutionDesk loading={loading} trades={filteredOpen} />
              <RiskDesk
                exposure={exposure}
                openPnl={openPnl}
                openCount={openTrades.length}
              />
            </section>

            <AnalyticsGrid trades={trades} />
            <EquityCurve trades={trades} />
          </section>
        </div>
      </div>
    </main>
  );
}

function Header({
  filter,
  setFilter,
}: {
  filter: "ALL" | "LONG" | "SHORT";
  setFilter: (v: "ALL" | "LONG" | "SHORT") => void;
}) {
  return (
    <header className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/90 to-black p-5 shadow-xl">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="mb-1 text-xs font-semibold tracking-wide text-cyan-300">
            LIVE INSTITUTIONAL TERMINAL
          </div>

          <h1 className="text-3xl font-bold tracking-tight">
            EMA100 Pro Trading Terminal
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Execution Desk · Strategy Intelligence · PnL Analytics · Risk Monitor
          </p>
        </div>

        <div className="flex rounded-2xl border border-white/10 bg-black/40 p-1">
          {["ALL", "LONG", "SHORT"].map((x) => (
            <button
              key={x}
              onClick={() => setFilter(x as "ALL" | "LONG" | "SHORT")}
              className={`rounded-xl px-4 py-2 text-xs ${
                filter === x
                  ? "bg-cyan-400 text-black"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {x}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}