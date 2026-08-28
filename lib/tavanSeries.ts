// ---------------------------------------------------------------------------
// TAVAN SERİSİ TESPİTİ (2026-08-28) — SHORT-into-tavan güvenlik kontrolü tetiği.
// ---------------------------------------------------------------------------
// SHORT sinyali bir TAVAN SERİSİNE (ardışık +tavan günleri) denk geliyorsa, bu
// güçlü bir katalizör (dava/M&A/kılavuz vb.) işaretidir. Böyle bir hissede short
// açmak EXIT-TRAP riski taşır: kilitli tavanda cover edilemez (alıcı bol, satıcı
// yok), stop-loss fiilen çalışmaz, seri kaç gün süreceği öngörülemez → yönetilemez
// zarar. Bu detektör YALNIZ TETİKLEYİCİ: seri varsa on-demand tek-hisse haber
// kontrolü çalışır; asıl karar (aç/açma) katalizör kanıtına göre agent'a bırakılır.
// change_pct'ler daily_change_history (t-1..t-5) + canlı live_prices (t)'den gelir.
// ---------------------------------------------------------------------------

// Tavan-ish gün eşiği (%). BIST tavanı +%10; +%9 üzeri kapanış ~kilitli tavan.
export const TAVAN_SERIES_PCT = Number(process.env.TAVAN_SERIES_PCT ?? 9.0);
// Katalizör-kontrolünü tetikleyen asgari ardışık tavan günü.
export const MIN_TAVAN_SERIES = Number(process.env.MIN_TAVAN_SERIES ?? 2);

export type TavanSeries = {
  changes: (number | null)[]; // [t, t-1, t-2, ...] — yeni→eski
  seriesLength: number;       // t'den geriye ardışık tavan-ish gün sayısı
  isSeries: boolean;          // seriesLength >= MIN_TAVAN_SERIES
};

/**
 * today = canlı change_pct (t). history = [t-1, t-2, ..., t-5] (yeni→eski).
 * t'den geriye, ilk tavan-olmayan güne kadar ardışık tavan-ish günleri sayar.
 */
export function detectTavanSeries(
  today: number | null | undefined,
  history: (number | null | undefined)[]
): TavanSeries {
  const changes: (number | null)[] = [
    today ?? null,
    ...history.map((h) => (h ?? null)),
  ];
  let n = 0;
  for (const c of changes) {
    if (c != null && Number.isFinite(c) && c >= TAVAN_SERIES_PCT) n++;
    else break; // ardışıklık kırıldı
  }
  return { changes, seriesLength: n, isSeries: n >= MIN_TAVAN_SERIES };
}

/** Prompt/log için kısa özet: "3 gün ardışık tavan (+9.97/+9.96/+9.98)". */
export function tavanSeriesSummary(s: TavanSeries): string {
  if (!s.isSeries) return "";
  const pcts = s.changes
    .slice(0, s.seriesLength)
    .map((c) => (c != null ? `${c >= 0 ? "+" : ""}${c.toFixed(1)}` : "?"))
    .join("/");
  return `${s.seriesLength} gün ardışık tavan (${pcts})`;
}
