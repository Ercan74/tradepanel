import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";

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
// (geçici durdurma/doğal gecikme olabilir).
// ---------------------------------------------------------------------------

const WATCH_SYMBOLS = ["GARAN", "AKBNK", "THYAO", "ASELS", "SASA", "EREGL"];
// Eşik hesabı (2026-07-10 canlı ölçümüne dayalı): Matriks feed'i 15 dk
// gecikmeli demo (delay_note=DEMO_15_MIN_DELAYED) + Python agent döngüsü
// ~10 dk sürüyor → sağlıklı pipeline'da bile yaş 15-25 dk. 15 dk eşiği
// sürekli yanlış alarm üretirdi; 35 dk = 15 (feed) + 10 (döngü) + 10 (pay).
const STALE_THRESHOLD_MINUTES = Number(process.env.FRESHNESS_STALE_THRESHOLD_MINUTES ?? 35);
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

function formatTrTime(iso: string | null): string {
  if (!iso) return "kayıt yok";
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export async function GET(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
    const { data: rows, error } = await supabase
      .from("live_prices")
      .select("symbol,matriks_trade_time")
      .in("symbol", WATCH_SYMBOLS);

    if (error) throw error;

    const timeMap = new Map(
      (rows ?? []).map((r: any) => [String(r.symbol), r.matriks_trade_time as string | null])
    );

    const nowMs = Date.now();
    const symbols = WATCH_SYMBOLS.map((sym) => {
      const t = timeMap.get(sym) ?? null;
      const ageMinutes = t ? (nowMs - new Date(t).getTime()) / 60_000 : null;
      // matriks_trade_time yoksa (satır yok / kolon henüz dolmamış) güvenli
      // taraf: "eski" sayılır — pipeline sorunu da bir tazelik sorunudur
      const stale =
        ageMinutes === null || !Number.isFinite(ageMinutes) || ageMinutes > STALE_THRESHOLD_MINUTES;
      return {
        symbol: sym,
        matriksTradeTime: t,
        ageMinutes: ageMinutes !== null && Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null,
        stale,
      };
    });

    const staleCount = symbols.filter((s) => s.stale).length;
    const allStale = staleCount === WATCH_SYMBOLS.length;

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
          `İzlenen ${WATCH_SYMBOLS.length} yüksek likiditeli sembolün TAMAMI ${STALE_THRESHOLD_MINUTES}+ dakikadır güncellenmedi.`,
          "Matriks DDE akışı / Excel / Python agent kontrol edilmeli.",
          "",
          "Son görülen işlem zamanları:",
        ];
        symbols.forEach((s) => {
          lines.push(
            `• ${s.symbol}: ${formatTrTime(s.matriksTradeTime)}${s.ageMinutes !== null ? ` (${s.ageMinutes} dk önce)` : ""}`
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
      staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
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
