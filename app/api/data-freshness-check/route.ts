import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  isMarketOpen,
  getDataFreshness,
  formatTradeTimeTR,
  DATA_FRESHNESS_THRESHOLD_MINUTES,
  FRESHNESS_WATCH_SYMBOLS,
} from "@/lib/marketStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MONITOR_SECRET = process.env.RISK_MONITOR_SECRET ?? "ema100_secret_2026";

// ---------------------------------------------------------------------------
// Veri tazeliği kontrolü: yüksek likiditeli 6 sembolün Matriks "Son İşlem
// Dakikası" (matriks_trade_time, gerçek UTC) değerine bakar. Piyasa açıkken
// bu sembollerde dakikalar içinde işlem olur; TAMAMI eşikten eskiyse DDE
// akışının donduğundan şüphelenilir. Yalnızca bazıları eskiyse sessiz kalınır
// (geçici durdurma/doğal gecikme olabilir). Eşik + referans semboller +
// tazelik hesabı lib/marketStatus'tan gelir (bayat-veri guard'ıyla ortak).
// ---------------------------------------------------------------------------

const ALERT_DEDUP_MINUTES = 20;     // aynı uyarı bu pencere içinde tekrarlanmaz
const LAST_ALERT_SETTING_KEY = "data_freshness_last_alert_at";

// Piyasa penceresi (TR): hafta içi 10:00–18:15. Türkiye kalıcı UTC+3.
// Cron aralığından bağımsız kod-içi güvenlik katmanı.
const MARKET_OPEN_MINUTES = 10 * 60;
const MARKET_CLOSE_MINUTES = 18 * 60 + 15;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function marketStatusTR(): { open: boolean; label: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Istanbul",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );

  const weekday = String(parts.weekday);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const open =
    isWeekday && minutes >= MARKET_OPEN_MINUTES && minutes < MARKET_CLOSE_MINUTES;

  return { open, label: `${weekday} ${parts.hour}:${parts.minute} (TR)` };
}


export async function GET(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Katman 1 — tatil/hafta sonu: kapalı günlerde sessizce çık (Telegram yok)
  const day = await isMarketOpen();
  if (!day.open) {
    console.log(`DATA_FRESHNESS_SKIP_CLOSED ${day.dateTR} — ${day.reason}`);
    return NextResponse.json({ ok: true, marketOpen: false, reason: day.reason, skipped: true });
  }

  const market = marketStatusTR();
  if (!market.open) {
    return NextResponse.json({
      ok: true,
      marketOpen: false,
      now: market.label,
      skipped: "Piyasa penceresi dışında (hafta içi 10:00-18:15 TR)",
    });
  }

  try {
    const freshness = await getDataFreshness();
    if (!freshness.ok) throw new Error("Tazelik sorgusu başarısız (live_prices)");

    const nowMs = Date.now();
    const symbols = freshness.symbols;
    const staleCount = freshness.staleCount;
    const allStale = freshness.allStale;

    let alerted = false;
    let dedupSkipped = false;

    if (allStale) {
      // Dedup: son uyarı zamanı system_settings'te tutulur
      const { data: lastRow } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", LAST_ALERT_SETTING_KEY)
        .maybeSingle();

      const lastAlertMs = lastRow?.value ? new Date(String(lastRow.value)).getTime() : 0;

      if (Number.isFinite(lastAlertMs) && nowMs - lastAlertMs < ALERT_DEDUP_MINUTES * 60_000) {
        dedupSkipped = true;
      } else {
        const lines = [
          "🧊 VERİ DONMASI ŞÜPHESİ",
          `İzlenen ${FRESHNESS_WATCH_SYMBOLS.length} yüksek likiditeli sembolün TAMAMI ${freshness.thresholdMinutes}+ dakikadır güncellenmedi.`,
          "Matriks DDE akışı / Excel / Python agent kontrol edilmeli.",
          "",
          "Son görülen işlem zamanları:",
        ];
        symbols.forEach((s) => {
          lines.push(
            `• ${s.symbol}: ${formatTradeTimeTR(s.matriksTradeTime)}${s.ageMinutes !== null ? ` (${s.ageMinutes} dk önce)` : ""}`
          );
        });

        await sendTelegramMessage(lines.join("\n"));

        await supabase.from("system_settings").upsert(
          {
            key: LAST_ALERT_SETTING_KEY,
            value: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: "DATA_FRESHNESS_CHECK",
          },
          { onConflict: "key" }
        );

        alerted = true;
      }
    }

    return NextResponse.json({
      ok: true,
      marketOpen: true,
      now: market.label,
      checkedAt: new Date().toISOString(),
      staleThresholdMinutes: freshness.thresholdMinutes,
      staleCount,
      allStale,
      alerted,
      dedupSkipped,
      symbols,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("DATA_FRESHNESS_ERROR", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
