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

// Holding NAV girdisi: iştirak payı × iştirakin piyasa değeri.
export type StakeMktCap = { ticker: string; stakePct: number; subMktCap: number | null };
export type HoldingNavInput = {
  holdingShares: number | null;
  stakes: StakeMktCap[];
  netCash?: number; // holding-seviyesi net nakit (− borç); yoksa 0
};

// NAV = Σ (pay% × iştirak piyasa değeri) + net nakit. Fiyatı olmayan iştirak atlanır
// (kapsam raporlanır). navPerShare = NAV / holding hisse.
function computeNav(inp: HoldingNavInput): { navPerShare: number | null; navGross: number; priced: number; total: number } {
  let navGross = 0, priced = 0;
  for (const s of inp.stakes) {
    if (s.subMktCap != null && Number.isFinite(s.subMktCap) && s.subMktCap > 0) {
      navGross += (s.stakePct / 100) * s.subMktCap;
      priced++;
    }
  }
  const nav = navGross + (inp.netCash ?? 0);
  const navPerShare = inp.holdingShares && inp.holdingShares > 0 ? nav / inp.holdingShares : null;
  return { navPerShare, navGross, priced, total: inp.stakes.length };
}

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
  verdict: "İSKONTOLU" | "ADİL" | "PRİMLİ" | "NAV-GEREKLİ" | "VERİ-EKSİK" | "BAĞLAM";
  impliedCoe: number | null;  // piyasa fiyatının ima ettiği reel COE
  evEbitda: number | null;    // kendi EV/EBITDA (bağlam)
  peerMedian: number | null;  // sektör EV/EBITDA medyanı (n≥5 ise; bağlam)
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

