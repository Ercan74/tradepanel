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
  current_price?: number;
  pnl?: number;
  stop_loss?: number;
  take_profit?: number;
  confidence?: number;
  risk_score?: number;
  dist_atr?: number;
  rsi?: number;
};

type Trade = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT" | "UNKNOWN";
  strategy: string;
  status: string;
  price: number;
  pnl: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  riskScore: number;
  distAtr: number;
  rsi: number;
  createdAt: string;
};

const mockMarket = [
  ["BIST100", "+1.42%", "good"],
  ["BANKS", "+2.08%", "good"],
  ["INDUSTRIAL", "-0.36%", "bad"],
  ["USDTRY", "32.21", "neutral"],
  ["VOL", "NORMAL", "neutral"],
  ["REGIME", "RISK-ON", "good"],
];

const mockHeatmap = [
  ["ASELS", 3.4],
  ["AKBNK", 2.1],
  ["GARAN", 1.8],
  ["THYAO", -1.2],
  ["KCHOL", 0.6],
  ["SAHOL", -0.8],
  ["EREGL", 1.1],
  ["TUPRS", -1.6],
  ["SISE", 0.9],
];

function num(v: unknown, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function normalizeSide(s: RawSignal): Trade["side"] {
  const raw = String(s.side || s.order_side || s.order_action || "").toUpperCase();
  if (raw.includes("BUY") || raw.includes("LONG")) return "LONG";
  if (raw.includes("SELL") || raw.includes("SHORT")) return "SHORT";
  return "UNKNOWN";
}

function normalize(s: RawSignal): Trade {
  return {
    id: s.id,
    symbol: s.symbol || s.ticker || "UNKNOWN",
    side: normalizeSide(s),
    strategy: s.strategy || "EMA100 CORE",
    status: s.status || "OPEN",
    price: num(s.current_price || s.price || s.close || s.entry_price),
    pnl: num(s.pnl),
    stopLoss: num(s.stop_loss),
    takeProfit: num(s.take_profit),
    confidence: num(s.confidence, 72),
    riskScore: num(s.risk_score, 38),
    distAtr: num(s.dist_atr),
    rsi: num(s.rsi),
    createdAt: s.created_at || new Date().toISOString(),
  };
}

function money(v: number) {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function shortTime(v: string) {
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

  const trades = useMemo(() => signals.map(normalize), [signals]);

  const openTrades = trades.filter((t) => t.status.toUpperCase() === "OPEN");
  const filteredOpen =
    filter === "ALL" ? openTrades : openTrades.filter((t) => t.side === filter);

  const totalPnl = trades.reduce((a, b) => a + b.pnl, 0);
  const openPnl = openTrades.reduce((a, b) => a + b.pnl, 0);
  const winners = trades.filter((t) => t.pnl > 0).length;
  const losers = trades.filter((t) => t.pnl < 0).length;
  const winRate = trades.length ? Math.round((winners / trades.length) * 100) : 0;
  const exposure = Math.min(openTrades.length * 20, 100);

  const longCount = openTrades.filter((t) => t.side === "LONG").length;
  const shortCount = openTrades.filter((t) => t.side === "SHORT").length;

  const bySymbol = groupByPnl(trades, "symbol");
  const byStrategy = groupByPnl(trades, "strategy");

  return (
    <main className="min-h-screen bg-[#050812] text-white">
      <div className="mx-auto max-w-[1900px] px-5 py-5">
        <MarketBar />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[290px_1fr]">
          <aside className="space-y-5">
            <TerminalIdentity />
            <Watchlist trades={trades} />
            <Heatmap />
            <SignalFlow trades={trades} />
          </aside>

          <section className="space-y-5">
            <Header filter={filter} setFilter={setFilter} />

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-6">
              <Metric title="Open PnL" value={`${money(openPnl)} ₺`} tone={openPnl >= 0 ? "good" : "bad"} />
              <Metric title="Total PnL" value={`${money(totalPnl)} ₺`} tone={totalPnl >= 0 ? "good" : "bad"} />
              <Metric title="Open Positions" value={String(openTrades.length)} />
              <Metric title="Long / Short" value={`${longCount} / ${shortCount}`} />
              <Metric title="Win Rate" value={`%${winRate}`} />
              <Metric title="Exposure" value={`%${exposure}`} tone={exposure >= 80 ? "warn" : "neutral"} />
            </section>

            <section className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.5fr_430px]">
              <Panel title="Execution Desk" sub="Canlı açık pozisyonlar, risk, confidence ve PnL">
                <ExecutionTable loading={loading} trades={filteredOpen} />
              </Panel>

              <RiskDesk exposure={exposure} openPnl={openPnl} openCount={openTrades.length} />
            </section>

            <section className="grid grid-cols-1 gap-5 2xl:grid-cols-[1fr_1fr_1fr]">
              <Panel title="Performance Analytics" sub="Genel kârlılık, kazanan/kaybeden ve skor">
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Winning Trades" value={String(winners)} tone="good" />
                  <Info label="Losing Trades" value={String(losers)} tone="bad" />
                  <Info label="Best Symbol" value={bySymbol[0] ? bySymbol[0].name : "-"} tone="good" />
                  <Info label="Worst Symbol" value={bySymbol.at(-1) ? bySymbol.at(-1)!.name : "-"} tone="bad" />
                </div>
              </Panel>

              <Panel title="Strategy Intelligence" sub="Strateji bazlı PnL dağılımı">
                <RankList rows={byStrategy.slice(0, 5)} />
              </Panel>

              <Panel title="Symbol PnL Ranking" sub="Hisse bazlı toplam performans">
                <RankList rows={bySymbol.slice(0, 5)} />
              </Panel>
            </section>

            <section className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.4fr_0.8fr]">
              <Panel title="Equity Curve" sub="Sinyal bazlı kümülatif PnL eğrisi">
                <EquityCurve values={trades.slice(0, 60).reverse().map((t) => t.pnl)} />
              </Panel>

              <Panel title="Strategy Lab" sub="Rejim, momentum ve risk özeti">
                <StrategyLab trades={trades} />
              </Panel>
            </section>
          </section>
        </div>
      </div>
    </main>
  );
}

