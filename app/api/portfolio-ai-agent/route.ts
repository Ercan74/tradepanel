import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ACCOUNT_CAPITAL = Number(process.env.ACCOUNT_CAPITAL ?? 100_000);
const MAX_OPEN_POSITIONS = Number(process.env.MAX_OPEN_POSITIONS ?? 10);
const MONITOR_SECRET = process.env.RISK_MONITOR_SECRET ?? "ema100_secret_2026";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// GET — AI agent çalıştır
// POST — Kullanıcı ile sohbet (chat modu)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ??
    req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return runAgent();
}

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ??
    req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const userMessage = body.message as string;
  const chatHistory = body.history as { role: string; content: string }[] ?? [];

  if (!userMessage) {
    return NextResponse.json({ ok: false, error: "message gerekli" }, { status: 400 });
  }

  return runChat(userMessage, chatHistory);
}

// ---------------------------------------------------------------------------
// Veri çekme
// ---------------------------------------------------------------------------

async function fetchPortfolioData() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [positionsRes, liveRes, goalsRes, closedRes] = await Promise.all([
    supabase.from("positions").select("*").eq("status", "OPEN"),
    supabase.from("live_prices").select("symbol,last_price,rsi,ema20,ema50,ema100,atr,lrs,macd_div,stoc_rsi,aroon_up,aroon_down,elder_force_index"),
    supabase.from("portfolio_goals").select("*").eq("year", year).eq("month", month).single(),
    supabase.from("positions").select("pnl_amount,close_reason,closed_at").eq("status", "CLOSED").gte("closed_at", `${year}-${String(month).padStart(2, "0")}-01`),
  ]);

  const positions = positionsRes.data ?? [];
  const livePrices = liveRes.data ?? [];
  const goal = goalsRes.data;
  const closedThisMonth = closedRes.data ?? [];

  const liveMap = new Map(livePrices.map((l: any) => [l.symbol, l]));

  // Aylık realized PnL
  const realizedPnl = closedThisMonth.reduce((sum: number, p: any) => sum + (p.pnl_amount ?? 0), 0);

  // Unrealized PnL
  const unrealizedPnl = positions.reduce((sum: number, p: any) => {
    const live = liveMap.get(p.symbol);
    const current = live?.last_price ?? p.current_price ?? p.entry_price;
    const pnl = p.side === "LONG"
      ? (current - p.entry_price) * p.remaining_quantity
      : (p.entry_price - current) * p.remaining_quantity;
    return sum + pnl;
  }, 0);

  // Pozisyonları zenginleştir
  const enrichedPositions = positions.map((p: any) => {
    const live = liveMap.get(p.symbol);
    const current = live?.last_price ?? p.current_price ?? p.entry_price;
    const pnlPct = p.side === "LONG"
      ? ((current - p.entry_price) / p.entry_price) * 100
      : ((p.entry_price - current) / p.entry_price) * 100;
    const daysOpen = Math.floor((Date.now() - new Date(p.opened_at).getTime()) / (1000 * 60 * 60 * 24));

    return {
      symbol: p.symbol,
      side: p.side,
      sector: p.sector,
      entryPrice: p.entry_price,
      currentPrice: current,
      pnlPct: Math.round(pnlPct * 100) / 100,
      pnlAmount: Math.round((current - p.entry_price) * p.remaining_quantity * (p.side === "LONG" ? 1 : -1) * 100) / 100,
      allocatedAmount: p.allocated_amount,
      remainingQuantity: p.remaining_quantity,
      daysOpen,
      stopPrice: p.stop_price ?? p.sl_price,
      tp1Price: p.tp1_price,
      tp1Hit: p.tp1_hit,
      trailingStage: p.trailing_stage,
      rsi: live?.rsi,
      ema100: live?.ema100,
      ema20: live?.ema20,
      ema50: live?.ema50,
      atr: live?.atr,
      lrs: live?.lrs,
      macdDiv: live?.macd_div,
      stocRsi: live?.stoc_rsi,
      aroonUp: live?.aroon_up,
      aroonDown: live?.aroon_down,
      elderForce: live?.elder_force_index,
    };
  });

  // Sektör dağılımı
  const sectorMap = new Map<string, number>();
  enrichedPositions.forEach(p => {
    const s = p.sector ?? "DİĞER";
    sectorMap.set(s, (sectorMap.get(s) ?? 0) + (p.allocatedAmount ?? 0));
  });
  const totalAllocated = enrichedPositions.reduce((s, p) => s + (p.allocatedAmount ?? 0), 0);
  const sectorExposure = Array.from(sectorMap.entries()).map(([sector, amount]) => ({
    sector,
    pct: Math.round((amount / ACCOUNT_CAPITAL) * 100 * 100) / 100,
  }));

  // Hedef durumu
  const startingCapital = goal?.starting_capital ?? ACCOUNT_CAPITAL;
  const realizedTargetPct = goal?.realized_target_pct ?? 20;
  const totalTargetPct = goal?.total_target_pct ?? 30;
  const realizedTargetAmount = startingCapital * (realizedTargetPct / 100);
  const totalTargetAmount = startingCapital * (totalTargetPct / 100);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const daysRemaining = daysInMonth - daysElapsed;
  const monthProgress = daysElapsed / daysInMonth;

  return {
    positions: enrichedPositions,
    sectorExposure,
    totalAllocated: Math.round(totalAllocated * 100) / 100,
    availableCapital: Math.round((ACCOUNT_CAPITAL - totalAllocated) * 100) / 100,
    availableSlots: MAX_OPEN_POSITIONS - positions.length,
    realizedPnl: Math.round(realizedPnl * 100) / 100,
    unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
    totalPnl: Math.round((realizedPnl + unrealizedPnl) * 100) / 100,
    goal: {
      realizedTarget: realizedTargetAmount,
      realizedTargetPct,
      totalTarget: totalTargetAmount,
      totalTargetPct,
      maxDrawdownPct: goal?.max_drawdown_pct ?? 5,
      dailyMaxDrawdownPct: goal?.daily_max_drawdown_pct ?? 1,
      maxSectorExposurePct: goal?.max_sector_exposure_pct ?? 25,
    },
    monthInfo: {
      year,
      month,
      daysElapsed,
      daysRemaining,
      monthProgress: Math.round(monthProgress * 100),
    },
    closedThisMonth: closedThisMonth.length,
    accountCapital: ACCOUNT_CAPITAL,
    maxPositions: MAX_OPEN_POSITIONS,
  };
}