function pos(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// Canlı piyasa çarpanları (Matriks). P/D & F/K → BVPS/EPS/ROE türetir (Matriks ile
// birebir). Faz-2b: EV/EBITDA (FD_FAVOK), Piyasa Değeri, Firma Değeri (EV), sektör.
export type MarketMultiples = {
  pb: number | null;
  pe: number | null;
  evEbitda?: number | null;   // FD/FAVÖK — sanayi sektör-göreli değerleme
  mktCap?: number | null;     // Piyasa Değeri
  firmValue?: number | null;  // Firma Değeri (EV) → Net Borç = firmValue − mktCap
  sector?: string | null;     // BIST sektörü → finansal-yönlendirme + medyan kıyas
};

// Sektör-akran bağlamı (sayfada tüm evren üzerinden hesaplanır): sanayi EV/EBITDA
// medyanı. n<5 sektörlerde geniş-sanayi medyanına düşülür (scope="broad").
export type PeerContext = { evEbitdaMedian: number | null; n: number; scope: "sector" | "broad" };

// Finansal sektörler → banka-track (Justified P/B + Artık-Gelir); EBITDA anlamsız.
// GYO dahil: defter ≈ portföy NAV'ı olduğundan P/B sinyali geçerli (şerhli).
export const FINANCIAL_SECTORS = new Set<string>([
  "BANKALAR",
  "SİGORTA ŞİRKETLERİ",
  "FİNANSAL KİRALAMA VE FAKTORİNG ŞİRKETLERİ",
  "FİNANSMAN ŞİRKETLERİ",
  "ARACI KURUMLAR",
  "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
]);
const REIT_SECTOR = "GAYRİMENKUL YATIRIM ORTAKLIKLARI";
const HOLDING_SECTOR = "HOLDİNGLER VE YATIRIM ŞİRKETLERİ";

export function valuate(
  f: FundRow, price: number | null, a: ValAssumptions = DEFAULT_ASSUMPTIONS,
  navInput?: HoldingNavInput, market?: MarketMultiples, peer?: PeerContext
): ValResult {
  const sector = market?.sector ?? null;
  // Sektör-yönlendirme: KAP şablonu sigortacıları "industrial" sanıyordu. Sektör
  // bilgisi varsa finansalları banka-track'e, holding sektörünü holding'e al.
  let tmpl = (f.template ?? "industrial").toLowerCase();
  if (sector) {
    if (FINANCIAL_SECTORS.has(sector)) tmpl = "bank";
    else if (sector === HOLDING_SECTOR) tmpl = "holding";
  }
  const px = pos(price);
  // Bağlam çarpanları (tüm return'lerde taşınır): kendi EV/EBITDA + sektör medyanı.
  const ownEE = pos(market?.evEbitda);
  const peerMed = peer && peer.scope === "sector" ? pos(peer.evEbitdaMedian) : null;

  // ---- Girdi kaynağı: canlı feed birincil, KAP-parse yedek ------------------
  // Matriks P/D & F/K varsa BVPS=fiyat/pb, EPS=fiyat/pe, ROE=pb/pe (özdeşlik) —
  // özkaynak-kolonu/hisse-sayısı/ölçek parse hatalarını (ISCTR/SKBNK/CVKMD) bypass
  // eder. F/K negatif/sıfır (zarar) → EPS/ROE türetilmez (feed yetkiliyken KAP'a
  // düşmez; değerleme VERİ-EKSİK olur — Matriks'in "zarar" verdiği yanlış-pozitife
  // dönmesin). P/D yoksa (feed satırı eksik) tümüyle KAP-parse'a düşülür.
  const mPb = market ? pos(market.pb) : null;
  const mPe = market ? pos(market.pe) : null; // pos negatifi de döndürür; >0 kontrolü aşağıda
  const hasFeed = mPb != null && mPb > 0 && px != null;

  const bvps = hasFeed ? px! / mPb! : pos(f.bvps);
  const epsAnnual = hasFeed ? (mPe != null && mPe > 0 ? px! / mPe : null) : pos(f.eps_annualized);
  const roeRaw = hasFeed ? (mPe != null && mPe > 0 ? mPb! / mPe : null) : pos(f.roe);
  const roe = roeRaw != null ? Math.min(roeRaw, a.roeSustCap) : null; // sürdürülebilir tavan
  const pb = bvps && px ? px / bvps : null; // feed varken = mPb (özdeşlik)
  const pe = epsAnnual && px ? px / epsAnnual : null;

  const methods: ValMethod[] = [];
  let impliedCoe: number | null = null;
  const base = a.coeReal, g = a.gReal;

  if (tmpl === "holding") {
    const nav = navInput ? computeNav(navInput) : null;
    if (nav && nav.navPerShare != null && nav.priced > 0) {
      const navPS = round2(nav.navPerShare);
      const upside = px ? round2((navPS / px - 1) * 100) : null; // NAV'a göre (negatif = iskonto)
      const disc = px ? round2((px / navPS - 1) * 100) : null;   // fiyatın NAV'a primi/iskontosu
      const verdict: ValResult["verdict"] =
        upside == null ? "VERİ-EKSİK" : upside > 15 ? "İSKONTOLU" : upside < -15 ? "PRİMLİ" : "ADİL";
      return {
        symbol: f.symbol, template: tmpl, price: px, bvps, epsAnnual, roe: roeRaw, pb, pe,
        methods: [{ name: `NAV (${nav.priced}/${nav.total} iştirak fiyatlı)`, fairValue: navPS }],
        fairLow: navPS, fairBase: navPS, fairHigh: navPS, upsidePct: upside, verdict, impliedCoe: null,
        evEbitda: ownEE, peerMedian: peerMed,
        caveat: `NAV = Σ(pay% × iştirak piyasa değeri)${navInput?.netCash ? " + net nakit" : ""}. Fiyat NAV'a göre %${disc != null ? (disc >= 0 ? "+" : "") + disc : "?"} (${disc != null && disc < 0 ? "iskonto" : "prim"}). Kapsam: ${nav.priced}/${nav.total} listeli iştirak; halka-açık-olmayan + holding net nakit dahil DEĞİL (kısmi NAV). Temel-analiz egzersizi, yatırım tavsiyesi değil.`,
      };
    }
    return {
      symbol: f.symbol, template: tmpl, price: px, bvps, epsAnnual, roe: roeRaw,
      pb, pe, methods: [], fairLow: null, fairBase: null, fairHigh: null,
      upsidePct: null, verdict: "NAV-GEREKLİ", impliedCoe: null, evEbitda: ownEE, peerMedian: peerMed,
      caveat: "Holding: konsolide ROE yanıltıcı; değer iştiraklerin piyasa değerinde (NAV). İştirak-payı verisi henüz yok (dipnot PDF parse edilecek).",
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
    // ---- SANAYİ / OPERASYONEL — OPTION A (2026-08-25) ----------------------
    // BIST sektör etiketleri EV/EBITDA-medyanı için fazla HETEROJEN (rafineri+özel-
    // kimya aynı kovada; TUPRS 5.3× vs "kimya" 11× → sahte-ucuz). Otomatik sektör-göreli
    // HÜKÜM güvenilmez → sanayi için SERT VERDİKT VERMİYORUZ. Çarpanları (F/K, EV/EBITDA
    // + sektör medyanı) BAĞLAM olarak sunar, kullanıcı yorumlar. Banka/finansal + holding
    // verdiktleri geçerli kalır. (Faz-2b ileri: küratörlü akran / kendi-tarihsel çarpan.)
    const opRaw = f.operating_profit;
    const niH1 = f.net_income_period;
    const hasAny = ownEE != null || (epsAnnual != null && epsAnnual > 0) || bvps != null;
    if (!hasAny) {
      return {
        symbol: f.symbol, template: tmpl, price: px, bvps, epsAnnual, roe: roeRaw, pb, pe,
        methods: [], fairLow: null, fairBase: null, fairHigh: null, upsidePct: null,
        verdict: "VERİ-EKSİK", impliedCoe: null, evEbitda: ownEE, peerMedian: peerMed,
        caveat: "Değerleme için yeterli/pozitif temel veri yok.",
      };
    }
    // Tek-seferlik-kâr işareti (Faz-2a): faaliyet zararı + net kâr → kâr faaliyet-dışı.
    const lowQ = niH1 != null && niH1 > 0 && opRaw != null && opRaw <= 0;
    const relNote =
      ownEE != null && ownEE > 0 && peerMed != null && peerMed > 0
        ? `Kendi EV/EBITDA ${round2(ownEE)}× · sektör medyanı ${round2(peerMed)}× (n=${peer!.n}). `
        : ownEE != null && ownEE > 0
          ? `Kendi EV/EBITDA ${round2(ownEE)}× (sektör medyanı yok — ince/heterojen). `
          : "";
    return {
      symbol: f.symbol, template: tmpl, price: px, bvps, epsAnnual, roe: roeRaw, pb, pe,
      methods: [], fairLow: null, fairBase: null, fairHigh: null, upsidePct: null,
      verdict: "BAĞLAM", impliedCoe: null, evEbitda: ownEE, peerMedian: peerMed,
      caveat:
        relNote +
        (lowQ ? "Kâr kalitesi düşük (faaliyet zararı + net kâr pozitif). " : "") +
        "Sanayi: BIST sektörleri heterojen → otomatik değerleme hükmü verilmez; çarpanlar bağlam içindir. Yatırım tavsiyesi değildir.",
    };
  }

  // ---- Buraya yalnız BANKA/FİNANSAL track düşer (sanayi/holding yukarıda döndü) ----
  const fvs = methods.map((m) => m.fairValue).filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  if (!fvs.length) {
    return {
      symbol: f.symbol, template: tmpl, price: px, bvps, epsAnnual, roe: roeRaw,
      pb, pe, methods, fairLow: null, fairBase: null, fairHigh: null,
      upsidePct: null, verdict: "VERİ-EKSİK", impliedCoe, evEbitda: ownEE, peerMedian: peerMed,
      caveat: "Değerleme için yeterli/pozitif temel veri yok.",
    };
  }
  let fairLow = Math.min(...fvs), fairHigh = Math.max(...fvs);
  if (bvps && roe) {
    fairLow = Math.min(fairLow, round2(justifiedPB(roe, base + a.coeBand, g) * bvps));
    fairHigh = Math.max(fairHigh, round2(justifiedPB(roe, base - a.coeBand, g) * bvps));
  }
  const fairBase = round2(fvs.reduce((x, y) => x + y, 0) / fvs.length);
  const upsidePct = px ? round2((fairBase / px - 1) * 100) : null;
  const verdict: ValResult["verdict"] =
    upsidePct == null ? "VERİ-EKSİK" : upsidePct > 15 ? "İSKONTOLU" : upsidePct < -15 ? "PRİMLİ" : "ADİL";

  return {
    symbol: f.symbol, template: tmpl, price: px, bvps, epsAnnual, roe: roeRaw,
    pb, pe, methods, fairLow: round2(fairLow), fairBase, fairHigh: round2(fairHigh),
    upsidePct, verdict, impliedCoe: impliedCoe != null ? round2(impliedCoe) : null,
    evEbitda: ownEE, peerMedian: peerMed,
    caveat: sector === REIT_SECTOR
      ? "GYO: defter ≈ portföy NAV'ı → P/B sinyali göstergedir; kira/yeniden-değerleme dönemsel, prim/iskonto NAV'a göre okunmalı. Yatırım tavsiyesi değildir."
      : "Reel COE/g varsayımına duyarlı; enflasyon-muhasebeli tablolar. Temel-analiz egzersizi, yatırım tavsiyesi değildir.",
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
