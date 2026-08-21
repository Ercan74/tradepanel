import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// HAFTALIK PERFORMANS MINI-TRACKER (2026-08-21)
// ---------------------------------------------------------------------------
// Trailing R:R modeli (2026-08-17) + REDUCE emekliliği (2026-08-19) sonrası
// "temiz dönem" performansını haftalık dondurur. İki pencere:
//   ERA_CLEAN — 2026-08-19'dan bugüne KÜMÜLATİF (N büyürken R:R korunuyor mu)
//   LAST_7D   — son 7 gün (haftanın kendisi)
// Her ikisi de perf_snapshots'a yazılır + Telegram özeti gönderilir.
// Metrikler positions'tan türetilir (pnl_amount total-bazlı: realize + final dilim).
// ---------------------------------------------------------------------------

// Temiz-dönem başlangıcı: REDUCE emekliliği + haber-entegrasyonu miladı (aynı gün).
const ERA_CLEAN_START = process.env.PERF_ERA_CLEAN_START ?? "2026-08-18T21:00:00Z"; // 19/08 00:00 TR

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MONITOR_SECRET =
  process.env.RISK_MONITOR_SECRET ??
  process.env.TRADINGVIEW_WEBHOOK_SECRET ??
  "ema100_secret_2026";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

type Row = { pnl_amount: number | null; pnl_pct: number | null; closed_at: string };

type Stat = {
  window_label: string;
  window_from: string | null;
  n: number;
  wins: number;
  losses: number;
  flats: number;
  winrate: number;
  avg_win: number;
  avg_loss: number;
  rr: number;
  expectancy: number;
  total_pnl: number;
};

function computeStats(label: string, from: string | null, rows: Row[]): Stat {
  const n = rows.length;
  const wins = rows.filter((r) => Number(r.pnl_amount) > 0);
  const losses = rows.filter((r) => Number(r.pnl_amount) < 0);
  const flats = rows.filter((r) => Number(r.pnl_amount) === 0);
  const sum = (a: Row[]) => a.reduce((x, r) => x + Number(r.pnl_amount || 0), 0);
  const total = sum(rows);
  const avgWin = wins.length ? sum(wins) / wins.length : 0;
  const avgLoss = losses.length ? sum(losses) / losses.length : 0;
  const rr = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;
  return {
    window_label: label,
    window_from: from,
    n,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    winrate: n ? round2((wins.length / n) * 100) : 0,
    avg_win: round2(avgWin),
    avg_loss: round2(avgLoss),
    rr: round2(rr),
    expectancy: n ? round2(total / n) : 0,
    total_pnl: round2(total),
  };
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase server environment variables." },
        { status: 500 }
      );
    }

    const secret =
      req.nextUrl.searchParams.get("secret") ??
      req.headers.get("x-monitor-secret") ??
      req.headers.get("authorization")?.replace("Bearer ", "");

    if (secret !== MONITOR_SECRET) {
      return NextResponse.json({ ok: false, error: "Invalid secret" }, { status: 401 });
    }

    // reportOnly: yalnız hesapla + döndür (snapshot yazma / Telegram YOK) — test için.
    const reportOnly = req.nextUrl.searchParams.get("reportOnly") === "1";

    const last7From = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    // ERA_CLEAN için tek sorgu (en erken pencere); LAST_7D bunun alt kümesi.
    const { data, error } = await supabase
      .from("positions")
      .select("pnl_amount,pnl_pct,closed_at")
      .eq("status", "CLOSED")
      .gte("closed_at", ERA_CLEAN_START)
      .order("closed_at");
    if (error) throw error;

    const rows = (data ?? []).filter((r) => r.pnl_amount != null) as Row[];
    const era = computeStats("ERA_CLEAN", ERA_CLEAN_START, rows);
    const week = computeStats(
      "LAST_7D",
      last7From,
      rows.filter((r) => r.closed_at >= last7From)
    );

    if (!reportOnly) {
      const { error: insErr } = await supabase.from("perf_snapshots").insert([
        toRow(era),
        toRow(week),
      ]);
      if (insErr) throw insErr;
      await sendTelegram(formatMessage(era, week));
    }

    return NextResponse.json({ ok: true, reportOnly, era, week });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

function toRow(s: Stat) {
  return {
    window_label: s.window_label,
    window_from: s.window_from,
    n: s.n,
    wins: s.wins,
    losses: s.losses,
    flats: s.flats,
    winrate: s.winrate,
    avg_win: s.avg_win,
    avg_loss: s.avg_loss,
    rr: s.rr,
    expectancy: s.expectancy,
    total_pnl: s.total_pnl,
  };
}

function formatMessage(era: Stat, week: Stat): string {
  const block = (t: string, s: Stat) =>
    `${t}\n` +
    `  İşlem: ${s.n} (K:${s.wins}/Z:${s.losses}) · Winrate %${s.winrate.toFixed(0)}\n` +
    `  R:R ${s.rr.toFixed(2)} · Beklenti ${fmt(s.expectancy)}/işlem\n` +
    `  Ort.K ${fmt(s.avg_win)} · Ort.Z ${fmt(s.avg_loss)} · Toplam ${fmt(s.total_pnl)}`;
  return (
    `📈 HAFTALIK PERFORMANS\n\n` +
    block("TEMİZ DÖNEM (19 Ağu→ kümülatif):", era) +
    `\n\n` +
    block("SON 7 GÜN:", week) +
    `\n\nNot: küçük örnekte R:R oynar; hedef R:R≈2, N büyürken korunuyor mu izle.`
  );
}

function fmt(v: number) {
  return `${v.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

async function sendTelegram(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram env missing (perf-tracker)");
    return;
  }
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    }
  );
  if (!res.ok) console.error("Telegram send failed (perf-tracker)", await res.text());
}
