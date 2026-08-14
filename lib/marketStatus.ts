import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Piyasa durumu + veri tazeliği — tatil takvimi ve bayat-veri guard'ının
// TEK kaynağı. Cron'lar ve agent bu helper'ları paylaşır.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

// Tazelik eşiği — data-freshness-check ve bayat-veri guard'ı AYNI değeri okur.
// Live feed'e geçince tek yerden düşürülecek (35 → 20). Geriye dönük uyumluluk
// için eski env adı da kabul edilir.
export const DATA_FRESHNESS_THRESHOLD_MINUTES = Number(
  process.env.DATA_FRESHNESS_THRESHOLD_MINUTES ??
    process.env.FRESHNESS_STALE_THRESHOLD_MINUTES ??
    35
);

// Tazelik referansı: yüksek likiditeli 6 sembol — piyasa açıkken dakikalar
// içinde işlem görürler, TAMAMI eskiyse feed donmuş demektir.
export const FRESHNESS_WATCH_SYMBOLS = ["GARAN", "AKBNK", "THYAO", "ASELS", "SASA", "EREGL"];

function trWeekday(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
  }).format(new Date());
}

function trDateISO(): string {
  // en-CA → "YYYY-MM-DD" (Europe/Istanbul gününe göre)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ---------------------------------------------------------------------------
// isMarketOpen — bugün BİR İŞLEM GÜNÜ mü? (gün düzeyi, saat penceresi hariç)
// Hafta sonu VEYA market_holidays'te tam tatil kaydı varsa kapalı.
// Yarım gün (half_day=true) kayıtlar işlem günüdür → açık sayılır; öğleden
// sonraki bayatlığı zaten Katman 2 (bayat-veri guard'ı) yakalar.
// DB hatası/erişimsizlik → fail-OPEN (bir DB tıkanması işlem crontlarını
// engellemesin; gerçek güvenlik ağı freshness guard'ı ve risk-monitor'dür).
// ---------------------------------------------------------------------------
export async function isMarketOpen(): Promise<{ open: boolean; reason: string; dateTR: string }> {
  const dateTR = trDateISO();
  const weekday = trWeekday();

  if (weekday === "Sat" || weekday === "Sun") {
    return { open: false, reason: `WEEKEND (${weekday})`, dateTR };
  }

  if (!supabase) return { open: true, reason: "NO_DB_ASSUME_OPEN", dateTR };

  try {
    const { data, error } = await supabase
      .from("market_holidays")
      .select("description,half_day")
      .eq("date", dateTR)
      .maybeSingle();

    if (error) return { open: true, reason: "HOLIDAY_QUERY_ERROR_ASSUME_OPEN", dateTR };

    if (data && data.half_day !== true) {
      return { open: false, reason: `HOLIDAY: ${data.description ?? dateTR}`, dateTR };
    }

    return { open: true, reason: data ? "HALF_DAY_TRADING" : "TRADING_DAY", dateTR };
  } catch {
    return { open: true, reason: "HOLIDAY_EXCEPTION_ASSUME_OPEN", dateTR };
  }
}

// ---------------------------------------------------------------------------
// isSessionOpenNow — ŞU AN seans saati penceresinde miyiz? (gün + saat)
// BIST sürekli seans ~10:00-18:00 TR. Günlük bar kapanış alarmı ~18:10-18:11'de
// (seans kapandıktan SONRA) ateşler → o an bu fonksiyon KAPALI döner. Webhook
// bunu "kapanış fiyatından dolum yapılamaz → PENDING_OPEN kuyrukla" ayrımı için
// kullanır. Gün düzeyi (hafta sonu/tatil) isMarketOpen'a devredilir.
// ---------------------------------------------------------------------------
const SESSION_OPEN_HOUR = Number(process.env.SESSION_OPEN_HOUR ?? 10);   // 10:00 TR
const SESSION_CLOSE_HOUR = Number(process.env.SESSION_CLOSE_HOUR ?? 18); // 18:00 TR (kapanış; sonrası kapalı)

function trHour(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

export async function isSessionOpenNow(): Promise<{ open: boolean; reason: string }> {
  const day = await isMarketOpen();
  if (!day.open) return { open: false, reason: day.reason };

  const hour = trHour();
  if (hour < SESSION_OPEN_HOUR) return { open: false, reason: `PRE_OPEN (${hour}:00 TR)` };
  if (hour >= SESSION_CLOSE_HOUR) return { open: false, reason: `AFTER_CLOSE (${hour}:00 TR)` };
  return { open: true, reason: `SESSION_OPEN (${hour}:00 TR)` };
}

// ---------------------------------------------------------------------------
// getDataFreshness — 6 referans sembolün matriks_trade_time yaşına bakar.
// data-freshness-check (uyarı) ve bayat-veri guard'ı (karar üretme durdurma)
// bu tek fonksiyonu paylaşır.
// ---------------------------------------------------------------------------
export type FreshnessSymbol = {
  symbol: string;
  matriksTradeTime: string | null;
  ageMinutes: number | null;
  stale: boolean;
};

export type FreshnessResult = {
  ok: boolean;                 // sorgu başarılı mı
  thresholdMinutes: number;
  symbols: FreshnessSymbol[];
  staleCount: number;
  allStale: boolean;           // TÜM referanslar eşikten eski → feed donuk
  newestTradeTime: string | null;
};

export async function getDataFreshness(): Promise<FreshnessResult> {
  const thresholdMinutes = DATA_FRESHNESS_THRESHOLD_MINUTES;

  if (!supabase) {
    return { ok: false, thresholdMinutes, symbols: [], staleCount: 0, allStale: false, newestTradeTime: null };
  }

  const { data, error } = await supabase
    .from("live_prices")
    .select("symbol,matriks_trade_time")
    .in("symbol", FRESHNESS_WATCH_SYMBOLS);

  if (error) {
    return { ok: false, thresholdMinutes, symbols: [], staleCount: 0, allStale: false, newestTradeTime: null };
  }

  const timeMap = new Map(
    (data ?? []).map((r: any) => [String(r.symbol), r.matriks_trade_time as string | null])
  );
  const nowMs = Date.now();
  let newestMs = -Infinity;

  const symbols: FreshnessSymbol[] = FRESHNESS_WATCH_SYMBOLS.map((sym) => {
    const t = timeMap.get(sym) ?? null;
    const tMs = t ? new Date(t).getTime() : null;
    const ageMinutes = tMs != null && Number.isFinite(tMs) ? (nowMs - tMs) / 60_000 : null;
    if (tMs != null && Number.isFinite(tMs) && tMs > newestMs) newestMs = tMs;
    // matriks_trade_time yoksa / eşiği aşıyorsa "eski" (güvenli taraf)
    const stale = ageMinutes == null || !Number.isFinite(ageMinutes) || ageMinutes > thresholdMinutes;
    return {
      symbol: sym,
      matriksTradeTime: t,
      ageMinutes: ageMinutes != null && Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null,
      stale,
    };
  });

  const staleCount = symbols.filter((s) => s.stale).length;
  return {
    ok: true,
    thresholdMinutes,
    symbols,
    staleCount,
    allStale: staleCount === FRESHNESS_WATCH_SYMBOLS.length,
    newestTradeTime: Number.isFinite(newestMs) ? new Date(newestMs).toISOString() : null,
  };
}

export function formatTradeTimeTR(iso: string | null): string {
  if (!iso) return "kayıt yok";
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
