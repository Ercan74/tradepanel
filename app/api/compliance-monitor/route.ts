import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Web aramalı Claude çağrısı uzun sürebilir
export const maxDuration = 300;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const MONITOR_SECRET = process.env.RISK_MONITOR_SECRET ?? "ema100_secret_2026";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Uyumluluk izleme: SPK genel açığa satış yasağı, VBTS geçici yasakları ve
// BIST 50 üyelik değişikliklerini web aramasıyla tarar, tabloları günceller.
//
// GÜVEN KAPILARI (asimetrik güvenlik):
//  - Kısıtlayıcı değişiklikler (yasak AÇIK, yeni exclusion, BIST50'den
//    çıkarma): confidence medium+ ile uygulanır.
//  - Serbestleştirici değişiklikler (yasak KAPALI, BIST50'ye ekleme):
//    yalnızca confidence high ile uygulanır.
//  - confidence low: hiçbir şey uygulanmaz, Telegram'a manuel kontrol
//    uyarısı gider.
// ---------------------------------------------------------------------------

type ComplianceReport = {
  globalBanActive: boolean;
  newExclusions: { symbol: string; from: string; until: string; reason?: string }[];
  bist50Changes: { added: string[]; removed: string[] } | null;
  sourcesChecked: string;
  confidence: "high" | "medium" | "low";
};

function buildPrompt(): string {
  const today = new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  return `Sen Borsa İstanbul (BIST) uyumluluk analistisin. Bugünün tarihi: ${today}.
Web aramasını kullanarak şu üç konuyu GÜNCEL kaynaklardan kontrol et:

1) GENEL AÇIĞA SATIŞ YASAĞI: SPK'nın veya Borsa İstanbul'un Borsa genelinde
   açığa satış yasağı ŞU AN aktif mi? Son SPK/Borsa İstanbul duyurularını ara.

2) YENİ VBTS YASAKLARI: Son 24 saatte VBTS (Volatilite Bazlı Tedbir Sistemi)
   kapsamında açığa satış/kredili işlem yasağı İLAN EDİLEN semboller var mı?
   KAP (kap.org.tr) duyurularını ara. Her sembol için başlangıç ve bitiş
   tarihlerini bul.

3) BIST 50 REVİZYONU: BIST 50 (XU050) endeks bileşenleri yakın zamanda revize
   edildi mi, üye değişikliği (eklenen/çıkarılan) duyuruldu mu?

YANIT KURALLARI:
Yanıtın SADECE aşağıdaki geçerli JSON olmalı. Kod bloğu kullanma, JSON dışında
hiçbir metin ekleme. İlk karakter { son karakter } olmalı:
{
  "globalBanActive": true/false,
  "newExclusions": [{"symbol": "SEMBOL", "from": "YYYY-MM-DD", "until": "YYYY-MM-DD", "reason": "VBTS"}],
  "bist50Changes": {"added": ["SEMBOL"], "removed": ["SEMBOL"]} veya null,
  "sourcesChecked": "kontrol ettiğin kaynakların kısa özeti",
  "confidence": "high" | "medium" | "low"
}
Doğrulayamadığın bilgi için kayıt üretme; emin değilsen confidence değerini
düşür. Değişiklik bulamadıysan newExclusions boş dizi, bist50Changes null olsun.`;
}