// ---------------------------------------------------------------------------
// Sistem promptu
// ---------------------------------------------------------------------------

function buildSystemPrompt(data: any): string {
  return `Sen TIOS'un (Trading Intelligence & Operations System) yapay zeka destekli portföy yöneticisisin.

GÖREV:
Kullanıcının BIST portföyünü profesyonel bir fon yöneticisi gibi yönetmek.
Kararlarını Supabase'e yaz, Telegram'a bildir.
Kullanıcı sadece aylık hedefi belirler ve sonuçları izler.

PORTFÖY DURUMU (${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}):

AÇIK POZİSYONLAR (${data.positions.length}/${data.maxPositions}):
${data.positions.map((p: any) => `
  ${p.symbol} | ${p.side} | Giriş: ${p.entryPrice} | Güncel: ${p.currentPrice} | PnL: %${p.pnlPct} (${p.pnlAmount} TL)
  Gün: ${p.daysOpen} | Stop: ${p.stopPrice} | TP1: ${p.tp1Price} | Stage: ${p.trailingStage}
  RSI: ${p.rsi?.toFixed(1) ?? "?"} | EMA100: ${p.ema100?.toFixed(2) ?? "?"} | MACD: ${p.macdDiv?.toFixed(4) ?? "?"} | Aroon↑: ${p.aroonUp?.toFixed(0) ?? "?"} | Aroon↓: ${p.aroonDown?.toFixed(0) ?? "?"}
  LRS: ${p.lrs?.toFixed(3) ?? "?"} | ATR: ${p.atr?.toFixed(3) ?? "?"} | StocRSI: ${p.stocRsi?.toFixed(1) ?? "?"} | Elder Force: ${p.elderForce?.toFixed(0) ?? "?"}
`).join("")}

SEKTÖR DAĞILIMI:
${data.sectorExposure.map((s: any) => `  ${s.sector}: %${s.pct}`).join("\n")}

SERMAYE:
  Toplam: ${data.accountCapital.toLocaleString("tr-TR")} TL
  Kullanılan: ${data.totalAllocated.toLocaleString("tr-TR")} TL
  Boş: ${data.availableCapital.toLocaleString("tr-TR")} TL
  Boş Slot: ${data.availableSlots}

AYLIK PERFORMANS (${data.monthInfo.daysElapsed}. gün, ${data.monthInfo.daysRemaining} gün kaldı):
  Realized PnL: ${data.realizedPnl.toLocaleString("tr-TR")} TL / Hedef: ${data.goal.realizedTarget.toLocaleString("tr-TR")} TL (%${data.goal.realizedTargetPct})
  Toplam PnL: ${data.totalPnl.toLocaleString("tr-TR")} TL / Hedef: ${data.goal.totalTarget.toLocaleString("tr-TR")} TL (%${data.goal.totalTargetPct})
  Bu ay kapanan: ${data.closedThisMonth} işlem
  Ay ilerlemesi: %${data.monthInfo.monthProgress}

HEDEF VE LİMİTLER:
  Aylık realized hedef: %${data.goal.realizedTargetPct}
  Aylık toplam hedef: %${data.goal.totalTargetPct}
  Max drawdown: %${data.goal.maxDrawdownPct}
  Günlük max drawdown: %${data.goal.dailyMaxDrawdownPct}
  Max sektör exposure: %${data.goal.maxSectorExposurePct}

KARAR YETKİLERİN:
- Pozisyon KAPAT (stop veya hedef dışı, momentum düşüşü)
- Pozisyon AZALT (kısmi satış)
- Yeni pozisyon ÖNERİ (sadece öneri, bağlantı açma yok)
- HOLD (bekle, izle)
- Hedging önerisi (SHORT pozisyon önerisi)

ÇIKTI KURALLARI:
Yanıtın SADECE geçerli JSON olmalı. Kod bloğu (\`\`\`) kullanma.
JSON dışında hiçbir metin, açıklama veya giriş cümlesi ekleme.
Yanıtın ilk karakteri { ve son karakteri } olmalı.

KARAR FORMATI:
Her kararını şu JSON formatında ver:
{
  "decisions": [
    {
      "type": "CLOSE|REDUCE|RECOMMEND_OPEN|HOLD|HEDGE",
      "symbol": "SEMBOL",
      "reason": "kısa sebep",
      "details": "detaylı açıklama",
      "urgency": "HIGH|MEDIUM|LOW"
    }
  ],
  "summary": "genel portföy değerlendirmesi",
  "monthlyOutlook": "aylık hedefe ulaşma tahmini"
}

TÜRKÇE konuş. Profesyonel ama anlaşılır ol. Gereksiz teknik jargondan kaçın.
Sadece gerçek veriye dayan, tahmin üretme.`;
}

