// ---------------------------------------------------------------------------
// BİLANÇO DEĞERLEME MOTORU (Faz-1 MVP, 2026-08-24)
// ---------------------------------------------------------------------------
// fundamentals satırı + canlı fiyat + varsayımlar → sektör-duyarlı adil değer.
// Enflasyon-muhasebeli (reel) tablolar → REEL COE/g kullanılır (nominal faizle
// karıştırma). Tek sihirli sayı yerine yöntem-başına değer + aralık üretir.
//   - bank:       Justified P/B (ROE-Gordon) + Artık-Gelir (2 aşamalı)
//   - industrial: Justified F/K (ROE-türevli) + Görece F/K (benchmark)
//   - holding:    NAV gerekli (Faz-2) → yalnız P/D-F/K bağlamı, adil değer yok
// GARAN'da (2026-08-24) elle doğrulanan matematik.
// ---------------------------------------------------------------------------

export type FundRow = {
  symbol: string;
  template: string | null;
  shares: number | null;
  equity_parent: number | null;
  equity_total: number | null;
  net_income_period: number | null;
  net_income_parent: number | null;
  total_assets: number | null;
  revenue: number | null;
  operating_profit: number | null;
  dep_amort: number | null;
  bvps: number | null;
  eps_annualized: number | null;
  roe: number | null;
};

export type ValAssumptions = {
  coeReal: number;      // reel sermaye maliyeti (baz)
  gReal: number;        // reel sürekli büyüme
  roeSustCap: number;   // sürdürülebilir ROE tavanı (aşırı ROE'yi iskonto)
  benchmarkPE: number;  // sanayi görece F/K (piyasa/sektör)
  coeBand: number;      // aralık için ± COE (bull/bear)
};

export const DEFAULT_ASSUMPTIONS: ValAssumptions = {
  coeReal: 0.18,
  gReal: 0.05,
  roeSustCap: 0.25,
  benchmarkPE: 8,
  coeBand: 0.03,
};

export type ValMethod = { name: string; fairValue: number | null; note?: string };

export type ValResult = {
  symbol: string;
  template: string;
  price: number | null;
  bvps: number | null;
  epsAnnual: number | null;
  roe: number | null;
  pb: number | null;
  pe: number | null;
  methods: ValMethod[];
  fairLow: number | null;
  fairBase: number | null;
  fairHigh: number | null;
  upsidePct: number | null;   // base'e göre
  verdict: "İSKONTOLU" | "ADİL" | "PRİMLİ" | "NAV-GEREKLİ" | "VERİ-EKSİK";
  impliedCoe: number | null;  // piyasa fiyatının ima ettiği reel COE
  caveat: string;
};

// Justified P/B = (ROE - g) / (COE - g)
function justifiedPB(roe: number, coe: number, g: number): number {
  if (coe - g <= 0) return NaN;
  return (roe - g) / (coe - g);
}

// Artık-Gelir (2 aşamalı, ROE terminal'e fade): V = BV0 + Σ PV(RI) + TV
function residualIncome(
  bvps: number, roe0: number, coe: number, gTerm: number,
  roeTerm = 0.18, N = 5, payout = 0.30
): number {
  let bv = bvps, pv = 0;
  for (let t = 1; t <= N; t++) {
    const roeT = roe0 + (roeTerm - roe0) * (t / N);
    const ri = (roeT - coe) * bv;
    pv += ri / Math.pow(1 + coe, t);
    bv = bv * (1 + roeT * (1 - payout));
  }
  const riTerm = (roeTerm - coe) * bv;
  const tv = coe - gTerm > 0 ? (riTerm / (coe - gTerm)) / Math.pow(1 + coe, N) : 0;
  return bvps + pv + tv;
}

// Justified F/K (sürdürülebilir büyüme) = justifiedPB / ROE
function justifiedPE(roe: number, coe: number, g: number): number {
  const pb = justifiedPB(roe, coe, g);
  return roe > 0 ? pb / roe : NaN;
}

