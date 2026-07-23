// Birim/mantık testi — lib/pnl.ts saf fonksiyonları.
// Çalıştır:  npx tsx scripts/test-pnl.ts
// Ağ/env gerektirmez. Başarısız assert varsa exit 1.

import { calcClosePnlAmount, calcTotalPnlPct, type PnlSide } from "../lib/pnl";

let failed = 0;
function approx(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}
function check(name: string, got: number, want: number, tol = 1e-6) {
  const ok = approx(got, want, tol);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${got.toFixed(4)}  want ${want.toFixed(4)}`);
  if (!ok) failed++;
}

// Fiyat-hareketi % (regresyon karşılaştırması için referans)
function priceMovePct(side: PnlSide, entry: number, exit: number): number {
  return side === "LONG" ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100;
}

console.log("== 1) Kısmisiz LONG: eski davranışla birebir (regresyon) ==");
{
  const [entry, exit, qty] = [100, 110, 50];
  const amt = calcClosePnlAmount("LONG", entry, exit, qty, 0);
  check("pnl_amount", amt, (exit - entry) * qty);            // 500
  const pct = calcTotalPnlPct(entry, qty, amt);
  check("pnl_pct == fiyat-hareketi %", pct, priceMovePct("LONG", entry, exit)); // 10
}

console.log("== 2) Kısmisiz SHORT: eski davranışla birebir (regresyon) ==");
{
  const [entry, exit, qty] = [100, 90, 50];
  const amt = calcClosePnlAmount("SHORT", entry, exit, qty, 0);
  check("pnl_amount", amt, (entry - exit) * qty);            // 500
  const pct = calcTotalPnlPct(entry, qty, amt);
  check("pnl_pct == fiyat-hareketi %", pct, priceMovePct("SHORT", entry, exit)); // 10
}

console.log("== 3) Kısmili LONG — GESAN senaryosu ==");
{
  // entry 85.55, exit 87.25, final 29 lot, kısmi 455.30, ilk qty 116
  const entry = 85.55, exit = 87.25, finalQty = 29, rp = 455.30, initQty = 116;
  const amt = calcClosePnlAmount("LONG", entry, exit, finalQty, rp);
  check("pnl_amount == 504.60", amt, 504.60, 1e-9);          // 455.30 + 49.30
  const pct = calcTotalPnlPct(entry, initQty, amt);
  check("pnl_pct toplam-bazlı (~%5.085)", pct, (504.60 / (85.55 * 116)) * 100, 1e-9);
  // toplam-bazlı, final-dilim %'sinden (1.99) FARKLI olmalı:
  console.log(`      (final-dilim % = ${priceMovePct("LONG", entry, exit).toFixed(2)} — bilerek farklı)`);
}

console.log("== 4) Kısmili SHORT — DURDO benzeri, yön matematiği ==");
{
  // entry 5.44, exit 5.17, final 3125, kısmi 1062.50, ilk qty 6250
  const entry = 5.44, exit = 5.17, finalQty = 3125, rp = 1062.50, initQty = 6250;
  const amt = calcClosePnlAmount("SHORT", entry, exit, finalQty, rp);
  check("pnl_amount == 1906.25", amt, 1906.25, 1e-9);        // 1062.50 + 843.75
  const pct = calcTotalPnlPct(entry, initQty, amt);
  check("pnl_pct toplam-bazlı", pct, (1906.25 / (5.44 * 6250)) * 100, 1e-9);
}

console.log("== 5) Regresyon özdeşliği: kısmisizde toplam-% ≡ fiyat-hareketi % ==");
{
  const cases: Array<[PnlSide, number, number, number]> = [
    ["LONG", 42.5, 47.3, 137],
    ["SHORT", 213.4, 198.1, 46],
    ["LONG", 5.72, 5.72, 1000], // sıfır PnL kenarı
  ];
  for (const [side, entry, exit, qty] of cases) {
    const amt = calcClosePnlAmount(side, entry, exit, qty, 0);
    const pct = calcTotalPnlPct(entry, qty, amt);
    check(`${side} ${entry}->${exit}`, pct, priceMovePct(side, entry, exit), 1e-9);
  }
}

console.log(`\n${failed === 0 ? "TÜM TESTLER GEÇTİ ✓" : `${failed} TEST BAŞARISIZ ✗`}`);
process.exit(failed === 0 ? 0 : 1);
