"use client";

import { useEffect, useState, useCallback } from "react";

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
  generatedAt: string;
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
// Renk yardımcıları
// ---------------------------------------------------------------------------
function decisionColor(d: string) {
  if (d === "EXIT") return "#ff4444";
  if (d === "REDUCE") return "#ff9900";
  if (d === "WATCH") return "#f0c040";
  return "#00d2c8";
}

function decisionBg(d: string) {
  if (d === "EXIT") return "rgba(255,68,68,0.15)";
  if (d === "REDUCE") return "rgba(255,153,0,0.15)";
  if (d === "WATCH") return "rgba(240,192,64,0.15)";
  return "rgba(0,210,200,0.12)";
}

function pnlColor(v: number) {
  return v >= 0 ? "#00d2c8" : "#ff4444";
}

function riskColor(level: string) {
  if (level === "HIGH") return "#ff4444";
  if (level === "MEDIUM") return "#ff9900";
  return "#00d2c8";
}

function scoreColor(s: number) {
  if (s < 35) return "#ff4444";
  if (s < 50) return "#ff9900";
  if (s < 65) return "#f0c040";
  return "#00d2c8";
}

function heatColor(pnl: number, score: number) {
  if (score < 35) return "rgba(255,68,68,0.25)";
  if (pnl > 3) return "rgba(0,210,200,0.2)";
  if (pnl > 0) return "rgba(0,210,200,0.1)";
  if (pnl > -2) return "rgba(255,153,0,0.15)";
  return "rgba(255,68,68,0.2)";
}

