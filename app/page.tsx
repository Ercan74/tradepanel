"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Signal = {
  id: string;
  created_at?: string;
  symbol?: string;
  ticker?: string;
  side?: string;
  order_side?: string;
  order_action?: string;
  price?: number;
  close?: number;
  status?: string;
  pnl?: number;
  entry_price?: number;
  current_price?: number;
  stop_loss?: number;
  take_profit?: number;
};

type NormalizedTrade = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT" | "UNKNOWN";
  price: number;
  status: string;
  pnl: number;
  stopLoss?: number;
  takeProfit?: number;
  createdAt: string;
};

function normalizeSide(signal: Signal): "LONG" | "SHORT" | "UNKNOWN" {
  const raw = String(
    signal.side || signal.order_side || signal.order_action || ""
  ).toUpperCase();

  if (raw.includes("BUY") || raw.includes("LONG")) return "LONG";
  if (raw.includes("SELL") || raw.includes("SHORT")) return "SHORT";
  return "UNKNOWN";
}

function normalizeTrade(signal: Signal): NormalizedTrade {
  const price =
    Number(signal.current_price) ||
    Number(signal.price) ||
    Number(signal.close) ||
    Number(signal.entry_price) ||
    0;

  return {
    id: signal.id,
    symbol: signal.symbol || signal.ticker || "UNKNOWN",
    side: normalizeSide(signal),
    price,
    status: signal.status || "OPEN",
    pnl: Number(signal.pnl) || 0,
    stopLoss: signal.stop_loss,
    takeProfit: signal.take_profit,
    createdAt: signal.created_at || new Date().toISOString(),
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function Page() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");

  async function loadSignals() {
    const { data, error } = await supabase
      .from("signals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && data) {
      setSignals(data);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadSignals();

    const channel = supabase
      .channel("signals-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signals" },
        () => {
          loadSignals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const trades = useMemo(() => signals.map(normalizeTrade), [signals]);

  const openTrades = trades.filter((t) => t.status.toUpperCase() === "OPEN");

  const filteredTrades =
    filter === "ALL" ? openTrades : openTrades.filter((t) => t.side === filter);

  const totalPnl = openTrades.reduce((sum, t) => sum + t.pnl, 0);
  const longCount = openTrades.filter((t) => t.side === "LONG").length;
  const shortCount = openTrades.filter((t) => t.side === "SHORT").length;
  const exposurePercent = Math.min(openTrades.length * 20, 100);

  return (
    <main className="min-h-screen bg-[#080b12] text-white">
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-cyan-300">TradePanel Automation</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              EMA100 Pro Dashboard
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              TradingView webhook sinyalleri, açık pozisyonlar, risk ve PnL takibi
            </p>
          </div>

          <div className="flex gap-2 rounded-2xl border border-white/10 bg-black/30 p-1">
            {["ALL", "LONG", "SHORT"].map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item as "ALL" | "LONG" | "SHORT")}
                className={`rounded-xl px-4 py-2 text-sm transition ${
                  filter === item
                    ? "bg-cyan-400 text-black"
                    : "text-slate-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricCard
            title="Open Positions"
            value={openTrades.length.toString()}
            sub="Maksimum hedef: 5 pozisyon"
          />
          <MetricCard
            title="Open PnL"
            value={`${formatMoney(totalPnl)} ₺`}
            sub={totalPnl >= 0 ? "Pozitif görünüm" : "Negatif baskı"}
            positive={totalPnl >= 0}
          />
          <MetricCard
            title="Long / Short"
            value={`${longCount} / ${shortCount}`}
            sub="Yön dağılımı"
          />
          <MetricCard
            title="Exposure"
            value={`%${exposurePercent}`}
            sub="Pozisyon başına yaklaşık %20"
            warning={exposurePercent >= 80}
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Open Positions</h2>
                <p className="text-sm text-slate-400">
                  En güncel açık sinyaller ve pozisyon durumu
                </p>
              </div>
              <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">
                LIVE
              </span>
            </div>

            {loading ? (
              <div className="py-20 text-center text-slate-400">
                Dashboard yükleniyor...
              </div>
            ) : filteredTrades.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 py-20 text-center text-slate-500">
                Açık pozisyon bulunamadı.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">Symbol</th>
                      <th className="px-4 py-3">Side</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Stop</th>
                      <th className="px-4 py-3">Take Profit</th>
                      <th className="px-4 py-3">PnL</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTrades.map((trade) => (
                      <tr
                        key={trade.id}
                        className="rounded-2xl bg-white/[0.035] transition hover:bg-white/[0.07]"
                      >
                        <td className="rounded-l-2xl px-4 py-4 font-semibold">
                          {trade.symbol}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              trade.side === "LONG"
                                ? "bg-emerald-400/10 text-emerald-300"
                                : trade.side === "SHORT"
                                ? "bg-rose-400/10 text-rose-300"
                                : "bg-slate-400/10 text-slate-300"
                            }`}
                          >
                            {trade.side}
                          </span>
                        </td>
                        <td className="px-4 py-4">{formatMoney(trade.price)}</td>
                        <td className="px-4 py-4 text-slate-300">
                          {trade.stopLoss ? formatMoney(trade.stopLoss) : "-"}
                        </td>
                        <td className="px-4 py-4 text-slate-300">
                          {trade.takeProfit ? formatMoney(trade.takeProfit) : "-"}
                        </td>
                        <td
                          className={`px-4 py-4 font-semibold ${
                            trade.pnl >= 0 ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          {formatMoney(trade.pnl)} ₺
                        </td>
                        <td className="px-4 py-4">
                          <span className="rounded-full bg-blue-400/10 px-3 py-1 text-xs text-blue-300">
                            {trade.status}
                          </span>
                        </td>
                        <td className="rounded-r-2xl px-4 py-4 text-slate-400">
                          {formatTime(trade.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <RiskPanel
              openCount={openTrades.length}
              exposurePercent={exposurePercent}
              totalPnl={totalPnl}
            />

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
              <h2 className="text-lg font-semibold">Signal Stream</h2>
              <p className="mb-4 text-sm text-slate-400">
                Son gelen TradingView mesajları
              </p>

              <div className="space-y-3">
                {trades.slice(0, 8).map((trade) => (
                  <div
                    key={trade.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{trade.symbol}</span>
                      <span
                        className={`text-xs ${
                          trade.side === "LONG"
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }`}
                      >
                        {trade.side}
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-slate-500">
                      <span>{formatMoney(trade.price)}</span>
                      <span>{formatTime(trade.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  title,
  value,
  sub,
  positive,
  warning,
}: {
  title: string;
  value: string;
  sub: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
      <p className="text-sm text-slate-400">{title}</p>
      <h3
        className={`mt-3 text-3xl font-semibold ${
          positive === true
            ? "text-emerald-300"
            : positive === false
            ? "text-rose-300"
            : warning
            ? "text-amber-300"
            : "text-white"
        }`}
      >
        {value}
      </h3>
      <p className="mt-2 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function RiskPanel({
  openCount,
  exposurePercent,
  totalPnl,
}: {
  openCount: number;
  exposurePercent: number;
  totalPnl: number;
}) {
  const riskLevel =
    openCount >= 5
      ? "MAX RISK"
      : openCount >= 4
      ? "HIGH"
      : openCount >= 2
      ? "NORMAL"
      : "LOW";

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
      <h2 className="text-lg font-semibold">Risk Monitor</h2>
      <p className="mb-5 text-sm text-slate-400">
        Pozisyon yoğunluğu ve açık risk durumu
      </p>

      <div className="mb-5 rounded-2xl bg-black/30 p-4">
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-slate-400">Exposure</span>
          <span>%{exposurePercent}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-400"
            style={{ width: `${exposurePercent}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-black/30 p-4">
          <p className="text-xs text-slate-500">Risk Level</p>
          <p
            className={`mt-2 font-semibold ${
              riskLevel === "MAX RISK"
                ? "text-rose-300"
                : riskLevel === "HIGH"
                ? "text-amber-300"
                : "text-emerald-300"
            }`}
          >
            {riskLevel}
          </p>
        </div>

        <div className="rounded-2xl bg-black/30 p-4">
          <p className="text-xs text-slate-500">PnL Bias</p>
          <p
            className={`mt-2 font-semibold ${
              totalPnl >= 0 ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {totalPnl >= 0 ? "POSITIVE" : "NEGATIVE"}
          </p>
        </div>
      </div>

      {openCount >= 5 && (
        <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          Maksimum pozisyon sınırına ulaşıldı. Yeni sinyaller risk motorunda
          bekletilmeli.
        </div>
      )}
    </div>
  );
}