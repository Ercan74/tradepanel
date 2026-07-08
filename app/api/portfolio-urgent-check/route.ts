import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessageWithButtons } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Analiz (Claude çağrısı) ~15-20 sn sürer; self-fetch + DB işlemleri için pay bırak
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MONITOR_SECRET = process.env.RISK_MONITOR_SECRET ?? "ema100_secret_2026";

// ---------------------------------------------------------------------------
// Ayar sabitleri
// ---------------------------------------------------------------------------

// Piyasa saatleri (TR): hafta içi 10:00–18:00. Türkiye kalıcı UTC+3'te
// olduğundan DST kayması yoktur; kontrol yine de Intl/Europe-Istanbul ile
// yapılır. Bu, vercel.json'daki UTC cron aralığından ("*/15 7-14 * * 1-5"
// = TR 10:00–17:45) bağımsız İKİNCİ bir güvenlik katmanıdır — cron veya
// timezone yanlış ayarlansa bile piyasa kapalıyken Claude çağrılmaz.
const MARKET_OPEN_MINUTES = 10 * 60;   // 10:00 TR (dahil)
const MARKET_CLOSE_MINUTES = 18 * 60;  // 18:00 TR (hariç)

// Dedup penceresi: aynı symbol+type için bu süre içinde PENDING kayıt
// varsa yeni acil bildirim üretilmez
const DEDUP_WINDOW_MINUTES = 60;

// Acil aksiyon sayılan karar tipleri
const URGENT_TYPES = ["CLOSE", "REDUCE", "SWAP"];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// TR piyasa saati kontrolü
// ---------------------------------------------------------------------------

function marketStatusTR(): { open: boolean; label: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Istanbul",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );

  const weekday = String(parts.weekday); // Mon..Sun
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const open =
    isWeekday && minutes >= MARKET_OPEN_MINUTES && minutes < MARKET_CLOSE_MINUTES;

  return { open, label: `${weekday} ${parts.hour}:${parts.minute} (TR)` };
}

// ---------------------------------------------------------------------------
// GET — otomatik acil aksiyon taraması (cron)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // İLK İŞ: piyasa kapalıysa Claude'u hiç çağırmadan çık
  const market = marketStatusTR();
  if (!market.open) {
    return NextResponse.json({
      ok: true,
      marketOpen: false,
      now: market.label,
      skipped: "Piyasa kapalı — analiz çalıştırılmadı, maliyet oluşmadı",
    });
  }

  try {
    // Analizi portfolio-ai-agent'ın reportOnly modu üzerinden çalıştır:
    // kararlar üretilir ama o uç kendi başına hiçbir yan etki yaratmaz —
    // acil olanların kaydı/bildirimi aşağıda BU route tarafından yapılır.
    const origin = req.nextUrl.origin;
    const res = await fetch(
      `${origin}/api/portfolio-ai-agent?secret=${MONITOR_SECRET}&reportOnly=1`,
      { cache: "no-store" }
    );
    const analysis = await res.json().catch(() => null);
    if (!analysis?.ok) {
      throw new Error(`Analiz başarısız: ${analysis?.error ?? `HTTP ${res.status}`}`);
    }

    const decisions: any[] = analysis.decisions ?? [];
    const urgent = decisions.filter(
      (d) => d.urgency === "HIGH" && URGENT_TYPES.includes(d.type)
    );

    let skippedDedup = 0;
    let skippedNoPosition = 0;
    const created: string[] = [];

    const sinceIso = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60_000).toISOString();

    for (const d of urgent) {
      // Dedup: aynı symbol+type için son 60 dk'da PENDING kayıt varsa atla
      const { data: dup } = await supabase
        .from("ai_decisions")
        .select("id")
        .eq("symbol", d.symbol)
        .eq("decision_type", d.type)
        .eq("status", "PENDING")
        .gte("created_at", sinceIso)
        .limit(1)
        .maybeSingle();

      if (dup) {
        skippedDedup++;
        continue;
      }

      // suggested_* alanları için açık pozisyon + canlı fiyat
      const { data: pos } = await supabase
        .from("positions")
        .select("side,current_price,remaining_quantity")
        .eq("symbol", d.symbol)
        .eq("status", "OPEN")
        .limit(1)
        .maybeSingle();

      if (!pos) {
        // CLOSE/REDUCE/SWAP için açık pozisyon şart — yoksa uygulanamaz
        skippedNoPosition++;
        continue;
      }

      const { data: live } = await supabase
        .from("live_prices")
        .select("last_price")
        .eq("symbol", d.symbol)
        .maybeSingle();

      const suggestedPrice =
        Number(live?.last_price) > 0 ? Number(live?.last_price) : pos.current_price;

      const { data: inserted, error: insErr } = await supabase
        .from("ai_decisions")
        .insert({
          decision_type: d.type,
          symbol: d.symbol,
          reason: d.reason,
          details: { detail: d.details, urgency: d.urgency, source: "URGENT_SCAN" },
          portfolio_context: analysis.portfolioSnapshot ?? null,
          executed: false,
          status: "PENDING",
          suggested_side: pos.side,
          suggested_price: suggestedPrice,
          suggested_qty: pos.remaining_quantity,
        })
        .select("id")
        .single();

      if (insErr || !inserted) {
        console.error("URGENT_INSERT_ERROR", insErr?.message);
        continue;
      }

      const lines = [
        "🚨 ACİL AKSİYON — OTOMATİK TARAMA",
        `🔴 ${d.type}: ${d.symbol}`,
        `Sebep: ${d.reason}`,
        `Öneri: ${pos.side} ${pos.remaining_quantity} lot @ ${suggestedPrice}`,
        "",
        "⏱ 5 dk içinde yanıt yoksa hatırlatılır, 10 dk sonra hâlâ geçerliyse otomatik uygulanır.",
      ];

      const sent = await sendTelegramMessageWithButtons(lines.join("\n"), [[
        { text: "✅ Onayla", callback_data: `approve:${inserted.id}` },
        { text: "❌ Reddet", callback_data: `reject:${inserted.id}` },
      ]]);

      if (sent.messageId) {
        await supabase
          .from("ai_decisions")
          .update({
            telegram_message_id: sent.messageId,
            telegram_chat_id: sent.chatId,
          })
          .eq("id", inserted.id);
      }

      created.push(`${d.type}:${d.symbol}`);
    }

    return NextResponse.json({
      ok: true,
      marketOpen: true,
      now: market.label,
      checkedAt: new Date().toISOString(),
      openPositions: analysis.portfolioSnapshot?.openPositions ?? null,
      analyzedDecisions: decisions.length,
      urgentFound: urgent.length,
      skippedDedup,
      skippedNoPosition,
      created,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("URGENT_CHECK_ERROR", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
