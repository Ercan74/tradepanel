"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------
interface SectorExposure {
  sector: string;
  allocatedAmount: number;
  pct: number;
  positionCount: number;
  symbols: string[];
  avgPnlPct: number;
}

interface CorrelationGroup {
  sector: string;
  symbols: string[];
  warning: string;
}

interface CashAllocation {
  totalCapital: number;
  usedAmount: number;
  freeAmount: number;
  exposurePct: number;
  openPositions: number;
  maxPositions: number;
  availableSlots: number;
}

interface PositionSizeRec {
  symbol: string;
  sector: string | null;
  currentAmount: number;
  targetAmount: number;
  diff: number;
  status: "OK" | "LARGE" | "SMALL";
  message: string;
}

interface MomentumScore {
  symbol: string;
  sector: string | null;
  score: number;
  signals: string[];
  decision: "HOLD" | "WATCH" | "REDUCE" | "EXIT";
  daysOpen: number;
}

interface HeatMapItem {
  symbol: string;
  sector: string;
  side: string;
  allocatedAmount: number;
  pnlPct: number;
  momentumScore: number;
  decision: string;
  daysOpen: number;
}

interface AnalyticsData {
  ok: boolean;
  summary: {
    openPositions: number;
    totalAllocated: number;
    totalCapital: number;
    exposurePct: number;
    riskScore: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    correlationWarnings: number;
    exitCandidates: number;
    reduceCandidates: number;
  };
  sectorExposure: SectorExposure[];
  correlationGroups: CorrelationGroup[];
  cashAllocation: CashAllocation;
  positionSizeRecommendations: PositionSizeRec[];
  momentumScores: MomentumScore[];
  heatMap: HeatMapItem[];
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
function fmt(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}%${Math.abs(n).toFixed(2)}`;
}
function decisionClasses(d: string) {
  if (d === "EXIT") return "border-red-400/30 bg-red-400/10 text-red-300";
  if (d === "REDUCE") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  if (d === "WATCH") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
  return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
}
function pnlClasses(v: number) {
  return v >= 0 ? "text-cyan-300" : "text-red-400";
}
function riskClasses(level: string) {
  if (level === "HIGH") return "text-red-300";
  if (level === "MEDIUM") return "text-amber-300";
  return "text-emerald-300";
}
function scoreBarClasses(s: number) {
  if (s < 35) return "bg-red-500";
  if (s < 50) return "bg-amber-500";
  if (s < 65) return "bg-yellow-500";
  return "bg-cyan-500";
}
function heatBg(pnl: number, score: number) {
  if (score < 35) return "bg-red-500/10 border-red-500/20";
  if (pnl > 3) return "bg-cyan-500/10 border-cyan-500/20";
  if (pnl > 0) return "bg-cyan-500/5 border-white/10";
  if (pnl > -2) return "bg-amber-500/8 border-amber-500/20";
  return "bg-red-500/10 border-red-500/20";
}

const navItems = [
  { label: "Terminal", href: "/dashboard" },
  { label: "Positions", href: "/positions" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Signals", href: "/signals" },
  { label: "Analytics", href: "/analytics" },
  { label: "Replay", href: "/replay" },
  { label: "Strategy Lab", href: "/strategy-lab" },
  { label: "Risk", href: "/risk" },
  { label: "Settings", href: "/settings" },
];

// ---------------------------------------------------------------------------
// Ana bileşen
// ---------------------------------------------------------------------------
export default function PortfolioPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolio-analytics?secret=ema100_secret_2026");
      const json = await res.json();
      if (json.ok) {
        setData(json);
        setLastUpdate(new Date().toLocaleTimeString("tr-TR"));
        setError(null);
      } else {
        setError(json.error ?? "Hata");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#03050a] text-zinc-100">
      <div className="grid h-full w-full grid-cols-[76px_minmax(0,1fr)]">

        {/* SIDEBAR */}
        <aside className="flex h-screen flex-col border-r border-white/10 bg-[#050812]">
          <div className="flex h-[68px] items-center justify-center border-b border-white/10">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-sm font-black text-cyan-300">
              TI
            </div>
          </div>
          <nav className="flex-1 space-y-2 overflow-hidden px-2 py-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex h-11 items-center justify-center rounded-2xl border text-[10px] font-bold uppercase tracking-[0.12em] transition ${
                  item.href === "/portfolio"
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                    : "border-transparent bg-transparent text-zinc-600 hover:border-white/10 hover:bg-white/[0.03] hover:text-zinc-300"
                }`}
                title={item.label}
              >
                {item.label.slice(0, 2)}
              </Link>
            ))}
          </nav>
          <div className="border-t border-white/10 p-2">
            <div className="h-3 w-full rounded-full bg-emerald-400" />
          </div>
        </aside>

        {/* CONTENT */}
        <section className="grid h-screen min-w-0 grid-rows-[68px_minmax(0,1fr)] overflow-hidden">

          {/* TOPBAR */}
          <header className="flex min-w-0 items-center justify-between border-b border-white/10 bg-[#050812]/95 px-4">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-300">
                Portfolio Intelligence Center
              </div>
              <div className="mt-1 truncate text-xs text-zinc-500">
                Supabase · {loading ? "Yükleniyor..." : `Son güncelleme: ${lastUpdate}`} · 30s auto-refresh
              </div>
            </div>
            <button
              onClick={fetchData}
              className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300 transition hover:bg-cyan-400/20"
            >
              Yenile
            </button>
          </header>

          {/* MAIN CONTENT */}
          <div className="min-h-0 overflow-y-auto p-4">
            {loading && (
              <div className="flex h-full items-center justify-center text-xs text-zinc-500 uppercase tracking-widest">
                Portföy verisi yükleniyor...
              </div>
            )}
            {error && (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
                Hata: {error}
              </div>
            )}
            {data && !loading && (
              <div className="space-y-4">

                {/* ÖZET KARTLAR */}
                <div className="grid grid-cols-6 gap-3">
                  {[
                    {
                      label: "Portföy Riski",
                      value: `${data.summary.riskScore}/100`,
                      sub: data.summary.riskLevel,
                      cls: riskClasses(data.summary.riskLevel),
                    },
                    {
                      label: "Exposure",
                      value: `%${data.summary.exposurePct}`,
                      sub: `${data.summary.openPositions}/${data.cashAllocation.maxPositions} pozisyon`,
                      cls: "text-zinc-100",
                    },
                    {
                      label: "Kullanılan",
                      value: `${fmt(data.cashAllocation.usedAmount)} ₺`,
                      sub: `Boş: ${fmt(data.cashAllocation.freeAmount)} ₺`,
                      cls: "text-zinc-100",
                    },
                    {
                      label: "Boş Slot",
                      value: String(data.cashAllocation.availableSlots),
                      sub: "pozisyon açılabilir",
                      cls: data.cashAllocation.availableSlots > 0 ? "text-cyan-300" : "text-zinc-500",
                    },
                    {
                      label: "Korelasyon",
                      value: String(data.summary.correlationWarnings),
                      sub: "aynı sektör grubu",
                      cls: data.summary.correlationWarnings > 0 ? "text-amber-300" : "text-emerald-300",
                    },
                    {
                      label: "Aksiyon",
                      value: String(data.summary.exitCandidates + data.summary.reduceCandidates),
                      sub: `${data.summary.exitCandidates} EXIT · ${data.summary.reduceCandidates} REDUCE`,
                      cls: data.summary.exitCandidates > 0 ? "text-red-300" : data.summary.reduceCandidates > 0 ? "text-amber-300" : "text-emerald-300",
                    },
                  ].map((c) => (
                    <div key={c.label} className="rounded-2xl border border-zinc-800 bg-[#070b12] p-3">
                      <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">{c.label}</div>
                      <div className={`mt-1 text-xl font-black ${c.cls}`}>{c.value}</div>
                      <div className="mt-0.5 text-[10px] text-zinc-600">{c.sub}</div>
                    </div>
                  ))}
                </div>

                {/* 3 SÜTUN GRID */}
                <div className="grid grid-cols-3 gap-4">

                  {/* SOL: SEKTÖR + KORELASYON + BOYUT */}
                  <div className="space-y-4">

                    {/* Sektör Dağılımı */}
                    <div className="rounded-2xl border border-zinc-800 bg-[#070b12] p-4">
                      <div className="mb-3 text-[9px] uppercase tracking-[0.24em] text-cyan-300">Sektör Dağılımı</div>
                      <div className="space-y-3">
                        {data.sectorExposure.map(s => (
                          <div key={s.sector}>
                            <div className="mb-1 flex items-center justify-between">
                              <span className="truncate text-[11px] text-zinc-300">{s.sector}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`font-mono text-[10px] ${pnlClasses(s.avgPnlPct)}`}>
                                  {fmtPct(s.avgPnlPct)}
                                </span>
                                <span className="font-mono text-[11px] font-bold text-cyan-300">%{s.pct}</span>
                              </div>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900">
                              <div
                                className={`h-1.5 rounded-full transition-all ${s.pct > 25 ? "bg-amber-500" : "bg-cyan-500"}`}
                                style={{ width: `${Math.min(s.pct * 2.5, 100)}%` }}
                              />
                            </div>
                            <div className="mt-0.5 text-[9px] text-zinc-600">
                              {s.symbols.join(" · ")}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Korelasyon Grupları */}
                    <div className="rounded-2xl border border-zinc-800 bg-[#070b12] p-4">
                      <div className="mb-3 text-[9px] uppercase tracking-[0.24em] text-cyan-300">Korelasyon Grupları</div>
                      {data.correlationGroups.length === 0 ? (
                        <p className="text-[11px] text-zinc-600">Korelasyon riski yok.</p>
                      ) : (
                        <div className="space-y-2">
                          {data.correlationGroups.map(g => (
                            <div key={g.sector} className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
                              <div className="mb-1.5 text-[10px] font-bold text-amber-300">⚠ {g.sector}</div>
                              <div className="mb-1.5 flex flex-wrap gap-1">
                                {g.symbols.map(s => (
                                  <span key={s} className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                                    {s}
                                  </span>
                                ))}
                              </div>
                              <p className="text-[10px] text-zinc-500">{g.warning}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Pozisyon Boyutu */}
                    <div className="rounded-2xl border border-zinc-800 bg-[#070b12] p-4">
                      <div className="mb-3 text-[9px] uppercase tracking-[0.24em] text-cyan-300">Pozisyon Boyutu</div>
                      <div className="divide-y divide-zinc-800/60">
                        {data.positionSizeRecommendations.map(r => (
                          <div key={r.symbol} className="flex items-center justify-between py-2">
                            <div>
                              <div className="font-mono text-[12px] font-bold text-zinc-100">{r.symbol}</div>
                              <div className="text-[10px] text-zinc-600">{r.message}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-[11px] text-zinc-300">{fmt(r.currentAmount)} ₺</div>
                              <span className={`text-[10px] font-bold ${r.status === "OK" ? "text-emerald-300" : r.status === "LARGE" ? "text-amber-300" : "text-zinc-500"}`}>
                                {r.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>

                  {/* ORTA: HEAT MAP + RISK GAUGE */}
                  <div className="space-y-4">

                    {/* Heat Map */}
                    <div className="rounded-2xl border border-zinc-800 bg-[#070b12] p-4">
                      <div className="mb-3 text-[9px] uppercase tracking-[0.24em] text-cyan-300">Portföy Heat Map</div>
                      <div className="grid grid-cols-2 gap-2">
                        {data.heatMap.map(h => (
                          <div
                            key={h.symbol}
                            className={`rounded-xl border p-3 ${heatBg(h.pnlPct, h.momentumScore)}`}
                          >
                            <div className="flex items-start justify-between">
                              <span className="font-mono text-[13px] font-black text-zinc-100">{h.symbol}</span>
                              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${decisionClasses(h.decision)}`}>
                                {h.decision}
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                              <div>
                                <div className="text-[8px] text-zinc-600">PNL</div>
                                <div className={`font-mono text-[12px] font-black ${pnlClasses(h.pnlPct)}`}>
                                  {fmtPct(h.pnlPct)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[8px] text-zinc-600">SKOR</div>
                                <div className={`font-mono text-[12px] font-black ${h.momentumScore < 35 ? "text-red-300" : h.momentumScore < 65 ? "text-amber-300" : "text-cyan-300"}`}>
                                  {h.momentumScore}
                                </div>
                              </div>
                              <div>
                                <div className="text-[8px] text-zinc-600">GÜN</div>
                                <div className={`font-mono text-[12px] font-black ${h.daysOpen > 21 ? "text-amber-300" : "text-zinc-400"}`}>
                                  {h.daysOpen}
                                </div>
                              </div>
                            </div>
                            <div className="mt-1.5 text-[9px] text-zinc-600">
                              {h.sector} · {h.side}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Risk Gauge */}
                    <div className="rounded-2xl border border-zinc-800 bg-[#070b12] p-4">
                      <div className="mb-3 text-[9px] uppercase tracking-[0.24em] text-cyan-300">Portföy Risk Skoru</div>
                      <div className="flex flex-col items-center py-2">
                        <svg width="160" height="90" viewBox="0 0 160 90">
                          <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="14" strokeLinecap="round" />
                          <path
                            d="M 10 80 A 70 70 0 0 1 150 80"
                            fill="none"
                            stroke={data.summary.riskLevel === "HIGH" ? "#f87171" : data.summary.riskLevel === "MEDIUM" ? "#fbbf24" : "#34d399"}
                            strokeWidth="14"
                            strokeLinecap="round"
                            strokeDasharray={`${(data.summary.riskScore / 100) * 220} 220`}
                          />
                        </svg>
                        <div className={`-mt-6 text-4xl font-black ${riskClasses(data.summary.riskLevel)}`}>
                          {data.summary.riskScore}
                        </div>
                        <div className="text-[9px] text-zinc-500">/100</div>
                        <div className={`mt-1 text-[10px] font-bold uppercase tracking-[0.2em] ${riskClasses(data.summary.riskLevel)}`}>
                          {data.summary.riskLevel === "LOW" ? "Düşük Risk" : data.summary.riskLevel === "MEDIUM" ? "Orta Risk" : "Yüksek Risk"}
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* SAĞ: MOMENTUM */}
                  <div className="rounded-2xl border border-zinc-800 bg-[#070b12] p-4">
                    <div className="mb-3 text-[9px] uppercase tracking-[0.24em] text-cyan-300">Momentum Analizi</div>
                    <div className="space-y-2">
                      {data.momentumScores.map(m => (
                        <div key={m.symbol}>
                          <button
                            onClick={() => setExpanded(expanded === m.symbol ? null : m.symbol)}
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-left transition hover:border-zinc-700"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[13px] font-black text-zinc-100">{m.symbol}</span>
                                <span className="text-[9px] text-zinc-600">{m.daysOpen}g</span>
                              </div>
                              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider ${decisionClasses(m.decision)}`}>
                                {m.decision}
                              </span>
                            </div>
                            <div className="mt-2">
                              <div className="mb-1 flex justify-between">
                                <span className="text-[9px] text-zinc-600">Momentum</span>
                                <span className={`font-mono text-[9px] font-bold ${m.score < 35 ? "text-red-300" : m.score < 65 ? "text-amber-300" : "text-cyan-300"}`}>
                                  {m.score}/100
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${scoreBarClasses(m.score)}`}
                                  style={{ width: `${m.score}%` }}
                                />
                              </div>
                            </div>
                            {m.sector && (
                              <div className="mt-1 text-[9px] text-zinc-600">{m.sector}</div>
                            )}
                          </button>

                          {expanded === m.symbol && m.signals.length > 0 && (
                            <div className="mt-1 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                              <div className="mb-1.5 text-[9px] uppercase tracking-[0.18em] text-zinc-500">Sinyaller</div>
                              <ul className="space-y-1">
                                {m.signals.map((s, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-400">
                                    <span className="mt-0.5 text-amber-400 shrink-0">›</span>
                                    {s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
