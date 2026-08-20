// ---------------------------------------------------------------------------
// AŞIRI-UZAMA / TAVAN-TABAN GİRİŞ DENETİMİ — rejim-duyarlı eşik (2026-08-19)
// ---------------------------------------------------------------------------
// Gün-içi hareket işlem yönünde eşiği aştıysa YENİ pozisyon açma. İki gerekçe:
//   (1) R:R kötü — hareketin tepesinden alım, dönerse tümünü geri verir.
//   (2) Tavana/tabana kilitli hissede karşı taraf ~yok → emir sıraya girer,
//       gerçekleşme ihtimali ~sıfır. YÖNE bağlıdır:
//         - Tavan (limit-up): LONG dolmaz → LONG blokla.
//         - Taban (limit-down): SHORT dolmaz → SHORT blokla.
//           (Taban'da LONG "dip alımı" DOLAR ve meşru mean-reversion olabilir →
//            bloklanmaz.)
//
// Eşik piyasa rejimine göre değişir (kullanıcı kalibrasyonu, 2026-08-19):
//   - Yatay/sıkışık piyasa: +%5 bile "tren kaçtı" → dar eşik.
//   - Güçlü trend piyasası: +%7 denenebilir → geniş eşik.
// Piyasa rejimi XU100'den DETERMİNİSTİK türetilir (ADX + EMA dizilimi); model
// çıktısına bağlı değildir (denetim, model kararından ÖNCE havuzda uygulanır).
// change_pct yoksa denetim fail-open (bloklamaz, akışı bozmaz).
// ---------------------------------------------------------------------------

export type MarketRegime = "TREND" | "RANGE";

const ADX_TREND_MIN = Number(process.env.ENTRY_ADX_TREND_MIN ?? 22);
const MAX_DAY_CHANGE_RANGE = Number(process.env.MAX_ENTRY_DAY_CHANGE_RANGE ?? 5);
const MAX_DAY_CHANGE_TREND = Number(process.env.MAX_ENTRY_DAY_CHANGE_TREND ?? 7);

type IndexRow =
  | { adx?: unknown; ema20?: unknown; ema50?: unknown; ema100?: unknown }
  | null
  | undefined;

// XU100 satırından piyasa rejimi: EMA20/50/100 dizili (yukarı VEYA aşağı) VE
// ADX güçlüyse TREND; aksi halde RANGE. Veri yoksa temkinli → RANGE (dar eşik).
export function marketRegimeFromIndex(x: IndexRow): MarketRegime {
  if (!x) return "RANGE";
  const adx = Number(x.adx);
  const e20 = Number(x.ema20);
  const e50 = Number(x.ema50);
  const e100 = Number(x.ema100);
  const stacked =
    (e20 > e50 && e50 > e100) || (e20 < e50 && e50 < e100);
  const strong = Number.isFinite(adx) && adx >= ADX_TREND_MIN;
  return strong && stacked ? "TREND" : "RANGE";
}

// Rejime göre izin verilen maksimum gün-içi hareket (%).
export function maxDayChangePct(regime: MarketRegime): number {
  return regime === "TREND" ? MAX_DAY_CHANGE_TREND : MAX_DAY_CHANGE_RANGE;
}

// İşlem yönünde gün-içi hareket eşiği aştı mı? (LONG: +eşik, SHORT: -eşik).
// changePct null/geçersiz → false (fail-open).
export function isDayChangeExtended(
  changePct: number | null | undefined,
  side: "LONG" | "SHORT",
  threshold: number
): boolean {
  const c = Number(changePct);
  if (changePct == null || !Number.isFinite(c)) return false;
  return side === "LONG" ? c >= threshold : c <= -threshold;
}