export async function GET(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1) Claude + web_search
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: buildPrompt(),
      messages: [
        {
          role: "user",
          content:
            "Üç uyumluluk kontrolünü şimdi yap ve sonucu istenen JSON formatında döndür.",
        },
      ],
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 8 } as any,
      ],
    });

    const rawText = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    let report: ComplianceReport | null = null;
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) report = JSON.parse(match[0]);
    } catch {
      report = null;
    }

    if (!report) {
      console.error("COMPLIANCE_PARSE_ERROR", rawText.slice(0, 300));
      await sendTelegramMessage(
        "⚖️ UYUMLULUK TARAMASI\n\n⚠️ Sonuç parse edilemedi — manuel kontrol önerilir."
      );
      return NextResponse.json(
        { ok: false, error: "Rapor parse edilemedi" },
        { status: 500 }
      );
    }

    const confidence = String(report.confidence ?? "low").toLowerCase();
    const applied: string[] = [];
    const skipped: string[] = [];

    // 2a) Genel yasak bayrağı
    const { data: banRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "short_sell_globally_banned")
      .maybeSingle();
    const currentBan = banRow?.value === true;
    const desiredBan = Boolean(report.globalBanActive);

    if (desiredBan !== currentBan) {
      // Yasak AÇMAK kısıtlayıcı (medium+), KAPATMAK serbestleştirici (yalnız high)
      const allowed = desiredBan ? confidence !== "low" : confidence === "high";
      if (allowed) {
        const { error } = await supabase
          .from("system_settings")
          .update({
            value: desiredBan,
            updated_at: new Date().toISOString(),
            updated_by: "COMPLIANCE_MONITOR",
          })
          .eq("key", "short_sell_globally_banned");
        if (error) throw error;
        applied.push(`Genel açığa satış yasağı: ${currentBan} → ${desiredBan}`);
      } else {
        skipped.push(
          `Genel yasak değişikliği (${currentBan} → ${desiredBan}) confidence=${confidence} nedeniyle UYGULANMADI — manuel kontrol gerekli`
        );
      }
    }

    // 2b) Yeni VBTS exclusion'ları (kısıtlayıcı: medium+)
    for (const ex of report.newExclusions ?? []) {
      const sym = String(ex.symbol ?? "").trim().toUpperCase();
      const from = ex.from ? new Date(ex.from) : null;
      const until = ex.until ? new Date(ex.until) : null;

      if (!sym || !from || !until || isNaN(from.getTime()) || isNaN(until.getTime())) {
        skipped.push(`Geçersiz exclusion kaydı atlandı: ${JSON.stringify(ex)}`);
        continue;
      }
      if (confidence === "low") {
        skipped.push(`Exclusion ${sym} confidence=low nedeniyle uygulanmadı`);
        continue;
      }

      // Dedup: aynı symbol + excluded_from zaten varsa atla
      const { data: dup } = await supabase
        .from("short_sell_temp_exclusions")
        .select("symbol")
        .eq("symbol", sym)
        .eq("excluded_from", from.toISOString())
        .limit(1)
        .maybeSingle();
      if (dup) continue;

      const { error } = await supabase.from("short_sell_temp_exclusions").insert({
        symbol: sym,
        excluded_from: from.toISOString(),
        excluded_until: until.toISOString(),
        reason: ex.reason ?? "VBTS (compliance-monitor)",
      });
      if (error) {
        skipped.push(`Exclusion ${sym} insert hatası: ${error.message}`);
      } else {
        applied.push(`Yeni VBTS yasağı: ${sym} (${ex.from} → ${ex.until})`);
      }
    }

    // 2c) BIST 50 değişiklikleri
    if (report.bist50Changes) {
      // Ekleme serbestleştirici → yalnız high
      for (const sym of report.bist50Changes.added ?? []) {
        const s = String(sym).trim().toUpperCase();
        if (!s) continue;
        if (confidence !== "high") {
          skipped.push(`BIST50 ekleme ${s} confidence=${confidence} nedeniyle uygulanmadı`);
          continue;
        }
        const { error } = await supabase
          .from("short_sell_eligible_symbols")
          .upsert({ symbol: s, source: "COMPLIANCE_MONITOR" }, { onConflict: "symbol", ignoreDuplicates: true });
        if (!error) applied.push(`BIST50'ye eklendi (short uygun): ${s}`);
      }
      // Çıkarma kısıtlayıcı → medium+
      for (const sym of report.bist50Changes.removed ?? []) {
        const s = String(sym).trim().toUpperCase();
        if (!s) continue;
        if (confidence === "low") {
          skipped.push(`BIST50 çıkarma ${s} confidence=low nedeniyle uygulanmadı`);
          continue;
        }
        const { error } = await supabase
          .from("short_sell_eligible_symbols")
          .delete()
          .eq("symbol", s);
        if (!error) applied.push(`BIST50'den çıkarıldı (short yasak): ${s}`);
      }
    }

    // 3) Telegram — yalnızca değişiklik/uyarı varsa
    if (applied.length > 0 || skipped.length > 0 || confidence === "low") {
      const lines = ["⚖️ UYUMLULUK TARAMASI", `Güven: ${confidence.toUpperCase()}`];
      if (applied.length > 0) {
        lines.push("", "✅ Uygulanan:");
        applied.forEach((a) => lines.push(`• ${a}`));
      }
      if (skipped.length > 0) {
        lines.push("", "⏭ Atlanan / manuel kontrol:");
        skipped.forEach((s) => lines.push(`• ${s}`));
      }
      if (confidence === "low" && applied.length === 0 && skipped.length === 0) {
        lines.push("", "⚠️ Düşük güvenli sonuç — hiçbir değişiklik uygulanmadı, manuel kontrol önerilir.");
      }
      if (report.sourcesChecked) {
        lines.push("", `Kaynaklar: ${String(report.sourcesChecked).slice(0, 300)}`);
      }
      await sendTelegramMessage(lines.join("\n"));
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      confidence,
      report,
      applied,
      skipped,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("COMPLIANCE_MONITOR_ERROR", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
