import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { executeAiDecision } from "@/lib/execution";
import { answerTelegramCallback, editTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
// Opsiyonel savunma katmanı: setWebhook'ta secret_token verildiyse Telegram
// her isteğe X-Telegram-Bot-Api-Secret-Token header'ı ekler ve burada doğrulanır.
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function POST(req: NextRequest) {
  try {
    if (TELEGRAM_WEBHOOK_SECRET) {
      const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
      if (headerSecret !== TELEGRAM_WEBHOOK_SECRET) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }

    const update = await req.json().catch(() => null);
    const cb = update?.callback_query;

    // callback_query dışındaki update'ler (normal mesajlar vb.) yok sayılır.
    // Telegram retry yapmasın diye 200 dönmek gerekir.
    if (!cb) return NextResponse.json({ ok: true, ignored: true });

    // Güvenlik: sadece bizim chat'ten gelen callback'ler kabul edilir
    const chatId = String(cb.message?.chat?.id ?? "");
    if (!TELEGRAM_CHAT_ID || chatId !== String(TELEGRAM_CHAT_ID)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const [action, decisionId] = String(cb.data ?? "").split(":");
    if (!decisionId || (action !== "approve" && action !== "reject")) {
      await answerTelegramCallback(cb.id, "Geçersiz komut");
      return NextResponse.json({ ok: true });
    }

    const { data: decision } = await supabase
      .from("ai_decisions")
      .select("*")
      .eq("id", decisionId)
      .maybeSingle();

    if (!decision) {
      await answerTelegramCallback(cb.id, "Karar bulunamadı");
      return NextResponse.json({ ok: true });
    }

    if (decision.status !== "PENDING") {
      await answerTelegramCallback(cb.id, `Bu karar zaten sonuçlandı: ${decision.status}`);
      return NextResponse.json({ ok: true });
    }

    const messageId: number | undefined = cb.message?.message_id;
    const originalText: string = cb.message?.text ?? "";

    if (action === "reject") {
      await supabase
        .from("ai_decisions")
        .update({ status: "REJECTED" })
        .eq("id", decisionId);

      await answerTelegramCallback(cb.id, "❌ Reddedildi");
      if (messageId) {
        await editTelegramMessage(chatId, messageId, `${originalText}\n\n❌ REDDEDİLDİ`);
      }
      return NextResponse.json({ ok: true, result: "REJECTED" });
    }

    // approve — kararı uygula
    const result = await executeAiDecision(decision, "APPROVED");

    if (result.ok) {
      await supabase
        .from("ai_decisions")
        .update({
          status: "APPROVED",
          executed: true,
          executed_at: new Date().toISOString(),
        })
        .eq("id", decisionId);

      await answerTelegramCallback(cb.id, "✅ Onaylandı, uygulandı");
      if (messageId) {
        await editTelegramMessage(chatId, messageId, `${originalText}\n\n✅ ONAYLANDI\n${result.message}`);
      }
      return NextResponse.json({ ok: true, result: "APPROVED", message: result.message });
    }

    // Onaylandı ama uygulanamadı (pozisyon kapanmış, fiyat yok vb.) → EXPIRED
    await supabase
      .from("ai_decisions")
      .update({ status: "EXPIRED" })
      .eq("id", decisionId);

    await answerTelegramCallback(cb.id, `⚠️ Uygulanamadı: ${result.message}`);
    if (messageId) {
      await editTelegramMessage(chatId, messageId, `${originalText}\n\n⚠️ UYGULANAMADI: ${result.message}`);
    }
    return NextResponse.json({ ok: true, result: "EXPIRED", message: result.message });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("TELEGRAM_WEBHOOK_ERROR", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
