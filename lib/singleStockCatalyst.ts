// ---------------------------------------------------------------------------
// TEK-HİSSE KATALİZÖR KONTROLÜ (2026-08-28) — SHORT-into-tavan güvenlik kontrolü.
// ---------------------------------------------------------------------------
// SHORT sinyali bir TAVAN SERİSİNE denk geldiğinde (bkz. lib/tavanSeries) agent bunu
// çağırır: hisse için TAZE, HEDEFLİ web araması yapıp tavanı açıklayan doğrudan/dolaylı
// bir katalizör var mı bakar. Kanıt agent'a döner; agent aç/açma kararını verir.
// news-context-scan'in kanıtlı desenini (Anthropic + web_search + Tier-0/KAP) tek-sembol
// için kullanır. Hata olursa null döner (agent bağlamsız devam — asla bloklamaz).
// ---------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.NEWS_SCAN_MODEL ?? "claude-sonnet-4-6";
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export type CatalystCheck = {
  catalystFound: boolean | null; // null = belirlenemedi / hata
  summary: string;
  confidence: "KESİN" | "RAPORLU" | "ANLATI" | null;
  shortVerdict: "TEHLİKELİ" | "BELİRSİZ" | "GÜVENLİ" | null;
  error?: string;
};

const SYSTEM = `Sen tek bir BIST hissesi için KATALİZÖR-KONTROLÜ yapan bir analistsin. Görev DAR ve NET.

BAĞLAM: Verilen hisse ARDIŞIK TAVAN yapıyor (birkaç gün üst üste ~+%10) ve teknik bir SHORT sinyali oluştu. Teknik körlükle bu hisseyi short'lamak EXIT-TRAP riski taşır: kilitli tavanda short'u COVER EDEMEZSİN (alıcı bol/satıcı yok), stop-loss FİİLEN ÇALIŞMAZ, seri kaç gün süreceği öngörülemez → yönetilemez zarar.

SORU: Bu tavan serisini açıklayan, teknik-SHORT'a TERS, DOĞRUDAN veya DOLAYLI bir katalizör/haber var mı?

KURALLAR:
- web_search ile GÜNCEL veriyi çek. Öncelik Tier-0 (resmi): KAP, MKK, SPK, BIST, BDDK, TCMB; sonra saygın haber/ajans kaynakları. Doğrudan (şirkete özel: dava, KAP açıklaması, M&A, blok-satış, temettü, ortaklık, kılavuz) + dolaylı (sektör/regülasyon/makro şok) katalizörlere bak.
- KAYNAK YOKSA UYDURMA. Kanıt bulamazsan catalyst_found:false, confidence:ANLATI.
- Güven: KESİN (resmi/KAP tescilli) · RAPORLU (saygın kaynak, doğrulanmış) · ANLATI (söylenti/zayıf).
- short_verdict: TEHLİKELİ (güçlü katalizör var, short açma) · BELİRSİZ (zayıf/çelişkili) · GÜVENLİ (katalizör yok, teknik-uzama olabilir).

ÇIKTI: Önce 2-4 cümle kısa analiz (bulgular + kaynak). SON satırda TEK bir json bloğu:
\`\`\`json
{"catalyst_found": true, "summary": "tek cümle özet", "confidence": "KESİN", "short_verdict": "TEHLİKELİ"}
\`\`\``;

export async function checkSingleStockCatalyst(
  symbol: string,
  tavanSummary: string,
  side: "SHORT" | "LONG" = "SHORT"
): Promise<CatalystCheck> {
  if (!anthropic) {
    return { catalystFound: null, summary: "", confidence: null, shortVerdict: null, error: "ANTHROPIC_API_KEY yok" };
  }
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Hisse: ${symbol}\nDurum: ${tavanSummary}\nTeknik sinyal: ${side}\n\nBu hisse için katalizör kontrolünü şimdi yap (web_search kullan).`,
        },
      ],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 } as unknown as Anthropic.Tool],
    });
    const raw = resp.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    const m = raw.match(/```json\s*([\s\S]*?)```\s*$/);
    let meta: Record<string, unknown> = {};
    if (m) { try { meta = JSON.parse(m[1].trim()); } catch { /* boş */ } }
    const fallbackSummary = (m ? raw.slice(0, m.index).trim() : raw).slice(0, 300);
    return {
      catalystFound: typeof meta.catalyst_found === "boolean" ? (meta.catalyst_found as boolean) : null,
      summary: (meta.summary as string) ?? fallbackSummary,
      confidence: (meta.confidence as CatalystCheck["confidence"]) ?? null,
      shortVerdict: (meta.short_verdict as CatalystCheck["shortVerdict"]) ?? null,
    };
  } catch (e) {
    return { catalystFound: null, summary: "", confidence: null, shortVerdict: null, error: e instanceof Error ? e.message : String(e) };
  }
}
