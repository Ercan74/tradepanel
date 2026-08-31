// ---------------------------------------------------------------------------
// VIOP EŞLEME MODÜLÜ (2026-08-31) — Seçenek C: F_ öneki + eşleme fonksiyonu.
// ---------------------------------------------------------------------------
// VIOP pay-vadeli kontratları feed'de ZATEN live_prices'a akıyor (canlı fiyat,
// göstergeler null), Matriks-native format `F_<SEMBOL><AAYY>` (ör. F_GARAN0926
// = GARAN Eylül 2026). Ayrı tablo/kolon YOK — `F_` öneki etiketin kendisidir.
//
// İki iş:
//   (A) isViop() → spot sinyal taramasından F_ satırlarını dışla.
//   (B) spotToViop() → short kararı gelen spot sembolü (GARAN) uygun vadeli
//       kontrata (F_GARAN0926) eşle; bridge o fiyattan yönetir.
//
// Saf/yan-etkisiz — doğrudan birim test edilebilir. Kontrat listesi çağıran
// tarafça live_prices'tan (symbol like 'F_%') sağlanır.
// ---------------------------------------------------------------------------

export interface ViopContract {
  symbol: string;        // "F_GARAN0926"
  underlying: string;    // "GARAN"
  expiryCode: string;    // "0926"
  expiryMonth: number;   // 9  (1-12)
  expiryYear: number;    // 2026
}

/** `F_` önekli mi — spot taramadan dışlamak için tek kontrol. */
export function isViop(symbol: string): boolean {
  return typeof symbol === "string" && symbol.toUpperCase().startsWith("F_");
}

/**
 * `F_<SEMBOL><AAYY>` ayrıştırır. Son 4 hane HER ZAMAN vade (AAYY); kalan =
 * underlying. Rakam içeren sembolleri (A1CAP vb.) de doğru böler çünkü son-4
 * dilimlemesi regex belirsizliğine düşmez. Geçersizse null.
 */
export function viopUnderlying(symbol: string): ViopContract | null {
  if (!isViop(symbol)) return null;
  const body = symbol.slice(2); // "GARAN0926"
  if (body.length < 5) return null;
  const mmyy = body.slice(-4);
  const underlying = body.slice(0, -4);
  if (!/^\d{4}$/.test(mmyy) || !underlying) return null;
  const mm = parseInt(mmyy.slice(0, 2), 10);
  const yy = parseInt(mmyy.slice(2), 10);
  if (mm < 1 || mm > 12) return null;
  return {
    symbol: symbol.toUpperCase(),
    underlying: underlying.toUpperCase(),
    expiryCode: mmyy,
    expiryMonth: mm,
    expiryYear: 2000 + yy,
  };
}

/** underlying + vade kodu → kontrat sembolü. */
export function viopContractSymbol(underlying: string, expiryCode: string): string {
  return `F_${underlying.toUpperCase()}${expiryCode}`;
}

/**
 * Vade sonu ~ ayın SON İŞ GÜNÜ (BİST VIOP: kontrat ayının son iş günü).
 * ⚠️ Resmî tatiller HARİÇ (yaklaşık) — yakın-vade eşiğinde tampon bırak.
 */
