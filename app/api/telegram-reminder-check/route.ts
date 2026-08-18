import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { executeAiDecision } from "@/lib/execution";
import { isSessionOpenNow } from "@/lib/marketStatus";
import {
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
  editTelegramMessage,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MONITOR_SECRET = process.env.RISK_MONITOR_SECRET ?? "ema100_secret_2026";

// Onay akışı zamanlaması
const REMINDER_AFTER_MS = 5 * 60_000;      // 5 dk yanıt yoksa hatırlat
const AUTO_EXECUTE_AFTER_MS = 10 * 60_000; // 10 dk yanıt yoksa (geçerliyse) uygula
// RECOMMEND_OPEN otomatik uygulanmadan önce fiyat sapma toleransı
const AUTO_EXEC_PRICE_TOLERANCE_PCT = 5;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function GET(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const nowMs = Date.now();

    const { data: pending, error } = await supabase
      .from("ai_decisions")
      .select("*")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true });

    if (error) throw error;

    const reminded: string[] = [];
    const autoExecuted: string[] = [];
    const expired: string[] = [];

    for (const d of pending ?? []) {
      const ageMs = nowMs - new Date(d.created_at).getTime();

      // ---------------------------------------------------------------
      // 10+ dk: hatırlatma da yanıtsız kaldıysa geçerlilik kontrolü yap,
      // uygunsa otomatik uygula
      // ---------------------------------------------------------------
      if (ageMs >= AUTO_EXECUTE_AFTER_MS && d.reminder_sent_at) {
        // CHAT İSTİSNASI: chat kaynaklı (details.origin=CHAT_CONVERSATION)
        // kararlar süre dolunca ASLA otomatik uygulanmaz — EXPIRED olur,
        // kullanıcı bilgilendirilir. Diğer origin'ler (URGENT_SCAN, agent
        // akışı vb.) için auto-execute davranışı AYNEN devam eder.
        if (d.details?.origin === "CHAT_CONVERSATION") {
          await supabase.from("ai_decisions").update({ status: "EXPIRED" }).eq("id", d.id);
          await sendTelegramMessage(
            `⌛ ${d.symbol} için chat kaynaklı öneri süresi doldu, onaylanmadığı için uygulanmadı — tekrar istersen yeniden yaz.`
          );
          await clearApprovalButtons(
            d,
            "⌛ SÜRESİ DOLDU — chat kaynaklı öneri onaylanmadığı için uygulanmadı"
          );
          expired.push(`${d.decision_type}:${d.symbol}`);
          continue;
        }

        const validity = await isStillValid(d);

        if (!validity.ok) {
          await supabase.from("ai_decisions").update({ status: "EXPIRED" }).eq("id", d.id);
          await sendTelegramMessage(
            `⌛ SÜRESİ DOLDU\n${d.decision_type}: ${d.symbol}\nOtomatik uygulanmadı: ${validity.reason}`
          );
          await clearApprovalButtons(d, `⌛ SÜRESİ DOLDU — ${validity.reason}`);
          expired.push(`${d.decision_type}:${d.symbol}`);
          continue;
        }

        // SEANS-SAATİ KAPISI: borsa kapalıyken otomatik-yürütme YAPMA. Süre-dolumu
        // (EXPIRED) değil ERTELEME — kararı PENDING bırak, seans açılınca sonraki
        // cron uygular. (Otomatik-yürütme yalnız chat-dışı akışlarda zaten.)
        const sess = await isSessionOpenNow();
        if (!sess.open) {
          continue;
        }

        const result = await executeAiDecision(d, "AUTO_EXECUTED");

        if (result.ok) {
          await supabase
            .from("ai_decisions")
            .update({
              status: "AUTO_EXECUTED",
              executed: true,
              executed_at: new Date().toISOString(),
            })
            .eq("id", d.id);

          await sendTelegramMessage(
            `⏰ Onay gelmedi, karar otomatik uygulandı\n${d.decision_type}: ${d.symbol}\n${result.message}`
          );
          await clearApprovalButtons(d, `⏰ OTOMATİK UYGULANDI\n${result.message}`);
          autoExecuted.push(`${d.decision_type}:${d.symbol}`);
        } else {
          await supabase.from("ai_decisions").update({ status: "EXPIRED" }).eq("id", d.id);
          await sendTelegramMessage(
            `⌛ SÜRESİ DOLDU\n${d.decision_type}: ${d.symbol}\nUygulanamadı: ${result.message}`
          );
          await clearApprovalButtons(d, `⌛ SÜRESİ DOLDU — ${result.message}`);
          expired.push(`${d.decision_type}:${d.symbol}`);
        }
        continue;
      }

      // ---------------------------------------------------------------
      // 5+ dk: henüz hatırlatılmadıysa aynı butonlarla hatırlat
      // ---------------------------------------------------------------
      if (ageMs >= REMINDER_AFTER_MS && !d.reminder_sent_at) {
        const lines = [
          "⏰ HATIRLATMA — ONAY BEKLEYEN KARAR",
          `${d.decision_type}: ${d.symbol}`,
          `Sebep: ${d.reason ?? "-"}`,
        ];
        if (d.suggested_side) {
          lines.push(`Öneri: ${d.suggested_side} ${d.suggested_qty ?? "?"} lot @ ${d.suggested_price ?? "?"}`);
        }
        lines.push("");
        lines.push("5 dk içinde yanıt gelmezse karar hâlâ geçerliyse otomatik uygulanacak.");

        await sendTelegramMessageWithButtons(lines.join("\n"), [[
          { text: "✅ Onayla", callback_data: `approve:${d.id}` },
          { text: "❌ Reddet", callback_data: `reject:${d.id}` },
        ]]);

        await supabase
          .from("ai_decisions")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", d.id);

        reminded.push(`${d.decision_type}:${d.symbol}`);
      }
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      pendingCount: pending?.length ?? 0,
      reminded,
      autoExecuted,
      expired,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("REMINDER_CHECK_ERROR", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Karar hâlâ geçerli mi? (otomatik uygulama öncesi basit tutarlılık kontrolü)
// ---------------------------------------------------------------------------

async function isStillValid(d: any): Promise<{ ok: boolean; reason?: string }> {
  const type = String(d.decision_type ?? "").toUpperCase();

  if (type === "CLOSE" || type === "REDUCE" || type === "SWAP") {
    const { data: pos } = await supabase
      .from("positions")
      .select("id")
      .eq("symbol", d.symbol)
      .eq("status", "OPEN")
      .limit(1)
      .maybeSingle();

    if (!pos) return { ok: false, reason: "Pozisyon artık açık değil" };
    return { ok: true };
  }

  if (type === "RECOMMEND_OPEN") {
    const { data: live } = await supabase
      .from("live_prices")
      .select("last_price")
      .eq("symbol", d.symbol)
      .maybeSingle();

    const price = Number(live?.last_price);
    if (!Number.isFinite(price) || price <= 0) {
      return { ok: false, reason: "Canlı fiyat bulunamadı" };
    }

    const ref = Number(d.suggested_price);
    if (Number.isFinite(ref) && ref > 0) {
      const movePct = Math.abs((price - ref) / ref) * 100;
      if (movePct > AUTO_EXEC_PRICE_TOLERANCE_PCT) {
        return {
          ok: false,
          reason: `Fiyat karar anından %${movePct.toFixed(1)} saptı (limit %${AUTO_EXEC_PRICE_TOLERANCE_PCT})`,
        };
      }
    }
    return { ok: true };
  }

  return { ok: false, reason: `Bilinmeyen karar tipi: ${type}` };
}

// Orijinal onay mesajının butonlarını kaldır (sonuç metniyle değiştirerek).
// Hatırlatma mesajının butonları takip edilmiyor; tıklanırsa telegram-webhook
// status !== PENDING kontrolüyle "zaten sonuçlandı" cevabı verir.
async function clearApprovalButtons(d: any, resultText: string) {
  if (d.telegram_chat_id && d.telegram_message_id) {
    await editTelegramMessage(
      d.telegram_chat_id,
      Number(d.telegram_message_id),
      `🔔 ONAY BEKLEYEN KARAR\n${d.decision_type}: ${d.symbol}\nSebep: ${d.reason ?? "-"}\n\n${resultText}`
    );
  }
}
