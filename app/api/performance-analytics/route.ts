import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Reddedilen/açılmayan öneri listesinde gösterilecek maksimum kayıt.
const S5_LIST_LIMIT = 30;

// ---------------------------------------------------------------------------
// GEÇMİŞ PERFORMANS ANALİZİ
// ADIM 2 denetiminde (salt-okuma) Python'da hesaplanan S1/S3/S4/S2-alt/S5
// metriklerinin canlı, endpoint karşılığı. Yeni tablo/kolon YOK; positions +
// ai_decisions üzerinden anlık hesaplanır (veri hacmi küçük, cache gereksiz).
// KÂR/ZARAR İDDİASI YOK olan tek yer S5: reddedilen önerilerin sonraki fiyat
// hareketi tutulmadığı için yalnızca karar geçmişi dökümüdür.
// ---------------------------------------------------------------------------

interface PositionRow {
  symbol: string;
  side: string;
  status: string;
  pnl_amount: number | null;
  pnl_pct: number | null;
  opened_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
  strategy_tag: string | null;
  timeframe: string | null;
}

interface DecisionRow {
  created_at: string;
  decision_type: string;
  symbol: string | null;
  reason: string | null;
  details: unknown;
  executed: boolean | null;
  status: string | null;
  suggested_side: string | null;
  suggested_price: number | null;
}