export function viopExpiryDate(c: Pick<ViopContract, "expiryMonth" | "expiryYear">): Date {
  // Ayın son takvim günü: bir sonraki ayın 0'ıncı günü.
  const d = new Date(Date.UTC(c.expiryYear, c.expiryMonth, 0, 21, 0, 0)); // 21:00Z ≈ 00:00 TR ertesi
  // Hafta sonuysa geriye çek (Cuma'ya).
  while (d.getUTCDay() === 6 || d.getUTCDay() === 0) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

/** Bugünden vade sonuna kalan takvim günü (negatifse vade geçmiş). */
export function daysToExpiry(c: ViopContract, now: Date = new Date()): number {
  const ms = viopExpiryDate(c).getTime() - now.getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}

/** Bir underlying için mevcut TÜM kontratlar (parse edilmiş, vade sırasıyla). */
export function viopContractsFor(spotSymbol: string, available: string[]): ViopContract[] {
  const u = spotSymbol.toUpperCase();
  return available
    .map(viopUnderlying)
    .filter((c): c is ViopContract => c != null && c.underlying === u)
    .sort((a, b) => a.expiryYear - b.expiryYear || a.expiryMonth - b.expiryMonth);
}

/** Spot sembolün VIOP vadelisi var mı (herhangi bir kontrat). */
export function hasViop(spotSymbol: string, available: string[]): boolean {
  return viopContractsFor(spotSymbol, available).length > 0;
}

/**
 * Spot sembolü → yönetilecek VIOP kontratı: yeterli ömrü olan EN YAKIN vade.
 * Ön ay vadeye `minDaysToExpiry` günden az kaldıysa sonraki aya geçer (roll'a
 * sıkışmamak için). Uygun kontrat yoksa null (→ VIOP short yok, spot-gün-içi kalır).
 */
export function spotToViop(
  spotSymbol: string,
  available: string[],
  opts: { minDaysToExpiry?: number; now?: Date } = {}
): ViopContract | null {
  const minDays = opts.minDaysToExpiry ?? 5;
  const now = opts.now ?? new Date();
  const contracts = viopContractsFor(spotSymbol, available);
  // Yeterli ömrü olan en yakın vade.
  for (const c of contracts) {
    if (daysToExpiry(c, now) >= minDays) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// SIZING — kullanıcı kuralı (2026-08-31, 15k versiyonu KİLİTLİ):
//   N = ⌊15.000 / (kontrat_fiyatı × 100)⌋, VIOP-uygun ⟺ N ≥ 1.
//   15k tavanı SERT (asla aşma); 10k tabanı YUMUŞAK (N=1 zorunluysa altında kalabilir).
//   Sınır: unit ≤5k→3+ · 5-7.5k→2 · 7.5-15k→1 · >15k→VIOP değil (spot-gün-içi).
//   Çarpan 100 (1 kontrat = 100 pay). "İlk sürüm — performansla yeniden ayarlanacak."
// ---------------------------------------------------------------------------
export const VIOP_MULTIPLIER = 100;
export const VIOP_MAX_NOTIONAL = 15000;

export interface ViopSizing {
  contracts: number; // N (0 = VIOP uygun değil — tek kontrat bile tavanı aşar)
  unit: number;      // 1 kontrat notional = fiyat × çarpan
  notional: number;  // N × unit (≤ maxNotional)
}

export function viopContractCount(
  contractPrice: number,
  opts: { maxNotional?: number; multiplier?: number } = {}
): ViopSizing {
  const maxNotional = opts.maxNotional ?? VIOP_MAX_NOTIONAL;
  const multiplier = opts.multiplier ?? VIOP_MULTIPLIER;
  const unit = contractPrice * multiplier;
  if (!(unit > 0)) return { contracts: 0, unit: 0, notional: 0 };
  const n = Math.floor(maxNotional / unit);
  const contracts = n >= 1 ? n : 0;
  return { contracts, unit, notional: contracts * unit };
}

// ---------------------------------------------------------------------------
// ROUTING — short sinyali oluşan spot sembolü hangi mecrada açacağız:
//   1) VIOP'ta AÇIK mı? (güncel-fiyatlı F_ kontrat + N≥1) → VIOP taşı
//   2) Spotta açığa-satış uygun mu? (BİST 50 / short-eligible) → SPOT gün-içi
//   3) İkisi de değil → short YOK
// Veri-güdümlü: sabit liste yok. `viopContracts` çağıran tarafça GÜNCEL-FİYATLI
// F_ sembollerle sağlanır (self-cleaning: kontrat kalkınca fiyat bayatlar → düşer).
// ---------------------------------------------------------------------------
export type ShortRoute =
  | { venue: "VIOP"; contract: ViopContract; contracts: number; unit: number; notional: number }
  | { venue: "SPOT_INTRADAY" }
  | { venue: "NONE"; reason: string };

export function routeShort(params: {
  spotSymbol: string;
  spotShortEligible: boolean; // canShort(X): short_sell_eligible listesinde mi
  viopContracts: string[];    // GÜNCEL-FİYATLI F_ semboller (çağıran tazeler)
  viopPriceOf: (contractSymbol: string) => number | null | undefined;
  now?: Date;
  minDaysToExpiry?: number;
  maxNotional?: number;
  multiplier?: number;
}): ShortRoute {
  const c = spotToViop(params.spotSymbol, params.viopContracts, {
    now: params.now,
    minDaysToExpiry: params.minDaysToExpiry,
  });
  if (c) {
    const price = params.viopPriceOf(c.symbol);
    if (price != null && price > 0) {
      const s = viopContractCount(price, {
        maxNotional: params.maxNotional,
        multiplier: params.multiplier,
      });
      if (s.contracts >= 1) {
        return { venue: "VIOP", contract: c, contracts: s.contracts, unit: s.unit, notional: s.notional };
      }
      // Kontrat var ama tek kontrat bile tavanı aşıyor (çok pahalı) → spota düş.
    }
  }
  if (params.spotShortEligible) return { venue: "SPOT_INTRADAY" };
  return {
    venue: "NONE",
    reason: c ? "VIOP tek-kontrat tavanı aşıyor + spot açığa-satış uygun değil" : "ne VIOP kontratı ne spot açığa-satış uygun",
  };
}

/**
 * Spot sembol VIOP'ta short'lanabilir mi: uygun-vadeli kontrat VAR + tek kontrat
 * 15k tavana sığar (N≥1). Candidate filtresinde `canShort(X) || viopShortEligible(X)`
 * olarak kullanılır (BİST50-dışı ama VIOP'ta olan isimleri routing'e ulaştırmak için).
 * Asıl kesin karar açılışta resolveShortVenue'da (tazelik dahil).
 */
export function viopShortEligible(
  spotSymbol: string,
  available: string[],
  priceOf: (contractSymbol: string) => number | null | undefined,
  opts: { minDaysToExpiry?: number; now?: Date; maxNotional?: number; multiplier?: number } = {}
): boolean {
  const c = spotToViop(spotSymbol, available, opts);
  if (!c) return false;
  const p = priceOf(c.symbol);
  if (p == null || !(p > 0)) return false;
  return viopContractCount(p, opts).contracts >= 1;
}
