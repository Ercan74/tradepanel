import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { isMarketOpen } from "@/lib/marketStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// İZOLE haber/temel-analiz bağlam taraması (news-test otomasyonu). Haiku (mekanik:
// fetch+etiketle+yapılandır) + web_search ile TEMPLATE reçetesini doldurur → notu
// news_context tablosuna yazar. CANLI AGENT'A BESLENMEZ (1c kapısı sonrası okunacak).
// Derin sentez/karar bilinçli olarak buraya YÜKLENMEZ — güçlü portföy-agent'ında.
// Cron: 2×/gün (10:00/14:00 TR) izole; entegrasyonda 15-dk-yoklama+olay-tetikliye çıkar.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const MONITOR_SECRET = process.env.RISK_MONITOR_SECRET ?? "ema100_secret_2026";
// Model: Sonnet seçildi (2026-08-18 Haiku vs Sonnet kıyası sonrası — Sonnet
// pozisyon-başı disiplin + güven-yargısı + derinlikte belirgin üstün, 2×/gün
// izole maliyeti mütevazı). env ile değiştirilebilir (ör. Haiku'ya düşür / Sonnet-5).
const NEWS_MODEL = process.env.NEWS_SCAN_MODEL ?? "claude-sonnet-4-6";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const RECIPE = `Sen İZOLE bir haber/temel-analiz BAĞLAM üreticisisin (haber agent). BAĞLAM üretirsin, SİNYAL DEĞİL: "al/sat" DEMEZSİN, yön/fiyat tahmini YOK. Çıktın canlı karara beslenmez; portföy-agent'ı sonra okuyup teknik kararını buna göre tartar.

GÖREV: Verilen açık portföy + "son not özeti" ışığında, bugünkü DELTA bağlam notunu üret. web_search ile GÜNCEL veriyi çek.

KAYNAK TIER'LARI (her iddia etiketli):
- Tier 0 (birincil/resmi): KAP, MKK, BIST, SPK, BDDK, EPDK, TCMB, TÜİK, MSCI, FTSE Russell (LSEG), Moody's/S&P/Fitch, BLS/Fed/FOMC, EIA + UZAK DOĞU: BOJ, PBoC, NBS, CSRC, HKMA, BOK.
- Tier 1 (yabancı-finans): Reuters, Bloomberg, FT, WSJ, CNBC, Economist + UZAK DOĞU: Nikkei, Caixin, SCMP.
- Tier 2 (yerli aracı kurum): İş/Ak/Garanti BBVA/Gedik/Oyak/Ünlü&Co/Global Yatırım.
- MAKRO/GLOBAL için Tier 0 yabancı + Tier 1 ESAS (Türkçe aktarım gecikir/yanlış çerçeveler). Doğrulanamayan → GİRME.

GÜVEN ETİKETİ (her madde): KESİN (Tier0 resmi+gerçekleşmiş olgu) | RAPORLU (Tier1/2 tek kaynak/yakın-katalizör) | ANLATI (görüş/2.derece/beklenti — tek başına aksiyon gerekçesi olamaz). Format: [GÜVEN · Tier · kaynak · tarih].

4 KATMAN (kategori kontrol listesi):
- K1 ŞİRKET: portföy hisseleri için bilanço-takvimi/sonuç, KAP (temettü/blok-satış/ortak/insider/M&A/SPK), regülasyon, aracı-kurum rating/hedef. Yakın bilanço = olay-riski (kaç gün). Her satır: teknik-uyum/çelişki 1 cümle.
- K2 MAKRO: FOMC/Fed, TCMB/TÜİK, DXY (yön+neden), Brent, rating, CDS, Çin PMI/talep→BRSAN/EREGL çelik, BOJ/yen-carry, peer read-across.
- K3 JEOPOLİTİK: yalnız DOĞRULANMIŞ olay → olası sektör etkisi. Spekülasyon GİRMEZ. EN KATI.
- K4 ENDEKS/AKIŞ (bu katman ZAYIF kalma eğiliminde — AKTİF ve AYRI ARA, gruplama): (a) MSCI Türkiye — Kasım 2026 sınıflandırma testi (şeffaflık/serbest-dolaşım); (b) FTSE Russell (LSEG) Türkiye — serbest-dolaşım (MKK yeni metodoloji, 15.06.2026) endişesi, Eylül revizyonu kısmen ASKIDA, ARALIK 2026 nihai değerlendirme (downgrade/watch riski); (c) BIST XU030/XU100 revizyon; (d) yabancı-takas. Bunlar takvim-bilinir → pasif-fon zorunlu al/sat = BÜYÜK etki; ATLAMA.

DİSİPLİN: nedensellik zincirini kur AMA karşı-kuvvetleri de yaz; "piyasa çoktan fiyatladı mı" sor; çelişki (temel↔teknik) görünür kıl; bulunamazsa "doğrulanabilir bağlam yok" yaz.

ÖNEMLİ: Süreç/arama ANLATMA — "arama yapıyorum", "veri topladım" gibi cümleler YAZMA. Doğrudan notla başla.

ÇIKTI: Önce markdown DELTA notu (Δ özet → K1 → K2 → K3 → K4 → 🔗 katmanlar-arası sentez → güven özeti). Sonra EN SONDA tek satır makine-okunur meta, AYNEN şu formatta bir JSON kod bloğu:
\`\`\`json
{"note_type":"DELTA","regime":"RISK-ON|RISK-OFF|KARIŞIK","summary":"tek cümle özet","confidence":{"kesin":0,"raporlu":0,"anlati":0},"portfolio_symbols":["..."]}
\`\`\``;