function fmt(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}%${Math.abs(n).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Bileşenler
// ---------------------------------------------------------------------------

function SummaryCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8,
      padding: "12px 16px",
      minWidth: 120,
    }}>
      <div style={{ fontSize: 10, color: "#888", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? "#e8e8e8", fontFamily: "monospace", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#666", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 10, letterSpacing: 2, color: "#00d2c8", textTransform: "uppercase",
        marginBottom: 12, fontFamily: "monospace",
        borderBottom: "1px solid rgba(0,210,200,0.2)", paddingBottom: 6,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ana sayfa
// ---------------------------------------------------------------------------
export default function PortfolioPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [expandedMomentum, setExpandedMomentum] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolio-analytics?secret=ema100_secret_2026");
      const json = await res.json();
      if (json.ok) {
        setData(json);
        setLastUpdate(new Date().toLocaleTimeString("tr-TR"));
        setError(null);
      } else {
        setError(json.error ?? "Bilinmeyen hata");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return (
    <div style={{ background: "#0a0b0f", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#00d2c8", fontFamily: "monospace", fontSize: 14 }}>
      Portföy verisi yükleniyor...
    </div>
  );

  if (error) return (
    <div style={{ background: "#0a0b0f", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#ff4444", fontFamily: "monospace" }}>
      Hata: {error}
    </div>
  );

  if (!data) return null;

  const { summary, sectorExposure, correlationGroups, cashAllocation, positionSizeRecommendations, momentumScores, heatMap } = data;

  return (
    <div style={{
      background: "#0a0b0f",
      minHeight: "100vh",
      color: "#e0e0e0",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      fontSize: 13,
    }}>
      {/* HEADER */}
      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "14px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(0,0,0,0.3)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#00d2c8",
            boxShadow: "0 0 8px #00d2c8",
          }} />
          <span style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: 2, color: "#888", textTransform: "uppercase" }}>
            Portfolio Intelligence Center
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 11, color: "#555", fontFamily: "monospace" }}>
            Son güncelleme: {lastUpdate}
          </span>
          <button
            onClick={fetchData}
            style={{
              background: "rgba(0,210,200,0.1)",
              border: "1px solid rgba(0,210,200,0.3)",
              color: "#00d2c8",
              borderRadius: 4,
              padding: "4px 12px",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "monospace",
              letterSpacing: 1,
            }}
          >
            YENİLE
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ÖZET KARTLAR */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
          <SummaryCard
            label="Portföy Riski"
            value={`${summary.riskScore}/100`}
            sub={summary.riskLevel}
            color={riskColor(summary.riskLevel)}
          />
          <SummaryCard
            label="Exposure"
            value={`%${summary.exposurePct}`}
            sub={`${summary.openPositions}/${cashAllocation.maxPositions} pozisyon`}
            color="#e0e0e0"
          />
          <SummaryCard
            label="Kullanılan Sermaye"
            value={`${fmt(cashAllocation.usedAmount)} ₺`}
            sub={`Boş: ${fmt(cashAllocation.freeAmount)} ₺`}
          />
          <SummaryCard
            label="Boş Slot"
            value={`${cashAllocation.availableSlots}`}
            sub="yeni pozisyon açılabilir"
            color={cashAllocation.availableSlots > 0 ? "#00d2c8" : "#888"}
          />
          <SummaryCard
            label="Korelasyon Uyarısı"
            value={`${summary.correlationWarnings}`}
            sub="aynı sektör grubu"
            color={summary.correlationWarnings > 0 ? "#ff9900" : "#00d2c8"}
          />
          <SummaryCard
            label="Aksiyon Gereken"
            value={`${summary.exitCandidates + summary.reduceCandidates}`}
            sub={`${summary.exitCandidates} EXIT · ${summary.reduceCandidates} REDUCE`}
            color={summary.exitCandidates > 0 ? "#ff4444" : summary.reduceCandidates > 0 ? "#ff9900" : "#00d2c8"}
          />
        </div>

        {/* ANA GRID */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>

          {/* SOL SÜTUN: SEKTÖR EXPOSURE + KORELASYON */}
          <div>
            <Section title="Sektör Dağılımı">
              {sectorExposure.map(s => (
                <div key={s.sector} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#ccc" }}>{s.sector}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: pnlColor(s.avgPnlPct), fontFamily: "monospace" }}>
                        {fmtPct(s.avgPnlPct)}
                      </span>
                      <span style={{ fontSize: 12, color: "#00d2c8", fontFamily: "monospace", fontWeight: 600 }}>
                        %{s.pct}
                      </span>
                    </div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 3, height: 6, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(s.pct * 2.5, 100)}%`,
                      background: s.pct > 25 ? "#ff9900" : "#00d2c8",
                      borderRadius: 3,
                      transition: "width 0.5s ease",
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>
                    {s.symbols.join(" · ")} · {fmt(s.allocatedAmount)} ₺
                  </div>
                </div>
              ))}
            </Section>

            <Section title="Korelasyon Grupları">
              {correlationGroups.length === 0 ? (
                <div style={{ fontSize: 12, color: "#555", fontStyle: "italic" }}>Korelasyon riski yok.</div>
              ) : correlationGroups.map(g => (
                <div key={g.sector} style={{
                  background: "rgba(255,153,0,0.08)",
                  border: "1px solid rgba(255,153,0,0.2)",
                  borderRadius: 6,
                  padding: "10px 12px",
                  marginBottom: 8,
                }}>
                  <div style={{ fontSize: 11, color: "#ff9900", fontFamily: "monospace", marginBottom: 4 }}>
                    ⚠ {g.sector}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                    {g.symbols.map(s => (
                      <span key={s} style={{
                        background: "rgba(255,153,0,0.15)",
                        border: "1px solid rgba(255,153,0,0.3)",
                        borderRadius: 3,
                        padding: "2px 6px",
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: "#ff9900",
                      }}>{s}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: "#888" }}>{g.warning}</div>
                </div>
              ))}
            </Section>

            <Section title="Pozisyon Boyutu">
              {positionSizeRecommendations.map(r => (
                <div key={r.symbol} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <div>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#e0e0e0" }}>{r.symbol}</span>
                    <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{r.message}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontFamily: "monospace", color: "#ccc" }}>{fmt(r.currentAmount)} ₺</div>
                    <span style={{
                      fontSize: 10,
                      color: r.status === "OK" ? "#00d2c8" : r.status === "LARGE" ? "#ff9900" : "#888",
                      fontFamily: "monospace",
                    }}>
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </Section>
          </div>

          {/* ORTA SÜTUN: HEAT MAP */}
          <div>
            <Section title="Portföy Heat Map">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {heatMap.map(h => (
                  <div key={h.symbol} style={{
                    background: heatColor(h.pnlPct, h.momentumScore),
                    border: `1px solid ${h.decision === "EXIT" ? "rgba(255,68,68,0.4)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 8,
                    padding: "12px",
                    cursor: "default",
                    transition: "all 0.2s",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#e8e8e8" }}>
                        {h.symbol}
                      </div>
                      <span style={{
                        fontSize: 9,
                        background: decisionBg(h.decision),
                        border: `1px solid ${decisionColor(h.decision)}44`,
                        color: decisionColor(h.decision),
                        borderRadius: 3,
                        padding: "2px 5px",
                        fontFamily: "monospace",
                        letterSpacing: 0.5,
                      }}>
                        {h.decision}
                      </span>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 10, color: "#666" }}>PnL</div>
                        <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 600, color: pnlColor(h.pnlPct) }}>
                          {fmtPct(h.pnlPct)}
                        </div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: "#666" }}>Skor</div>
                        <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 600, color: scoreColor(h.momentumScore) }}>
                          {h.momentumScore}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "#666" }}>Gün</div>
                        <div style={{ fontSize: 14, fontFamily: "monospace", color: h.daysOpen > 21 ? "#ff9900" : "#888" }}>
                          {h.daysOpen}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 10, color: "#555" }}>{h.sector}</div>
                      <div style={{ fontSize: 10, color: "#555" }}>{fmt(h.allocatedAmount)} ₺ · {h.side}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Risk Göstergesi */}
            <Section title="Portföy Risk Skoru">
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ position: "relative", display: "inline-block", width: 160, height: 80 }}>
                  {/* Yarım daire arka plan */}
                  <svg width="160" height="90" viewBox="0 0 160 90">
                    <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round"/>
                    <path
                      d="M 10 80 A 70 70 0 0 1 150 80"
                      fill="none"
                      stroke={riskColor(summary.riskLevel)}
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${(summary.riskScore / 100) * 220} 220`}
                      style={{ transition: "stroke-dasharray 1s ease" }}
                    />
                  </svg>
                  <div style={{
                    position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "monospace", color: riskColor(summary.riskLevel) }}>
                      {summary.riskScore}
                    </div>
                    <div style={{ fontSize: 10, color: "#666", marginTop: -2 }}>/100</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: riskColor(summary.riskLevel), fontFamily: "monospace", letterSpacing: 2, marginTop: 4 }}>
                  {summary.riskLevel === "LOW" ? "DÜŞÜK RİSK" : summary.riskLevel === "MEDIUM" ? "ORTA RİSK" : "YÜKSEK RİSK"}
                </div>
              </div>
            </Section>
          </div>

          {/* SAĞ SÜTUN: MOMENTUM SKORLARI */}
          <div>
            <Section title="Momentum Analizi">
              {momentumScores.map(m => (
                <div key={m.symbol}>
                  <div
                    onClick={() => setExpandedMomentum(expandedMomentum === m.symbol ? null : m.symbol)}
                    style={{
                      background: expandedMomentum === m.symbol ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${decisionColor(m.decision)}22`,
                      borderRadius: 8,
                      padding: "10px 12px",
                      marginBottom: 8,
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#e8e8e8" }}>
                          {m.symbol}
                        </span>
                        <span style={{ fontSize: 10, color: "#555" }}>{m.daysOpen}g · {m.sector}</span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        background: decisionBg(m.decision),
                        border: `1px solid ${decisionColor(m.decision)}55`,
                        color: decisionColor(m.decision),
                        borderRadius: 4,
                        padding: "3px 8px",
                        fontFamily: "monospace",
                        letterSpacing: 0.5,
                      }}>
                        {m.decision}
                      </span>
                    </div>

                    {/* Skor bar */}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: "#555" }}>Momentum</span>
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: scoreColor(m.score) }}>{m.score}/100</span>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 3, height: 4 }}>
                        <div style={{
                          height: "100%",
                          width: `${m.score}%`,
                          background: scoreColor(m.score),
                          borderRadius: 3,
                          transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                  </div>

                  {/* Genişletilmiş detay */}
                  {expandedMomentum === m.symbol && m.signals.length > 0 && (
                    <div style={{
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 6,
                      padding: "10px 12px",
                      marginBottom: 8,
                      marginTop: -4,
                    }}>
                      <div style={{ fontSize: 10, color: "#555", marginBottom: 6, letterSpacing: 1 }}>UYARI SİNYALLERİ</div>
                      {m.signals.map((sig, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                          <span style={{ color: "#ff9900", fontSize: 10, marginTop: 1 }}>▸</span>
                          <span style={{ fontSize: 11, color: "#aaa" }}>{sig}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </Section>
          </div>

        </div>
      </div>
    </div>
  );
}
