"use client";

import { useCallback, useEffect, useState } from "react";

const MONITOR_SECRET = "ema100_secret_2026";

type Decision = {
  type: string;
  symbol: string;
  reason: string;
  urgency: string;
};

type ReportData = {
  summary: string | null;
  monthlyOutlook: string | null;
  decisions: Decision[];
  generatedAt: string;
  source: string;
};

export default function PortfolioReportCard() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mount'ta son raporu DB'den geri yükle (agent_run_log — Claude çağrısı
  // YOK, sadece okuma). "Yenile" davranışı değişmedi: hâlâ canlı analiz üretir.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/last-report?secret=${MONITOR_SECRET}`);
        const json = await res.json();
        if (!cancelled && json.ok && json.report) {
          setReport({
            summary: json.report.summary,
            monthlyOutlook: json.report.monthlyOutlook,
            decisions: json.report.decisions ?? [],
            generatedAt: json.report.runAt,
            source: json.report.triggerSource ?? "bilinmiyor",
          });
        }
      } catch {
        // sessiz: geri yükleme başarısızsa kart boş başlar, Yenile çalışır
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portfolio-ai-agent?secret=${MONITOR_SECRET}&reportOnly=1&trigger=manual_page_refresh`
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Rapor alınamadı");
      setReport({
        summary: json.summary ?? null,
        monthlyOutlook: json.monthlyOutlook ?? null,
        decisions: json.decisions ?? [],
        generatedAt: json.generatedAt,
        source: "canlı analiz (Yenile)",
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const highUrgency = (report?.decisions ?? []).filter(
    (d) => d.urgency === "HIGH" && d.type !== "HOLD"
  );

  return (
    <div className="flex h-[380px] flex-col rounded-2xl border border-zinc-800 bg-[#070b12] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">
          Portföy Değerlendirme Raporu
        </div>
        <button
          onClick={fetchReport}
          disabled={loading}
          className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300 transition hover:bg-cyan-400/20 disabled:opacity-40"
        >
          {loading ? "Analiz ediliyor..." : "Yenile"}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {restoring && !report && (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-zinc-600">
            Son rapor yükleniyor...
          </div>
        )}

        {!report && !loading && !restoring && !error && (
          <div className="flex h-full items-center justify-center text-center text-xs text-zinc-600">
            Henüz kayıtlı rapor yok — Yenile&apos;ye bas.
            <br />
            (AI analizi ~15-20 sn sürer)
          </div>
        )}

        {loading && (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-zinc-500">
            Portföy analiz ediliyor...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-300">
            Hata: {error}
          </div>
        )}

        {report && !loading && (
          <>
            {highUrgency.length > 0 && (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-3">
                <div className="mb-2 text-[9px] uppercase tracking-[0.18em] text-red-300">
                  ⚠ Acil Aksiyon Önerileri
                </div>
                <div className="space-y-1.5">
                  {highUrgency.map((d, i) => (
                    <div key={i} className="text-[11px] text-zinc-300">
                      <span className="font-bold text-red-300">{d.type}</span>
                      {" · "}
                      <span className="font-bold">{d.symbol}</span> — {d.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.summary && (
              <div>
                <div className="mb-1 text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                  Genel Değerlendirme
                </div>
                <p className="text-[12px] leading-relaxed text-zinc-300">{report.summary}</p>
              </div>
            )}

            {report.monthlyOutlook && (
              <div>
                <div className="mb-1 text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                  Aylık Hedef Tahmini
                </div>
                <p className="text-[12px] leading-relaxed text-zinc-300">
                  {report.monthlyOutlook}
                </p>
              </div>
            )}

            <div className="text-[9px] text-zinc-600">
              Oluşturma: {new Date(report.generatedAt).toLocaleString("tr-TR")} · kaynak: {report.source}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
