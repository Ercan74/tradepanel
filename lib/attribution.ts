// Öğrenen agent — sonuç atfı normalizasyonu. TEK KAYNAK.
// urgent-check + execution + webhook AYNI fonksiyonları buradan kullanır.
// Saf/yan-etkisiz (console.warn hariç) → doğrudan birim test edilebilir.
//
// TASARIM: DDL'de CHECK constraint YOK; değer doğrulaması BURADA yapılır
// (trim + uppercase + whitelist). Bilinmeyen değer sessizce hayalet kova
// yaratmasın diye UNKNOWN/BELİRSİZ'e düşer + warn. setupType ASLA uydurulmaz.

export const SETUP_TYPES = [
  "MEAN_REVERSION",
  "MOMENTUM_CONTINUATION",
  "BREAKOUT_SETUP",
  "TV_SIGNAL",
  "EXTERNAL_SIGNAL",
] as const;

export const REGIMES = [
  "TRENDLİ-YUKARI",
  "TRENDLİ-AŞAĞI",
  "YATAY-SIKIŞIK",
  "YÜKSEK-VOLATİLİTE",
  "BELİRSİZ",
] as const;

// attribution_source değer sözlüğü (referans/dokümantasyon). İleriye dönük
// forward yol STRUCTURED/EXTERNAL_SIGNAL yazar; TEXT_DERIVED_* yalnızca backfill'de
// üretilir (geçmiş reason metninden). İki kademe: EXACT (tam token) vs PHRASE
// (Türkçe/İng. kalıp) — ileride türetilmiş kayıtları FİLTRELEYEBİLMEK için ayrı.
export const ATTRIBUTION_SOURCES = [
  "STRUCTURED",
  "TEXT_DERIVED_EXACT",
  "TEXT_DERIVED_PHRASE",
  "EXTERNAL_SIGNAL",
  "UNKNOWN",
] as const;

const SETUP_SET = new Set<string>(SETUP_TYPES);

/**
 * setupType'ı normalize eder + whitelist doğrular.
 * - trim + uppercase; whitelist'te ise aynen döner.
 * - boş + source=TRADINGVIEW_POOL → TV_SIGNAL (o havuz kurulum tipi üretmez).
 * - boş + başka kaynak (MATRIKS/bilinmiyor) → UNKNOWN (UYDURMA yok).
 * - dolu ama tanınmayan (ör. "MeanReversion", "BREAKOUT") → UNKNOWN + warn.
 * Yapısal varyantları (underscore/dash farkı) KASITEN reddeder — sessiz
 * hayalet kovayı önler.
 */
export function normalizeSetupType(raw: unknown, source?: unknown): string {
  const v = (raw ?? "").toString().trim().toUpperCase();
  if (SETUP_SET.has(v)) return v;

  const src = (source ?? "").toString().trim().toUpperCase();
  if (v === "") {
    if (src === "TRADINGVIEW_POOL") return "TV_SIGNAL";
    return "UNKNOWN";
  }
  console.warn(`[attribution] tanınmayan setupType: "${raw}" (source=${source ?? "?"}) → UNKNOWN`);
  return "UNKNOWN";
}

/**
 * Rejimi normalize eder (Türkçe casing güvenli, tr-TR locale).
 * Tanınmayan / boş → BELİRSİZ (zaten geçerli enum üyesi).
 */
export function normalizeRegime(raw: unknown): string {
  const t = (raw ?? "").toString().trim();
  if (t === "") return "BELİRSİZ";
  const up = t.toLocaleUpperCase("tr-TR");
  for (const r of REGIMES) {
    if (r.toLocaleUpperCase("tr-TR") === up) return r; // kanonik biçimi döndür
  }
  console.warn(`[attribution] tanınmayan regime: "${raw}" → BELİRSİZ`);
  return "BELİRSİZ";
}

// live_prices satırından alınacak gösterge anahtarları (giriş anı snapshot'ı).
const INDICATOR_KEYS = [
  "rsi", "adx", "ema20", "ema50", "ema100", "atr", "lrs", "macd_div",
  "stoc_rsi", "stoch_fast_k", "stoch_fast_d", "aroon_up", "aroon_down",
  "rsi_4h", "ema20_4h", "ema50_4h", "ema100_4h", "atr_4h", "adx_4h",
  "stoch_fast_k_4h", "stoch_fast_d_4h", "matriks_trade_time",
] as const;

/**
 * Giriş anı gösterge snapshot'ı (positions.entry_indicators jsonb).
 * live satırı yoksa null döner (çağıran taraf yine de pozisyonu açar —
 * gözlem katmanı işlem akışını BLOKLAMAZ). matriks_trade_time dahil
 * (giriş anı veri tazeliği analizi için).
 */
export function buildEntryIndicators(
  live: Record<string, unknown> | null | undefined,
  capturedAt: string = new Date().toISOString()
): Record<string, unknown> | null {
  if (!live) return null;
  const snap: Record<string, unknown> = {};
  for (const k of INDICATOR_KEYS) snap[k] = live[k] ?? null;
  snap.captured_at = capturedAt;
  return snap;
}