export async function GET(req: NextRequest) {
  try {
    const secret =
      req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-monitor-secret");
    const MONITOR_SECRET =
      process.env.RISK_MONITOR_SECRET ??
      process.env.TRADINGVIEW_WEBHOOK_SECRET ??
      "ema100_secret_2026";
    if (secret !== MONITOR_SECRET) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Tarih filtresi: range=7 | 30 | all (default all). CLOSED işlemler
    // closed_at'e, öneriler created_at'e, churn opened/closed'a göre süzülür.
    const rangeParam = req.nextUrl.searchParams.get("range") ?? "all";
    const rangeDays = rangeParam === "7" ? 7 : rangeParam === "30" ? 30 : null;
    const cutoffMs = rangeDays ? Date.now() - rangeDays * 86_400_000 : null;
    const inRange = (iso: string | null) =>
      cutoffMs == null || (iso != null && new Date(iso).getTime() >= cutoffMs);

    const [{ data: posData, error: posErr }, { data: decData, error: decErr }] =
      await Promise.all([
        supabase
          .from("positions")
          .select(
            "symbol,side,status,pnl_amount,pnl_pct,opened_at,closed_at,close_reason,strategy_tag,timeframe"
          )
          .limit(2000),
        supabase
          .from("ai_decisions")
          .select(
            "created_at,decision_type,symbol,reason,details,executed,status,suggested_side,suggested_price"
          )
          .eq("decision_type", "RECOMMEND_OPEN")
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);

    if (posErr) throw posErr;
    if (decErr) throw decErr;

    const allPositions = (posData ?? []) as PositionRow[];
    const allDecisions = (decData ?? []) as DecisionRow[];

    const closed = allPositions.filter(
      (p) => p.status === "CLOSED" && p.pnl_amount != null && inRange(p.closed_at)
    );
    const open = allPositions.filter((p) => p.status === "OPEN");
    const decisions = allDecisions.filter((d) => inRange(d.created_at));
    // Churn için: seçili pencerede açılmış VEYA kapanmış pozisyonlar.
    const positionsInRange = allPositions.filter(
      (p) => inRange(p.closed_at) || inRange(p.opened_at)
    );

    // ---- KAPSAM ----
    const openDates = closed
      .map((p) => p.opened_at)
      .filter((x): x is string => !!x)
      .sort();
    const closeDates = closed
      .map((p) => p.closed_at)
      .filter((x): x is string => !!x)
      .sort();
    const tradingDays = new Set(openDates.map((d) => d.slice(0, 10))).size;

    // ---- S1: TOPLAM PERFORMANS ----
    const pnls = closed.map((p) => p.pnl_amount as number);
    const totalRealizedPnl = round2(sum(pnls));
    const withHold = closed.map((p) => ({
      symbol: p.symbol,
      pnl: round2(p.pnl_amount as number),
      holdHours: holdHours(p.opened_at, p.closed_at),
    }));
    const bySortedPnl = [...withHold].sort((a, b) => a.pnl - b.pnl);
    const byMonthMap = new Map<string, number[]>();
    for (const p of closed) {
      const m = (p.opened_at ?? "").slice(0, 7);
      if (!byMonthMap.has(m)) byMonthMap.set(m, []);
      byMonthMap.get(m)!.push(p.pnl_amount as number);
    }
    const byMonth = Array.from(byMonthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, arr]) => ({
        month,
        count: arr.length,
        pnl: round2(sum(arr)),
        winRate: round1((arr.filter((x) => x > 0).length / arr.length) * 100),
      }));

    // Düzeltilmiş equity curve: CLOSED işlemler closed_at'e göre kronolojik,
    // kümülatif realized pnl_amount (TL). Eski panelin pnlPct+open karışımı DEĞİL.
    const equityCurve = [...closed]
      .filter((p) => p.closed_at)
      .sort((a, b) => ((a.closed_at as string) < (b.closed_at as string) ? -1 : 1))
      .reduce<{ t: string; cum: number }[]>((acc, p) => {
        const prev = acc.length ? acc[acc.length - 1].cum : 0;
        acc.push({ t: p.closed_at as string, cum: round2(prev + (p.pnl_amount as number)) });
        return acc;
      }, []);

    const s1 = {
      totalRealizedPnl,
      tradeCount: closed.length,
      avgPnl: round2(totalRealizedPnl / (closed.length || 1)),
      medianPnl: round2(median(pnls)),
      best3: bySortedPnl.slice(-3).reverse(),
      worst3: bySortedPnl.slice(0, 3),
      byMonth,
      equityCurve,
    };

    // ---- S3: YÖN TARAFLILIĞI ----
    const s3 = {
      long: sideStats(closed, "LONG"),
      short: sideStats(closed, "SHORT"),
    };

    // ---- S4: İŞLEM KALİTESİ ----
    const winners = closed.filter((p) => (p.pnl_amount as number) > 0);
    const losers = closed.filter((p) => (p.pnl_amount as number) <= 0);
    const avgWin = winners.length ? sum(winners.map((p) => p.pnl_amount as number)) / winners.length : 0;
    const avgLoss = losers.length ? sum(losers.map((p) => p.pnl_amount as number)) / losers.length : 0;

    const reasonMap = new Map<string, { count: number; pnl: number }>();
    for (const p of closed) {
      const key = normalizeReason(p.close_reason);
      if (!reasonMap.has(key)) reasonMap.set(key, { count: 0, pnl: 0 });
      const r = reasonMap.get(key)!;
      r.count += 1;
      r.pnl += p.pnl_amount as number;
    }
    const closeReasons = Array.from(reasonMap.entries())
      .map(([reason, v]) => ({
        reason,
        count: v.count,
        totalPnl: round2(v.pnl),
        avgPnl: round2(v.pnl / v.count),
      }))
      .sort((a, b) => b.totalPnl - a.totalPnl);

    // Churn: sembol bazında tekrar sayısı (tüm pozisyonlar), kapanan PnL'i
    const symbolCount = new Map<string, number>();
    positionsInRange.forEach((p) => symbolCount.set(p.symbol, (symbolCount.get(p.symbol) ?? 0) + 1));
    const repeatedSymbols = [...symbolCount.entries()].filter(([, c]) => c > 1).map(([s]) => s);
    const closedPnlBySymbol = (sym: string) =>
      round2(sum(closed.filter((p) => p.symbol === sym).map((p) => p.pnl_amount as number)));
    const churnTop5 = [...symbolCount.entries()]
      .filter(([, c]) => c > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([symbol, tradeCount]) => ({ symbol, tradeCount, closedPnl: closedPnlBySymbol(symbol) }));
    const allRepeatedClosedPnl = round2(
      sum(closed.filter((p) => repeatedSymbols.includes(p.symbol)).map((p) => p.pnl_amount as number))
    );

    const s4 = {
      winRate: round1((winners.length / (closed.length || 1)) * 100),
      winCount: winners.length,
      lossCount: losers.length,
      avgWin: round2(avgWin),
      avgLoss: round2(avgLoss),
      winLossRatio: avgLoss !== 0 ? round2(Math.abs(avgWin / avgLoss)) : null,
      avgHoldWinnersHours: round1(avgHold(winners)),
      avgHoldLosersHours: round1(avgHold(losers)),
      closeReasons,
      churn: {
        repeatedSymbolCount: repeatedSymbols.length,
        allRepeatedClosedPnl,
        top5: churnTop5,
      },
    };

    // ---- S2-alt: SİSTEM KESİTİ ----
    const s2alt = {
      byStrategy: ["AI_AGENT", "EMA100_PRO_V6_9"].map((tag) => tagStats(closed, (p) => p.strategy_tag === tag, tag)),
      byTimeframe: [
        tagStats(closed, (p) => tfBucket(p.timeframe) === "spot", "spot"),
        tagStats(closed, (p) => tfBucket(p.timeframe) === "4h", "4h"),
      ],
      confoundNote:
        "Sistem, timeframe ve ay kesitleri bu veride AYNI bölünmeye denk gelir (EMA100_PRO=4h=Haziran, AI_AGENT=spot=Temmuz); bu üç değişken ayrıştırılamaz.",
    };

    // ---- S5: ÖNERİ HACMİ (kâr/zarar iddiası YOK) ----
    const totalRec = decisions.length;
    const openedRec = decisions.filter((d) => d.executed === true).length;
    const rejectedRec = decisions.filter((d) => d.status === "REJECTED").length;
    const approvedNotOpened = totalRec - openedRec - rejectedRec;

    const notExecuted = decisions.filter((d) => d.executed !== true); // reddedilen + onaylı-açılmamış
    const s5List = notExecuted.slice(0, S5_LIST_LIMIT).map((d) => ({
      symbol: d.symbol,
      createdAt: d.created_at,
      type: d.decision_type,
      side: d.suggested_side,
      status: d.status === "REJECTED" ? "REJECTED" : "ONAYLANDI_ACILMADI",
      reason: d.reason ?? extractDetail(d.details),
      suggestedPrice: d.suggested_price,
    }));

    const s5 = {
      note: "Bu önerilerin reddedilme sonrası performansı ölçülmüyor — sadece karar geçmişi.",
      total: totalRec,
      opened: openedRec,
      rejected: rejectedRec,
      approvedNotOpened,
      list: s5List,
      listShown: s5List.length,
      listTotal: notExecuted.length,
      hasMore: notExecuted.length > S5_LIST_LIMIT,
    };

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      range: rangeParam === "7" || rangeParam === "30" ? rangeParam : "all",
      sampleWarning: `${closed.length} kapanmış işlem · ${tradingDays} işlem günü · Sonuçlar yön gösterir, istatistiksel kesinlik taşımaz.`,
      coverage: {
        closedTrades: closed.length,
        openPositions: open.length,
        firstOpen: openDates[0] ?? null,
        lastClose: closeDates[closeDates.length - 1] ?? null,
        tradingDays,
      },
      s1_totalPerformance: s1,
      s3_direction: s3,
      s4_quality: s4,
      s2alt_system: s2alt,
      s5_recommendations: s5,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("PERFORMANCE_ANALYTICS_ERROR", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function holdHours(openedAt: string | null, closedAt: string | null): number {
  if (!openedAt || !closedAt) return 0;
  return round1((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 3_600_000);
}
function avgHold(rows: PositionRow[]): number {
  if (!rows.length) return 0;
  return sum(rows.map((p) => holdHours(p.opened_at, p.closed_at))) / rows.length;
}
function sideStats(closed: PositionRow[], side: string) {
  const g = closed.filter((p) => p.side === side);
  const w = g.filter((p) => (p.pnl_amount as number) > 0).length;
  return {
    count: g.length,
    pnl: round2(sum(g.map((p) => p.pnl_amount as number))),
    winRate: g.length ? round1((w / g.length) * 100) : 0,
  };
}
function tagStats(closed: PositionRow[], pred: (p: PositionRow) => boolean, label: string) {
  const g = closed.filter(pred);
  const w = g.filter((p) => (p.pnl_amount as number) > 0).length;
  const pnl = sum(g.map((p) => p.pnl_amount as number));
  return {
    label,
    count: g.length,
    pnl: round2(pnl),
    winRate: g.length ? round1((w / g.length) * 100) : 0,
    avgPnl: g.length ? round2(pnl / g.length) : 0,
  };
}
function tfBucket(tf: string | null): "spot" | "4h" {
  return tf == null || tf === "-" || tf === "" ? "spot" : "4h";
}
function normalizeReason(r: string | null): string {
  if (!r) return "NULL";
  return r.split(":")[0].trim();
}
function extractDetail(details: unknown): string | null {
  if (!details) return null;
  if (typeof details === "string") return details;
  if (typeof details === "object" && details !== null && "detail" in details) {
    const d = (details as { detail?: unknown }).detail;
    return typeof d === "string" ? d : null;
  }
  return null;
}
