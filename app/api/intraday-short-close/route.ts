import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { generateClientOrderId } from "@/lib/execution";
import { calcClosePnlAmount, calcTotalPnlPct } from "@/lib/pnl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GÜN-SONU ZORUNLU SHORT KAPAMA (2026-08-31)
// ---------------------------------------------------------------------------
// BİST KURALI (SPK Seri:V No:65 + Osmanlı demo canlı-teyit 2026-08-31): spot
// açığa satış AYNI GÜN kapatılmak zorunda. Kapatılmazsa hisse borcu doğar →
// broker RESEN ALIM (buy-in) yapar (Osmanlı son saat 17:00 TR; SMS ile teyitli).
// Ödünç Pay Piyasası ile taşımak ayrı düzenek + maliyet; gecelik short YALNIZ
// VIOP tarafında taşınabilir. → Bu cron, açık TÜM spot SHORT pozisyonları seans
// içinde (buy-in son saatinden ÖNCE, ~16:45 TR) mekanik olarak kapatır.
//
// Kural kullanıcı-kararı (2026-08-31): agent short AÇABİLİR ama spot short
// TAŞINMAZ — sistem gün-içi kapatır. (LONG'a dokunulmaz.)
//
// NOT (Aşama C kancası): şu an kapatma = dashboard pozisyonunu CLOSED yazar.
// Canlı order-bridge devreye girince BURAYA cover emri (BUY + TransactionType 6,
// PYS+FaK) gönderimi eklenecek — pozisyon gerçekte de kapansın.
// ---------------------------------------------------------------------------

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

function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function formatPrice(v: number): string {
  return v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatTl(v: number): string {
  return `${v.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
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

    // reportOnly: yalnız aday short'ları döndür (kapatma YOK) — test için.
    const reportOnly = req.nextUrl.searchParams.get("reportOnly") === "1";

    // Açık SPOT SHORT pozisyonları çek. venue='VIOP' short'lar HARİÇ — onlar
    // pay-vadeli, vade sonuna dek taşınır (gün-içi kapatma YALNIZ spot açığa satışa).
    const { data: shorts, error: posErr } = await supabase
      .from("positions")
      .select(
        "id,symbol,side,entry_price,current_price,quantity,remaining_quantity,realized_partial_amount,tp1_hit,trailing_stage"
      )
      .eq("status", "OPEN")
      .eq("side", "SHORT")
      .eq("venue", "SPOT");
    if (posErr) throw posErr;

    const openShorts = shorts ?? [];
    if (openShorts.length === 0) {
      return NextResponse.json({ ok: true, reportOnly, closed: 0, message: "Açık spot SHORT yok." });
    }

    // Canlı fiyatları çek (kapanış = cover fiyatı ≈ son fiyat).
    const symbols = Array.from(new Set(openShorts.map((p) => p.symbol)));
    const { data: liveRows, error: liveErr } = await supabase
      .from("live_prices")
      .select("symbol,last_price")
      .in("symbol", symbols);
    if (liveErr) throw liveErr;
    const liveMap = new Map<string, number>();
    (liveRows ?? []).forEach((r) => liveMap.set(r.symbol, num(r.last_price)));

    const results: Array<Record<string, unknown>> = [];

    for (const pos of openShorts) {
      const entry = num(pos.entry_price);
      const remainingQty = num(pos.remaining_quantity, num(pos.quantity));
      const initialQty = num(pos.quantity, remainingQty);
      const realizedPartial = num(pos.realized_partial_amount, 0);

      // Kapanış fiyatı: canlı son fiyat → yoksa current_price → yoksa entry.
      // (Zorunlu düz-kalma; fiyat yoksa bile pozisyon KAPANMALI — buy-in riski.)
      const live = liveMap.get(pos.symbol);
      const priceSource = live != null ? "live_prices" : pos.current_price != null ? "current_price" : "entry";
      const exitPrice = live ?? num(pos.current_price, entry);

      const totalPnl = round2(
        calcClosePnlAmount("SHORT", entry, exitPrice, remainingQty, realizedPartial)
      );
      const totalPnlPct = round2(calcTotalPnlPct(entry, initialQty, totalPnl));

      if (reportOnly) {
        results.push({ symbol: pos.symbol, entry, exitPrice, priceSource, totalPnl, totalPnlPct, wouldClose: true });
        continue;
      }

      const { error: updErr } = await supabase
        .from("positions")
        .update({
          close_client_order_id: generateClientOrderId(),
          status: "CLOSED",
          current_price: exitPrice,
          exit_price: exitPrice,
          close_price: exitPrice,
          close_reason: "INTRADAY_SHORT_EOD",
          pnl_amount: totalPnl,
          pnl_pct: totalPnlPct,
          remaining_quantity: 0,
          risk_state: "CLOSED",
          trailing_stage: "CLOSED",
          closed_at: new Date().toISOString(),
          last_event_at: new Date().toISOString(),
        })
        .eq("id", pos.id);
      if (updErr) throw updErr;

      await supabase.from("position_events").insert({
        position_id: pos.id,
        symbol: pos.symbol,
        side: "SHORT",
        event_type: "INTRADAY_SHORT_EOD",
        price: exitPrice,
        message:
          `${pos.symbol} SHORT gün-sonu zorunlu kapama (BİST spot short taşınmaz). ` +
          `Çıkış ${formatPrice(exitPrice)}. Toplam PnL ${formatTl(totalPnl)}.`,
        payload: { source: "intraday-short-close", priceSource, entry, exitPrice, remainingQty, realizedPartial },
      });

      results.push({ symbol: pos.symbol, entry, exitPrice, priceSource, totalPnl, totalPnlPct, closed: true });
    }

    if (!reportOnly && results.length > 0) {
      const lines = results
        .map((r) => `• ${r.symbol}: çıkış ${formatPrice(num(r.exitPrice))} · ${formatTl(num(r.totalPnl))} (%${num(r.totalPnlPct)})`)
        .join("\n");
      await sendTelegram(
        `⏱️ GÜN-SONU ZORUNLU SHORT KAPAMA\n\n` +
          `BİST spot açığa satış aynı gün kapanmak zorunda (taşınırsa broker resen alım yapar).\n\n` +
          lines +
          `\n\nNot: gecelik short yalnız VIOP tarafında taşınabilir.`
      );
    }

    return NextResponse.json({ ok: true, reportOnly, closed: reportOnly ? 0 : results.length, positions: results });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

async function sendTelegram(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram env missing (intraday-short-close)");
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
  if (!res.ok) console.error("Telegram send failed (intraday-short-close)", await res.text());
}
