// Birim testi — lib/attribution.ts (normalize + entry_indicators).
// Çalıştır:  npx tsx scripts/test-attribution.ts   (ağ/env gerektirmez)

import { normalizeSetupType, normalizeRegime, buildEntryIndicators } from "../lib/attribution";

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(got)}${ok ? "" : `  want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
}

console.log("== normalizeSetupType ==");
// whitelist / casing / whitespace
eq("MEAN_REVERSION", normalizeSetupType("MEAN_REVERSION"), "MEAN_REVERSION");
eq("trailing space", normalizeSetupType("MEAN_REVERSION "), "MEAN_REVERSION");
eq("lowercase", normalizeSetupType("mean_reversion"), "MEAN_REVERSION");
eq("MOMENTUM", normalizeSetupType("MOMENTUM_CONTINUATION"), "MOMENTUM_CONTINUATION");
eq("BREAKOUT_SETUP", normalizeSetupType("BREAKOUT_SETUP"), "BREAKOUT_SETUP");
eq("TV_SIGNAL literal", normalizeSetupType("TV_SIGNAL"), "TV_SIGNAL");
eq("EXTERNAL_SIGNAL literal", normalizeSetupType("EXTERNAL_SIGNAL"), "EXTERNAL_SIGNAL");
// yapısal varyant reddedilir (uydurma yok)
eq("MeanReversion -> UNKNOWN", normalizeSetupType("MeanReversion"), "UNKNOWN");
eq("garbage -> UNKNOWN", normalizeSetupType("GARBAGE"), "UNKNOWN");
// boş/null/undefined + source mantığı
eq("boş + TRADINGVIEW_POOL -> TV_SIGNAL", normalizeSetupType("", "TRADINGVIEW_POOL"), "TV_SIGNAL");
eq("boş + MATRIKS_SCREENING -> UNKNOWN", normalizeSetupType("", "MATRIKS_SCREENING"), "UNKNOWN");
eq("boş + kaynaksız -> UNKNOWN", normalizeSetupType(""), "UNKNOWN");
eq("null -> UNKNOWN", normalizeSetupType(null), "UNKNOWN");
eq("undefined -> UNKNOWN", normalizeSetupType(undefined), "UNKNOWN");
eq("null + TRADINGVIEW_POOL -> TV_SIGNAL", normalizeSetupType(null, "TRADINGVIEW_POOL"), "TV_SIGNAL");

console.log("\n== normalizeRegime ==");
eq("kanonik", normalizeRegime("TRENDLİ-YUKARI"), "TRENDLİ-YUKARI");
eq("boşluklu", normalizeRegime("  YATAY-SIKIŞIK  "), "YATAY-SIKIŞIK");
eq("lowercase kanonik roundtrip", normalizeRegime("TRENDLİ-YUKARI".toLocaleLowerCase("tr-TR")), "TRENDLİ-YUKARI");
eq("YÜKSEK-VOLATİLİTE", normalizeRegime("YÜKSEK-VOLATİLİTE"), "YÜKSEK-VOLATİLİTE");
eq("boş -> BELİRSİZ", normalizeRegime(""), "BELİRSİZ");
eq("null -> BELİRSİZ", normalizeRegime(null), "BELİRSİZ");
eq("undefined -> BELİRSİZ", normalizeRegime(undefined), "BELİRSİZ");
eq("tanınmayan -> BELİRSİZ", normalizeRegime("SIDEWAYS"), "BELİRSİZ");

console.log("\n== buildEntryIndicators ==");
eq("null live -> null", buildEntryIndicators(null), null);
eq("undefined live -> null", buildEntryIndicators(undefined), null);
{
  const live = { rsi: 55, adx: 20, ema20: 10, atr: 0.5, matriks_trade_time: "2026-07-24T10:00:00+03:00", extra: "yoksay" };
  const snap = buildEntryIndicators(live, "2026-07-24T12:00:00.000Z") as Record<string, unknown>;
  eq("rsi taşındı", snap.rsi, 55);
  eq("matriks_trade_time taşındı", snap.matriks_trade_time, "2026-07-24T10:00:00+03:00");
  eq("eksik gösterge -> null (ema100)", snap.ema100, null);
  eq("captured_at sabit", snap.captured_at, "2026-07-24T12:00:00.000Z");
  eq("whitelist dışı alan taşınmadı (extra)", "extra" in snap, false);
}

console.log(`\n${failed === 0 ? "TÜM TESTLER GEÇTİ ✓" : `${failed} TEST BAŞARISIZ ✗`}`);
process.exit(failed === 0 ? 0 : 1);
