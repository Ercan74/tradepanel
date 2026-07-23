// Ortak PnL muhasebesi — TEK KAYNAK-DOĞRULUK.
// closePosition (lib/execution.ts) ve risk-monitor kapanış yolu AYNI tanımları
// buradan kullanır. Kısmi-çıkış muhasebe bug'ının kök nedeni iki yolun pnl'i
// AYRI hesaplamasıydı (biri toplam, biri final dilim) — bir daha tekrarlamamak
// için ortak fonksiyon. Saf/yan-etkisiz: doğrudan birim test edilebilir.

export type PnlSide = "LONG" | "SHORT";

/**
 * Tam kapanışta pozisyonun TOPLAM realized PnL'i (TL):
 * daha önce realize edilen kısmi çıkışlar (TP1 + REDUCE) + final dilim.
 *
 * realizedPartial 0 ise sonuç yalnızca final dilimdir → kısmi-çıkışı OLMAYAN
 * pozisyonda eski davranışla BİREBİR aynı (regresyon yok).
 */
export function calcClosePnlAmount(
  side: PnlSide,
  entry: number,
  exitPrice: number,
  finalQty: number,
  realizedPartial: number
): number {
  const finalSlice =
    side === "LONG" ? (exitPrice - entry) * finalQty : (entry - exitPrice) * finalQty;
  return realizedPartial + finalSlice;
}

/**
 * Toplam-getiri yüzdesi: toplam realized PnL / ilk notional (entry × ilk
 * toplam qty). pnl_amount TOPLAM olduğunda pnl_pct de onunla tutarlı olsun diye.
 *
 * Kısmi çıkış YOKSA fiyat-hareketi %'sine ((exit−entry)/entry) MATEMATİKSEL
 * olarak eşittir: totalPnl = (exit−entry)×qty, notional = entry×qty →
 * oran = (exit−entry)/entry. (Regresyon guard'ı bunu test eder.)
 */
export function calcTotalPnlPct(entry: number, initialQty: number, totalPnl: number): number {
  const notional = entry * initialQty;
  if (!notional) return 0;
  return (totalPnl / notional) * 100;
}
