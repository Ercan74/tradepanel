export async function sendTelegramMessage(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("Telegram config missing");
    return;
  }

  try {
    await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
        }),
      }
    );
  } catch (error) {
    console.error("Telegram error:", error);
  }
}

export type InlineKeyboardButton = { text: string; callback_data: string };

/**
 * Inline keyboard'lu mesaj gönderir; başarılıysa Telegram'ın verdiği
 * message_id'yi döner (onay akışında ai_decisions.telegram_message_id
 * alanına yazılır).
 */
export async function sendTelegramMessageWithButtons(
  message: string,
  inlineKeyboard: InlineKeyboardButton[][]
): Promise<{ messageId: number | null; chatId: string | null }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("Telegram config missing");
    return { messageId: null, chatId: null };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: inlineKeyboard },
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      console.error("Telegram send with buttons failed:", JSON.stringify(json));
      return { messageId: null, chatId };
    }

    return { messageId: json.result?.message_id ?? null, chatId };
  } catch (error) {
    console.error("Telegram error:", error);
    return { messageId: null, chatId };
  }
}

/** Buton tıklamasına toast/bildirim cevabı (answerCallbackQuery). */
export async function answerTelegramCallback(callbackQueryId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text.slice(0, 200),
      }),
    });
  } catch (error) {
    console.error("Telegram answerCallbackQuery error:", error);
  }
}

/**
 * Mevcut mesajın metnini günceller. reply_markup gönderilmediği için
 * inline keyboard da kaldırılır — butonlar tekrar tıklanamaz.
 */
export async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  text: string
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch (error) {
    console.error("Telegram editMessageText error:", error);
  }
}