function pos(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function valuate(
  f: FundRow, price: number | null, a: ValAssumptions = DEFAULT_ASSUMPTIONS
): ValResult {
  const tmpl = (f.template ?? "industrial").toLowerCase();
  const bvps = pos(f.bvps);
  const epsAnnual = pos(f.eps_annualized);
  const roeRaw = pos(f.roe);
  const roe = roeRaw != null ? Math.min(roeRaw, a.roeSustCap) : null; // sürdürülebilir tavan
  const px = pos(price);
  const pb = bvps && px ? px / bvps : null;
  const pe = epsAnnual && px ? px / epsAnnual : null;

  const methods: ValMethod[] = [];
  let impliedCoe: number | null = null;
  const base = a.coeReal, g = a.gReal;

  if (tmpl === "holding") {
    return {
      symbol: f.symbol, template: tmpl, price: px, bvps, epsAnnual, roe: roeRaw,
      pb, pe, methods: [], fairLow: null, fairBase: null, fairHigh: null,
      upsidePct: null, verdict: "NAV-GEREKLİ", impliedCoe: null,
      caveat: "Holding: konsolide ROE yanıltıcı; değer iştiraklerin piyasa değerinde (NAV/parçaların-toplamı, Faz-2). P/D-F/K yalnız bağlam.",
    };
  }

  if (tmpl === "bank") {
    if (bvps && roe) {
      const fvBase = justifiedPB(roe, base, g) * bvps;
      methods.push({ name: "Justified P/B (ROE-Gordon)", fairValue: round2(fvBase) });
      methods.push({ name: "Artık-Gelir (2 aşamalı)", fairValue: round2(residualIncome(bvps, roe, base, g)) });
      if (pb) impliedCoe = g + (roe - g) / pb;
    }
  } else {
    // industrial / operasyonel
    if (epsAnnual && roe && epsAnnual > 0) {
      const fvPE = justifiedPE(roe, base, g) * epsAnnual;
      methods.push({ name: "Justified F/K (ROE-türevli)", fairValue: round2(fvPE) });
      methods.push({ name: `Görece F/K (${a.benchmarkPE}×)`, fairValue: round2(a.benchmarkPE * epsAnnual) });
      if (pe) impliedCoe = g + (roe - g) / pe; // ~ P/B ima; yaklaşık
    } else if (bvps && roe) {
      // negatif/eksik kazanç → defter-temelli fallback
      methods.push({ name: "Justified P/B (kazanç negatif → defter)", fairValue: round2(justifiedPB(roe, base, g) * bvps) });
    }
  }

  const fvs = methods.map((m) => m.fairValue).filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  if (!fvs.length) {
    return {
      symbol: f.symbol, template: tmpl, price: px, bvps, epsAnnual, roe: roeRaw,
      pb, pe, methods, fairLow: null, fairBase: null, fairHigh: null,
      upsidePct: null, verdict: "VERİ-EKSİK", impliedCoe,
      caveat: "Değerleme için yeterli/pozitif temel veri yok.",
    };
  }
  // COE bandıyla aralık (yalnız ilk yöntemin duyarlılığı üzerinden)
  let fairLow = Math.min(...fvs), fairHigh = Math.max(...fvs);
  if (bvps && roe && tmpl === "bank") {
    fairLow = Math.min(fairLow, round2(justifiedPB(roe, base + a.coeBand, g) * bvps));
    fairHigh = Math.max(fairHigh, round2(justifiedPB(roe, base - a.coeBand, g) * bvps));
  } else if (epsAnnual && roe && epsAnnual > 0) {
    fairLow = Math.min(fairLow, round2(justifiedPE(roe, base + a.coeBand, g) * epsAnnual));
    fairHigh = Math.max(fairHigh, round2(justifiedPE(roe, base - a.coeBand, g) * epsAnnual));
  }
  const fairBase = round2(fvs.reduce((x, y) => x + y, 0) / fvs.length); // yöntem ortalaması
  const upsidePct = px ? round2((fairBase / px - 1) * 100) : null;
  const verdict: ValResult["verdict"] =
    upsidePct == null ? "VERİ-EKSİK" : upsidePct > 15 ? "İSKONTOLU" : upsidePct < -15 ? "PRİMLİ" : "ADİL";

  return {
    symbol: f.symbol, template: tmpl, price: px, bvps, epsAnnual, roe: roeRaw,
    pb, pe, methods, fairLow: round2(fairLow), fairBase, fairHigh: round2(fairHigh),
    upsidePct, verdict, impliedCoe: impliedCoe != null ? round2(impliedCoe) : null,
    caveat: "Reel COE/g varsayımına duyarlı; enflasyon-muhasebeli tablolar. Temel-analiz egzersizi, yatırım tavsiyesi değildir.",
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
