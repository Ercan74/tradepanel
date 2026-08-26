// ---------------------------------------------------------------------------
// DEĞERLEME SNAPSHOT (Faz-2b Aşama-1 — GÖZLEM) 2026-08-26
// ---------------------------------------------------------------------------
// Portföy agent'ına giriş anında BAĞLAM olarak sunulacak kompakt değerleme özeti.
// AŞAMA-1 = GÖZLEM: agent bunu görür + karara kaydedilir (attribution), ama
// giriş/sizing/stop DAVRANIŞINI DEĞİŞTİRMEZ. Kanıt biriktikten sonra (Aşama-2)
// yalnız yüksek-güven durumda hafif tilt değerlendirilecek. Mekanik çıkışa (trailing/
// TP) ASLA dokunmaz. valuate()'i yeniden kullanır; üstüne güven-bayrağı + tek-satır özet.
// ---------------------------------------------------------------------------

import {
  valuate,
  FINANCIAL_SECTORS,
  DEFAULT_ASSUMPTIONS,
  type FundRow,
  type MarketMultiples,
  type PeerContext,
  type HoldingNavInput,
} from "./valuation";

// Sanayi sektör-göreli EV/EBITDA kıyasının GÜVENİLİR olduğu homojen sektörler
// (tek alt-iş; medyan anlamlı). Temkinli beyaz-liste — veriyle genişletilir.
export const HOMOGENEOUS_SECTORS = new Set<string>([
  "TAŞ VE TOPRAĞA DAYALI", // çimento
  "ANA METAL SANAYİ",      // çelik
]);

// İstikrarlı-kazanç sektörleri: öz-tarihsel F/K sinyali güvenilir (çevrimsel değil).
export const STABLE_EARNINGS_SECTORS = new Set<string>([
  "BANKALAR",
  "SİGORTA ŞİRKETLERİ",
  "TELEKOMÜNİKASYON",
  "GIDA, İÇECEK VE TÜTÜN",
  "PERAKENDE TİCARET",
]);

export type ValuationSnapshot = {
  track: "banka/finansal" | "holding" | "sanayi";
  verdict: string;
  upsidePct: number | null;
  evEbitda: number | null;
  peerMedian: number | null;
  livePe: number | null;
  ownHistPe: number | null;
  ownHistRead: "ucuz-kendine" | "pahalı-kendine" | "adil-kendine" | null;
  confidence: "yüksek" | "orta" | "düşük";
  summary: string; // prompt için tek satır
};

function ownHistReadOf(livePe: number | null, ownHistPe: number | null) {
  if (livePe == null || livePe <= 0 || ownHistPe == null || ownHistPe <= 0) return null;
  if (livePe < ownHistPe * 0.85) return "ucuz-kendine" as const;
  if (livePe > ownHistPe * 1.15) return "pahalı-kendine" as const;
  return "adil-kendine" as const;
}

/**
 * Kompakt değerleme snapshot'ı. Hiç veri yoksa / hesap patlarsa null döner
 * (çağıran taraf bağlamsız devam eder). GÖZLEM amaçlı — davranış değiştirmez.
 */
export function valuationSnapshot(
  fund: FundRow | undefined,
  price: number | null,
  market: MarketMultiples | undefined,
  peer: PeerContext | undefined,
  ownHistPe: number | null,
  navInput?: HoldingNavInput
): ValuationSnapshot | null {
  if (!fund && !market) return null;
  const sector = market?.sector ?? null;
  const livePe = market?.pe ?? null;
  const ownRead = ownHistReadOf(livePe, ownHistPe);

  // valuate için minimal FundRow (fund yoksa iskelet — çarpanlar feed'den türer)
  const f: FundRow =
    fund ??
    ({
      symbol: "?", template: null, shares: null, equity_parent: null, equity_total: null,
      net_income_period: null, net_income_parent: null, total_assets: null, revenue: null,
      operating_profit: null, dep_amort: null, bvps: null, eps_annualized: null, roe: null,
    } as FundRow);

  let v;
  try {
    v = valuate(f, price, DEFAULT_ASSUMPTIONS, navInput, market, peer);
  } catch {
    return null;
  }

  const track: ValuationSnapshot["track"] =
    v.template === "bank" ? "banka/finansal" : v.template === "holding" ? "holding" : "sanayi";

  // Güven bayrağı: banka/holding gerçek verdikt → yüksek; sanayi homojen sektör →
  // yüksek; istikrarlı-kazanç sektörü (öz-tarih güvenilir) → orta; aksi → düşük.
  let confidence: ValuationSnapshot["confidence"] = "düşük";
  if ((track === "banka/finansal" || track === "holding") &&
      v.verdict !== "VERİ-EKSİK" && v.verdict !== "NAV-GEREKLİ") {
    confidence = "yüksek";
  } else if (sector && HOMOGENEOUS_SECTORS.has(sector)) {
    confidence = "yüksek";
  } else if (sector && STABLE_EARNINGS_SECTORS.has(sector)) {
    confidence = "orta";
  }

  // Tek-satır özet (prompt)
  const parts: string[] = [track];
  if (track === "banka/finansal" || track === "holding") {
    parts.push(`${v.verdict}${v.upsidePct != null ? ` (${v.upsidePct >= 0 ? "+" : ""}${v.upsidePct.toFixed(0)}%)` : ""}`);
  } else {
    // sanayi: EV/EBITDA vs sektör medyanı (homojen mi?) + öz-tarih F/K
    if (v.evEbitda != null && v.evEbitda > 0) {
      const homo = sector && HOMOGENEOUS_SECTORS.has(sector);
      parts.push(
        v.peerMedian != null
          ? `EV/EBITDA ${v.evEbitda.toFixed(1)} vs sektör ${v.peerMedian.toFixed(1)}${homo ? " (homojen)" : " (heterojen→dikkat)"}`
          : `EV/EBITDA ${v.evEbitda.toFixed(1)} (akran yok)`
      );
    }
  }
  if (ownRead) {
    const stable = sector && STABLE_EARNINGS_SECTORS.has(sector);
    parts.push(`öz-tarih F/K ${ownRead}${stable ? "" : " (çevrimsel→gürültülü)"}`);
  }
  parts.push(`güven:${confidence}`);

  return {
    track,
    verdict: v.verdict,
    upsidePct: v.upsidePct,
    evEbitda: v.evEbitda,
    peerMedian: v.peerMedian,
    livePe,
    ownHistPe,
    ownHistRead: ownRead,
    confidence,
    summary: parts.join(" · "),
  };
}