export async function GET(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // İşlem günü değilse (hafta sonu/tatil) tarama yapma.
  const day = await isMarketOpen();
  if (!day.open) {
    return NextResponse.json({ ok: true, skipped: day.reason });
  }

  try {
    // 1) Açık portföy (K1 kapsamı)
    const { data: positions } = await supabase
      .from("positions")
      .select("symbol,side,sector")
      .eq("status", "OPEN");
    const portfolioLine = (positions ?? [])
      .map((p: any) => `${p.symbol}(${p.side}${p.sector ? "," + p.sector : ""})`)
      .join(", ");

    // 2) Son not (DELTA referansı)
    const { data: last } = await supabase
      .from("news_context")
      .select("scan_at,summary,regime")
      .order("scan_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastLine = last
      ? `Son not (${last.scan_at}): rejim=${last.regime ?? "-"} · ${last.summary ?? "-"}`
      : "Önceki not yok — bu ilk not, DELTA yerine kısa BASELINE üret.";

    const nowTR = new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
    const slot = new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit" }).slice(0, 2) + ":00";

    // 3) Haiku + web_search
    const response = await anthropic.messages.create({
      model: NEWS_MODEL,
      max_tokens: 8000,
      system: RECIPE,
      messages: [
        {
          role: "user",
          content: `Tarih/saat (TR): ${nowTR}\nAÇIK PORTFÖY: ${portfolioLine || "(boş)"}\n${lastLine}\n\nDELTA bağlam notunu şimdi üret.`,
        },
      ],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 } as any],
    });

    const rawText = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    // 4) Meta JSON'u ayır (son ```json bloğu), content = öncesi
    let meta: any = {};
    const metaMatch = rawText.match(/```json\s*([\s\S]*?)```\s*$/);
    if (metaMatch) {
      try { meta = JSON.parse(metaMatch[1].trim()); } catch { meta = {}; }
    }
    const content = metaMatch ? rawText.slice(0, metaMatch.index).trim() : rawText;

    if (!content) {
      return NextResponse.json({ ok: false, error: "Boş not üretildi" }, { status: 500 });
    }

    // 5) news_context'e yaz. Bu route yalnız notu ÜRETİR; portföy-agent notu
    // ayrıca kendi çalışmasında OKUR (2026-08-19'dan beri canlı entegre).
    const conf = meta.confidence ?? {};
    const { data: inserted, error } = await supabase
      .from("news_context")
      .insert({
        scan_slot: slot,
        note_type: meta.note_type ?? (last ? "DELTA" : "BASELINE"),
        content,
        summary: meta.summary ?? null,
        regime: meta.regime ?? null,
        confidence_kesin: Number(conf.kesin ?? 0),
        confidence_raporlu: Number(conf.raporlu ?? 0),
        confidence_anlati: Number(conf.anlati ?? 0),
        portfolio_symbols: Array.isArray(meta.portfolio_symbols) ? meta.portfolio_symbols : (positions ?? []).map((p: any) => p.symbol),
        model: NEWS_MODEL,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      id: inserted.id,
      slot,
      regime: meta.regime ?? null,
      confidence: conf,
      summary: meta.summary ?? null,
      contentChars: content.length,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error("NEWS_SCAN_ERROR", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