// ---------------------------------------------------------------------------
// Agent modu — günlük analiz
// ---------------------------------------------------------------------------

async function runAgent() {
  try {
    const data = await fetchPortfolioData();
    const systemPrompt = buildSystemPrompt(data);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: "Portföyü analiz et ve gerekli kararları ver. JSON formatında yanıt ver."
      }]
    });

    if (response.stop_reason === "max_tokens") {
      console.warn("AI_AGENT_TRUNCATED: yanıt max_tokens sınırında kesildi, JSON parse başarısız olabilir");
    }

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";

    // JSON parse
    let parsed: any = null;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("AI_AGENT_PARSE_ERROR", rawText.slice(0, 200));
      parsed = {
        decisions: [],
        summary: "Rapor oluşturulamadı — model çıktısı işlenemedi, bir sonraki çalışmada tekrar denenecek.",
        monthlyOutlook: "",
      };
    }

    const decisions = parsed?.decisions ?? [];

    // Supabase'e kaydet
    if (decisions.length > 0) {
      await supabase.from("ai_decisions").insert(
        decisions.map((d: any) => ({
          decision_type: d.type,
          symbol: d.symbol,
          reason: d.reason,
          details: { detail: d.details, urgency: d.urgency },
          portfolio_context: {
            realizedPnl: data.realizedPnl,
            totalPnl: data.totalPnl,
            monthProgress: data.monthInfo.monthProgress,
          },
          executed: false,
        }))
      );
    }

    // Pozisyonları güncelle — CLOSE kararları
    for (const d of decisions) {
      if (d.type === "CLOSE") {
        const pos = data.positions.find((p: any) => p.symbol === d.symbol);
        if (pos) {
          await supabase
            .from("positions")
            .update({
              status: "CLOSED",
              close_reason: `AI_DECISION: ${d.reason}`,
              closed_at: new Date().toISOString(),
              last_event_at: new Date().toISOString(),
            })
            .eq("symbol", d.symbol)
            .eq("status", "OPEN");
        }
      }

      if (d.type === "REDUCE") {
        await supabase
          .from("positions")
          .update({
            risk_state: "AI_REDUCE_FLAGGED",
            last_event_at: new Date().toISOString(),
          })
          .eq("symbol", d.symbol)
          .eq("status", "OPEN");
      }
    }

    // Telegram bildirimi
    await sendTelegramAgentReport(decisions, parsed?.summary, parsed?.monthlyOutlook, data);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      decisions,
      summary: parsed?.summary,
      monthlyOutlook: parsed?.monthlyOutlook,
      portfolioSnapshot: {
        openPositions: data.positions.length,
        realizedPnl: data.realizedPnl,
        totalPnl: data.totalPnl,
        monthProgress: data.monthInfo.monthProgress,
      }
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("AI_AGENT_ERROR", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Chat modu — kullanıcı ile sohbet
// ---------------------------------------------------------------------------

async function runChat(userMessage: string, chatHistory: { role: string; content: string }[]) {
  try {
    const data = await fetchPortfolioData();
    const systemPrompt = buildSystemPrompt(data);

    const messages = [
      ...chatHistory.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user" as const, content: userMessage }
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({
      ok: true,
      reply,
      updatedHistory: [
        ...chatHistory,
        { role: "user", content: userMessage },
        { role: "assistant", content: reply },
      ]
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

function sanitizeSummary(text: string): string {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

async function sendTelegramAgentReport(decisions: any[], summary: string, outlook: string, data: any) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const lines: string[] = [];
  lines.push("🤖 AI PORTFÖY YÖNETİCİSİ");
  lines.push(`📅 ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`);
  lines.push("");

  // Performans özeti
  lines.push(`📊 Ay ${data.monthInfo.daysElapsed}. gün (%${data.monthInfo.monthProgress})`);
  lines.push(`Realized: ${data.realizedPnl.toLocaleString("tr-TR")} ₺ / Hedef: ${data.goal.realizedTarget.toLocaleString("tr-TR")} ₺`);
  lines.push(`Toplam: ${data.totalPnl.toLocaleString("tr-TR")} ₺`);
  lines.push("");

  if (decisions.length === 0) {
    lines.push("✅ Aksiyon gerektiren durum yok.");
  } else {
    for (const d of decisions) {
      const emoji = d.type === "CLOSE" ? "🔴" : d.type === "REDUCE" ? "🟡" : d.type === "RECOMMEND_OPEN" ? "🟢" : d.type === "HEDGE" ? "🔵" : "⚪";
      lines.push(`${emoji} ${d.type}: ${d.symbol}`);
      lines.push(`   ${d.reason}`);
      if (d.urgency === "HIGH") lines.push(`   ⚠️ ACİL`);
      lines.push("");
    }
  }

  if (summary) {
    lines.push("📝 GENEL DEĞERLENDİRME");
    lines.push(sanitizeSummary(summary).slice(0, 400));
    lines.push("");
  }

  if (outlook) {
    lines.push("🎯 AYLIK HEDEF TAHMİNİ");
    lines.push(outlook.slice(0, 200));
  }

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: lines.join("\n"),
      disable_web_page_preview: true,
    }),
  });
}