function groupByPnl(rows: Trade[], key: "symbol" | "strategy") {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(r[key], (m.get(r[key]) || 0) + r.pnl));
  return Array.from(m.entries())
    .map(([name, pnl]) => ({ name, pnl }))
    .sort((a, b) => b.pnl - a.pnl);
}

function MarketBar() {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-3xl border border-cyan-400/15 bg-cyan-400/[0.035] px-5 py-3 shadow-2xl">
      <div className="mr-3 text-xs font-bold tracking-[0.25em] text-cyan-300">
        MARKET BAR
      </div>
      {mockMarket.map(([name, value, tone]) => (
        <div key={name} className="flex items-center gap-2 rounded-2xl bg-black/30 px-4 py-2 text-sm">
          <span className="text-slate-400">{name}</span>
          <span
            className={
              tone === "good"
                ? "font-bold text-emerald-300"
                : tone === "bad"
                ? "font-bold text-rose-300"
                : "font-bold text-white"
            }
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function TerminalIdentity() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl text-cyan-300">
          ∿
        </div>
        <div>
          <div className="text-xl font-bold">TradePanel</div>
          <div className="text-xs text-cyan-300">Institutional v5</div>
        </div>
      </div>
      <div className="rounded-2xl bg-black/30 p-4">
        <div className="flex justify-between text-xs text-slate-400">
          <span>ENGINE</span>
          <span className="text-emerald-300">LIVE</span>
        </div>
        <div className="mt-3 text-lg font-bold text-emerald-300">BORSA PY</div>
        <div className="mt-1 text-xs text-slate-400">
          Realtime signal monitor active
        </div>
      </div>
    </div>
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
    <header className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900/90 to-black p-7 shadow-2xl">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="mb-2 text-sm font-semibold text-cyan-300">
            LIVE INSTITUTIONAL TERMINAL
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            EMA100 Pro Trading Terminal
          </h1>
          <p className="mt-2 text-slate-400">
            Execution Desk · Strategy Intelligence · PnL Analytics · Risk Monitor
          </p>
        </div>

        <div className="flex rounded-2xl border border-white/10 bg-black/40 p-1">
          {["ALL", "LONG", "SHORT"].map((x) => (
            <button
              key={x}
              onClick={() => setFilter(x as "ALL" | "LONG" | "SHORT")}
              className={`rounded-xl px-5 py-3 text-sm ${
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
      <div className={`mt-3 text-3xl font-bold ${color}`}>{value}</div>
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
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{sub}</p>
        </div>
        <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">
          LIVE
        </span>
      </div>
      {children}
    </section>
  );
}

function ExecutionTable({ loading, trades }: { loading: boolean; trades: Trade[] }) {
  if (loading) return <Empty text="Veriler yükleniyor..." />;
  if (!trades.length) return <Empty text="Açık pozisyon bulunamadı." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] border-separate border-spacing-y-2 text-sm">
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
          {trades.map((t) => (
            <tr key={t.id} className="bg-white/[0.035] hover:bg-white/[0.07]">
              <td className="rounded-l-2xl px-4 py-4 font-bold">{t.symbol}</td>
              <td className="px-4 py-4">
                <Badge tone={t.side === "LONG" ? "good" : "bad"}>{t.side}</Badge>
              </td>
              <td className="px-4 py-4 text-slate-300">{t.strategy}</td>
              <td className="px-4 py-4">{money(t.price)}</td>
              <td className="px-4 py-4 text-slate-400">
                {t.stopLoss ? money(t.stopLoss) : "-"}
              </td>
              <td className="px-4 py-4 text-slate-400">
                {t.takeProfit ? money(t.takeProfit) : "-"}
              </td>
              <td className="px-4 py-4">
                <MiniBar value={t.confidence} />
              </td>
              <td className={t.pnl >= 0 ? "px-4 py-4 font-bold text-emerald-300" : "px-4 py-4 font-bold text-rose-300"}>
                {money(t.pnl)} ₺
              </td>
              <td className="rounded-r-2xl px-4 py-4 text-slate-400">
                {shortTime(t.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskDesk({
  exposure,
  openPnl,
  openCount,
}: {
  exposure: number;
  openPnl: number;
  openCount: number;
}) {
  return (
    <Panel title="Risk Desk" sub="Pozisyon yoğunluğu, risk ve bias">
      <div className="space-y-4">
        <RiskBar label="Exposure" value={exposure} />
        <RiskBar label="Capacity" value={(openCount / 5) * 100} />
        <div className="grid grid-cols-2 gap-3">
          <Info label="Risk Level" value={exposure >= 80 ? "HIGH" : "NORMAL"} tone={exposure >= 80 ? "warn" : "good"} />
          <Info label="PnL Bias" value={openPnl >= 0 ? "POSITIVE" : "NEGATIVE"} tone={openPnl >= 0 ? "good" : "bad"} />
        </div>
      </div>
    </Panel>
  );
}

function Watchlist({ trades }: { trades: Trade[] }) {
  const rows = trades.slice(0, 6);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
      <h2 className="text-lg font-bold">Watchlist Intelligence</h2>
      <p className="mb-4 text-sm text-slate-400">Son sinyal yoğunluğu</p>
      <div className="space-y-2">
        {rows.length ? rows.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-2xl bg-black/25 p-3">
            <div>
              <div className="font-bold">{t.symbol}</div>
              <div className="text-xs text-slate-500">{t.strategy}</div>
            </div>
            <Badge tone={t.side === "LONG" ? "good" : "bad"}>{t.side}</Badge>
          </div>
        )) : <Empty text="Henüz sinyal yok." />}
      </div>
    </div>
  );
}

function Heatmap() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
      <h2 className="text-lg font-bold">Market Heatmap</h2>
      <p className="mb-4 text-sm text-slate-400">Örnek sektör/momentum matrisi</p>
      <div className="grid grid-cols-3 gap-2">
        {mockHeatmap.map(([s, v]) => {
          const val = Number(v);
          return (
            <div
              key={String(s)}
              className={`rounded-2xl p-3 text-center text-xs ${
                val >= 0
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-rose-400/10 text-rose-300"
              }`}
            >
              <div className="font-bold">{s}</div>
              <div>{val > 0 ? "+" : ""}{val}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SignalFlow({ trades }: { trades: Trade[] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
      <h2 className="text-lg font-bold">Signal Flow</h2>
      <p className="mb-4 text-sm text-slate-400">Canlı TradingView akışı</p>
      <div className="space-y-2">
        {trades.slice(0, 7).map((t) => (
          <div key={t.id} className="rounded-2xl bg-black/25 p-3">
            <div className="flex justify-between">
              <span className="font-bold">{t.symbol}</span>
              <span className={t.side === "LONG" ? "text-emerald-300" : "text-rose-300"}>
                {t.side}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">{shortTime(t.createdAt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StrategyLab({ trades }: { trades: Trade[] }) {
  const avgConfidence = trades.length
    ? Math.round(trades.reduce((a, b) => a + b.confidence, 0) / trades.length)
    : 0;

  return (
    <div className="space-y-4">
      <Info label="Market Regime" value="RISK-ON / MOMENTUM" tone="good" />
      <Info label="Average Confidence" value={`%${avgConfidence}`} tone="neutral" />
      <Info label="Dominant Strategy" value="EMA100 CORE" tone="good" />
      <Info label="Automation Status" value="SIGNAL MODE ACTIVE" tone="warn" />
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

function EquityCurve({ values }: { values: number[] }) {
  const base = values.length ? values : [0, 1, -1, 2, -2, 3];
  let acc = 0;
  const cumulative = base.map((v) => {
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
          <linearGradient id="curve" x1="0" x2="1">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="60%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="url(#curve)" strokeWidth="5" />
        <line x1="0" y1="260" x2="1000" y2="260" stroke="rgba(255,255,255,.12)" />
      </svg>
    </div>
  );
}

function Info({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  const cls =
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
      <p className={`mt-2 font-bold ${cls}`}>{value}</p>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "good" | "bad" | "warn" }) {
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

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-500">
      {text}
    </div>
  );
}