"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type RawSignal = {
  id: string;
  created_at?: string;
  symbol?: string;
  ticker?: string;
  side?: string;
  order_side?: string;
  order_action?: string;
  strategy?: string;
  status?: string;
  price?: number;
  close?: number;
  entry_price?: number;
  exit_price?: number;
  current_price?: number;
  pnl?: number;
  stop_loss?: number;
  take_profit?: number;
  confidence?: number;
  risk_score?: number;
  dist_atr?: number;
  rsi?: number;
  macd?: number;
};

type Trade = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT" | "UNKNOWN";
  strategy: string;
  status: string;
  price: number;
  pnl: number;
  stopLoss?: number;
  takeProfit?: number;
  confidence: number;
  riskScore: number;
  distAtr: number;
  rsi: number;
  createdAt: string;
};

function sideOf(s: RawSignal): Trade["side"] {
  const raw = String(s.side || s.order_side || s.order_action || "").toUpperCase();
  if (raw.includes("BUY") || raw.includes("LONG")) return "LONG";
  if (raw.includes("SELL") || raw.includes("SHORT")) return "SHORT";
  return "UNKNOWN";
}

function n(v: unknown, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function normalize(s: RawSignal): Trade {
  return {
    id: s.id,
    symbol: s.symbol || s.ticker || "UNKNOWN",
    side: sideOf(s),
    strategy: s.strategy || "EMA100 Core",
    status: s.status || "OPEN",
    price: n(s.current_price || s.price || s.close || s.entry_price),
    pnl: n(s.pnl),
    stopLoss: s.stop_loss,
    takeProfit: s.take_profit,
    confidence: n(s.confidence, 72),
    riskScore: n(s.risk_score, 42),
    distAtr: n(s.dist_atr),
    rsi: n(s.rsi),
    createdAt: s.created_at || new Date().toISOString(),
  };
}

function money(v: number) {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function time(v: string) {
  return new Date(v).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const [signals, setSignals] = useState<RawSignal[]>([]);
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from("signals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(250);

    setSignals(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel("signals-terminal")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signals" },
        load
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const trades = useMemo(() => signals.map(normalize), [signals]);

  const openTrades = trades.filter((t) => t.status.toUpperCase() === "OPEN");
  const closedTrades = trades.filter((t) => t.status.toUpperCase() !== "OPEN");

  const visibleOpen =
    filter === "ALL" ? openTrades : openTrades.filter((t) => t.side === filter);

  const totalPnl = trades.reduce((a, b) => a + b.pnl, 0);
  const openPnl = openTrades.reduce((a, b) => a + b.pnl, 0);
  const realizedPnl = closedTrades.reduce((a, b) => a + b.pnl, 0);
  const winners = trades.filter((t) => t.pnl > 0).length;
  const losers = trades.filter((t) => t.pnl < 0).length;
  const winRate = trades.length ? Math.round((winners / trades.length) * 100) : 0;
  const exposure = Math.min(openTrades.length * 20, 100);

  const longCount = openTrades.filter((t) => t.side === "LONG").length;
  const shortCount = openTrades.filter((t) => t.side === "SHORT").length;

  const byStrategy = groupPnl(trades, "strategy");
  const bySymbol = groupPnl(trades, "symbol");

  const bestSymbol = bySymbol[0];
  const worstSymbol = [...bySymbol].reverse()[0];
  const bestStrategy = byStrategy[0];

  return (
    <main className="min-h-screen bg-[#050812] text-white">
      <div className="mx-auto max-w-[1800px] px-6 py-6">
        <header className="mb-6 rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900/90 to-black p-8 shadow-2xl">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3 text-sm text-cyan-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_#34d399]" />
                LIVE INSTITUTIONAL TERMINAL
              </div>
              <h1 className="text-4xl font-bold tracking-tight xl:text-5xl">
                TradePanel Institutional Terminal
              </h1>
              <p className="mt-3 text-slate-400">
                Execution Desk · PnL Analytics · Strategy Intelligence · Market Monitor
              </p>
            </div>

            <div className="flex rounded-2xl border border-white/10 bg-black/40 p-1">
              {["ALL", "LONG", "SHORT"].map((x) => (
                <button
                  key={x}
                  onClick={() => setFilter(x as "ALL" | "LONG" | "SHORT")}
                  className={`rounded-xl px-6 py-3 text-sm ${
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

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Metric title="Open PnL" value={`${money(openPnl)} ₺`} tone={openPnl >= 0 ? "good" : "bad"} />
          <Metric title="Realized PnL" value={`${money(realizedPnl)} ₺`} tone={realizedPnl >= 0 ? "good" : "bad"} />
          <Metric title="Total PnL" value={`${money(totalPnl)} ₺`} tone={totalPnl >= 0 ? "good" : "bad"} />
          <Metric title="Win Rate" value={`%${winRate}`} />
          <Metric title="Long / Short" value={`${longCount} / ${shortCount}`} />
          <Metric title="Exposure" value={`%${exposure}`} tone={exposure >= 80 ? "warn" : "neutral"} />
        </section>

        <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <Panel title="Execution Desk" sub="Açık pozisyonlar, stop/TP ve canlı PnL">
            {loading ? (
              <Empty text="Veriler yükleniyor..." />
            ) : visibleOpen.length === 0 ? (
              <Empty text="Açık pozisyon bulunamadı." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-widest text-slate-500">
                      <th className="px-4 py-3">Symbol</th>
                      <th className="px-4 py-3">Side</th>
                      <th className="px-4 py-3">Strategy</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Stop</th>
                      <th className="px-4 py-3">TP</th>
                      <th className="px-4 py-3">Confidence</th>
                      <th className="px-4 py-3">PnL</th>
                      <th className="px-4 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOpen.map((t) => (
                      <tr key={t.id} className="bg-white/[0.035] hover:bg-white/[0.07]">
                        <td className="rounded-l-2xl px-4 py-4 font-bold">{t.symbol}</td>
                        <td className="px-4 py-4">
                          <Badge tone={t.side === "LONG" ? "good" : "bad"}>{t.side}</Badge>
                        </td>
                        <td className="px-4 py-4 text-slate-300">{t.strategy}</td>
                        <td className="px-4 py-4">{money(t.price)}</td>
                        <td className="px-4 py-4 text-slate-400">{t.stopLoss ? money(t.stopLoss) : "-"}</td>
                        <td className="px-4 py-4 text-slate-400">{t.takeProfit ? money(t.takeProfit) : "-"}</td>
                        <td className="px-4 py-4">
                          <MiniBar value={t.confidence} />
                        </td>
                        <td className={`px-4 py-4 font-bold ${t.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {money(t.pnl)} ₺
                        </td>
                        <td className="rounded-r-2xl px-4 py-4 text-slate-400">{time(t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Risk Desk" sub="Pozisyon yoğunluğu ve risk alarmı">
            <div className="space-y-5">
              <RiskBar label="Exposure" value={exposure} />
              <RiskBar label="Open Position Capacity" value={(openTrades.length / 5) * 100} />
              <div className="grid grid-cols-2 gap-4">
                <InfoBox label="Risk Level" value={exposure >= 80 ? "HIGH" : "NORMAL"} tone={exposure >= 80 ? "warn" : "good"} />
                <InfoBox label="PnL Bias" value={openPnl >= 0 ? "POSITIVE" : "NEGATIVE"} tone={openPnl >= 0 ? "good" : "bad"} />
              </div>
              {exposure >= 100 && (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
                  Maksimum pozisyon sınırı doldu. Yeni sinyaller risk motorunda bekletilmeli.
                </div>
              )}
            </div>
          </Panel>
        </section>

        <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Panel title="Performance Analytics" sub="En iyi / en kötü hisseler ve kârlılık">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InfoBox label="Best Symbol" value={bestSymbol ? `${bestSymbol.name} ${money(bestSymbol.pnl)}₺` : "-"} tone="good" />
              <InfoBox label="Worst Symbol" value={worstSymbol ? `${worstSymbol.name} ${money(worstSymbol.pnl)}₺` : "-"} tone="bad" />
              <InfoBox label="Winning Trades" value={String(winners)} tone="good" />
              <InfoBox label="Losing Trades" value={String(losers)} tone="bad" />
            </div>
          </Panel>

          <Panel title="Strategy Intelligence" sub="Strateji bazlı performans">
            <RankList rows={byStrategy.slice(0, 5)} />
          </Panel>

          <Panel title="Symbol PnL Ranking" sub="Hisse bazlı toplam performans">
            <RankList rows={bySymbol.slice(0, 6)} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
          <Panel title="PnL Curve Simulation" sub="Son sinyallerden üretilmiş görsel eğri">
            <Curve values={trades.slice(0, 40).reverse().map((t) => t.pnl)} />
          </Panel>

          <Panel title="Signal Stream" sub="Son TradingView mesajları">
            <div className="space-y-3">
              {trades.slice(0, 10).map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div>
                    <div className="font-semibold">{t.symbol}</div>
                    <div className="text-xs text-slate-500">{t.strategy}</div>
                  </div>
                  <div className="text-right">
                    <Badge tone={t.side === "LONG" ? "good" : "bad"}>{t.side}</Badge>
                    <div className="mt-2 text-xs text-slate-500">{time(t.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function groupPnl(rows: Trade[], key: "strategy" | "symbol") {
  const map = new Map<string, number>();
  rows.forEach((r) => map.set(r[key], (map.get(r[key]) || 0) + r.pnl));
  return Array.from(map.entries())
    .map(([name, pnl]) => ({ name, pnl }))
    .sort((a, b) => b.pnl - a.pnl);
}

function Metric({
  title,
  value,
  tone = "neutral",
}: {
  title: string;
  value: string;
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
      ? "text-rose-300"
      : tone === "warn"
      ? "text-amber-300"
      : "text-white";

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
      <p className="text-sm text-slate-400">{title}</p>
      <h3 className={`mt-3 text-3xl font-bold ${color}`}>{value}</h3>
    </div>
  );
}

function Panel({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
      <div className="mb-5">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{sub}</p>
      </div>
      {children}
    </section>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "good" | "bad" | "warn";
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-400/10 text-emerald-300"
      : tone === "bad"
      ? "bg-rose-400/10 text-rose-300"
      : "bg-amber-400/10 text-amber-300";

  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${cls}`}>{children}</span>;
}

function MiniBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1 text-xs text-slate-400">%{Math.round(v)}</div>
      <div className="h-2 w-24 rounded-full bg-white/10">
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function RiskBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="rounded-2xl bg-black/30 p-4">
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        <span>%{Math.round(v)}</span>
      </div>
      <div className="h-3 rounded-full bg-white/10">
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function InfoBox({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
      ? "text-rose-300"
      : tone === "warn"
      ? "text-amber-300"
      : "text-white";

  return (
    <div className="rounded-2xl bg-black/30 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 font-bold ${color}`}>{value}</p>
    </div>
  );
}

function RankList({ rows }: { rows: { name: string; pnl: number }[] }) {
  if (!rows.length) return <Empty text="Henüz veri yok." />;

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.name} className="flex items-center justify-between rounded-2xl bg-black/25 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs text-slate-300">
              {i + 1}
            </span>
            <span className="font-semibold">{r.name}</span>
          </div>
          <span className={r.pnl >= 0 ? "font-bold text-emerald-300" : "font-bold text-rose-300"}>
            {money(r.pnl)} ₺
          </span>
        </div>
      ))}
    </div>
  );
}

function Curve({ values }: { values: number[] }) {
  const points = values.length ? values : [0, 1, -1, 2, -2, 3];
  let acc = 0;
  const cumulative = points.map((v) => {
    acc += v;
    return acc;
  });

  const min = Math.min(...cumulative);
  const max = Math.max(...cumulative);
  const range = max - min || 1;

  const path = cumulative
    .map((v, i) => {
      const x = (i / Math.max(cumulative.length - 1, 1)) * 1000;
      const y = 260 - ((v - min) / range) * 220;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-2xl bg-black/30 p-4">
      <svg viewBox="0 0 1000 300" className="h-[300px] w-full">
        <defs>
          <linearGradient id="pnlLine" x1="0" x2="1">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="url(#pnlLine)" strokeWidth="4" />
        <line x1="0" y1="260" x2="1000" y2="260" stroke="rgba(255,255,255,.12)" />
      </svg>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-500">
      {text}
    </div>
  );
}