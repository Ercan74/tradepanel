import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  openPosition,
  calculateSizing,
  calculateRiskLevels,
  executeAiDecision,
  toNumber,
  type Side,
} from "@/lib/execution";
import { sendTelegramMessage } from "@/lib/telegram";
import { buildEntryIndicators } from "@/lib/attribution";
import { isMarketOpen, DATA_FRESHNESS_THRESHOLD_MINUTES } from "@/lib/marketStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// PENDING_OPEN işleyici — günlük bar KAPANIŞTA ateşleyen sinyaller webhook'ta
// (seans kapalı olduğu için) kapanış fiyatından AÇILMAZ, PENDING_OPEN olarak
// kuyruklanır. Bu cron ertesi seans AÇILIŞINDA çalışır:
//   1) Zaten açık pozisyon varsa atla.
//   2) Slot doluysa → REJECTED_MAX_OPEN_POSITIONS_REACHED (SWAP havuzuna düşer).
//   3) Taze açılış fiyatını al; gap guard: açılış tetik fiyatından
//      OPEN_GAP_GUARD_PCT'ten fazla ALEYHTE kaçtıysa → SKIPPED_GAP.
//   4) Aksi halde açılış fiyatında sizing+risk YENİDEN hesaplanıp pozisyon açılır
//      → ACCEPTED_NEXT_OPEN. Giriş fiyatı gerçek dolum fiyatını yansıtır.
// Reversal yolu kapsam dışıdır (webhook'ta anlık işlenmeye devam eder).
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MONITOR_SECRET = process.env.RISK_MONITOR_SECRET ?? "ema100_secret_2026";
const MAX_OPEN_POSITIONS = Number(process.env.MAX_OPEN_POSITIONS ?? 10);
// Gap guard eşiği — açılış, sinyal tetik fiyatından bu kadar (%) ALEYHTE kaçtıysa
// kenar gitmiştir, işlem atlanır. STALE_PRICE_MOVE_PCT mantığıyla aynı, ayrı env.
const OPEN_GAP_GUARD_PCT = Number(process.env.OPEN_GAP_GUARD_PCT ?? 5);
// Ne kadar eski PENDING_OPEN sinyali hâlâ değerlendirilsin (gün).
const PENDING_LOOKBACK_DAYS = Number(process.env.PENDING_LOOKBACK_DAYS ?? 2);

const LIVE_COLS =
  "last_price,atr,rsi,adx,ema20,ema50,ema100,lrs,macd_div,stoc_rsi,stoch_fast_k,stoch_fast_d,aroon_up,aroon_down,rsi_4h,ema20_4h,ema50_4h,ema100_4h,atr_4h,adx_4h,stoch_fast_k_4h,stoch_fast_d_4h,matriks_trade_time";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function GET(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return processPendingOpens();
}

async function setDecision(signalId: string, decision: string) {
  await supabase
    .from("signals")
    .update({ decision, processed: true, processed_at: new Date().toISOString() })
    .eq("id", signalId);
}

async function openCount(): Promise<number> {
  const { count } = await supabase
    .from("positions")
    .select("id", { count: "exact", head: true })
    .eq("status", "OPEN");
  return count ?? 0;
}

async function processPendingOpens() {
  // Gün düzeyi kapı — hafta sonu/tatilde işlem günü değil, hiç dokunma.
  const day = await isMarketOpen();
  if (!day.open) {
    return NextResponse.json({ ok: true, skipped: day.reason, processed: [] });
  }

  const { data: pending, error } = await supabase
    .from("signals")
    .select("id,symbol,side,price,quality_score,strategy_tag,timeframe,created_at")
    .eq("decision", "PENDING_OPEN")
    .gte(
      "created_at",
      new Date(Date.now() - PENDING_LOOKBACK_DAYS * 86_400_000).toISOString()
    )
    .order("quality_score", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results: any[] = [];

  for (const sig of pending ?? []) {
    const symbol = sig.symbol as string;
    const side = sig.side as Side;
    const trigger = toNumber(sig.price, 0) ?? 0;

    // (1) Zaten açık pozisyon varsa atla (webhook tek-sembol tek-pozisyon kuralı).
    const { data: existing } = await supabase
      .from("positions")
      .select("id")
      .eq("symbol", symbol)
      .eq("status", "OPEN")
      .maybeSingle();
    if (existing) {
      await setDecision(sig.id, "SKIPPED_ALREADY_OPEN");
      results.push({ symbol, action: "SKIPPED_ALREADY_OPEN" });
      continue;
    }

    // (2) Slot doluysa SWAP havuzuna yönlendir (agent değerlendirir).
    if ((await openCount()) >= MAX_OPEN_POSITIONS) {
      await setDecision(sig.id, "REJECTED_MAX_OPEN_POSITIONS_REACHED");
      results.push({ symbol, action: "REJECTED_MAX_OPEN_POSITIONS_REACHED" });
      continue;
    }

    // (3) Taze açılış fiyatı — bayatsa bu turu bekle (decision'a dokunma, sonraki
    //     cron dener). Feed henüz açılış fiyatını yazmamış olabilir.
    const { data: live } = await supabase
      .from("live_prices")
      .select(LIVE_COLS)
      .eq("symbol", symbol)
      .maybeSingle();

    const liveRow = live as Record<string, any> | null;
    const openPrice = toNumber(liveRow?.last_price, 0) ?? 0;
    const tradeTime = liveRow?.matriks_trade_time as string | null;
    const ageMin = tradeTime
      ? (Date.now() - new Date(tradeTime).getTime()) / 60_000
      : null;
    const stale =
      ageMin == null || !Number.isFinite(ageMin) || ageMin > DATA_FRESHNESS_THRESHOLD_MINUTES;

    if (!liveRow || !(openPrice > 0) || stale) {
      results.push({ symbol, action: "WAIT_NO_FRESH_PRICE" });
      continue;
    }

    // (4) Gap guard: açılış tetik fiyatından ALEYHTE (LONG için yukarı, SHORT için
    //     aşağı) OPEN_GAP_GUARD_PCT'ten fazla kaçtıysa kenar gitti → atla.
    const adversePct =
      trigger > 0
        ? side === "LONG"
          ? ((openPrice - trigger) / trigger) * 100
          : ((trigger - openPrice) / trigger) * 100
        : 0;

    if (adversePct > OPEN_GAP_GUARD_PCT) {
      await setDecision(sig.id, "SKIPPED_GAP");
      await sendTelegramMessage(
        `⤬ GAP ATLANDI\n\n` +
          `Sembol: ${symbol} | Yön: ${side}\n` +
          `Tetik: ${trigger} → Açılış: ${openPrice}\n` +
          `Aleyhte: %${adversePct.toFixed(2)} (eşik %${OPEN_GAP_GUARD_PCT}) — kenar gitti, işlem açılmadı.`
      );
      results.push({ symbol, action: "SKIPPED_GAP", adversePct: Math.round(adversePct * 100) / 100 });
      continue;
    }

    // (5) Aç — sizing + risk seviyeleri GERÇEK açılış fiyatı ve taze ATR ile.
    try {
      const sizing = calculateSizing(openPrice);
      const risk = calculateRiskLevels(side, openPrice, toNumber(liveRow.atr));
      const opened = await openPosition({
        symbol,
        side,
        price: openPrice,
        quantity: sizing.quantity,
        risk,
        qualityScore: toNumber(sig.quality_score),
        strategyTag: sig.strategy_tag,
        timeframe: sig.timeframe,
        rawPayload: { source: "pending_open_processor", trigger, openPrice, adversePct },
        setupType: "EXTERNAL_SIGNAL",
        attributionSource: "EXTERNAL_SIGNAL_NEXT_OPEN",
        entryIndicators: buildEntryIndicators(liveRow),
      });

      await setDecision(sig.id, "ACCEPTED_NEXT_OPEN");
      await supabase.from("position_events").insert({
        position_id: opened.id,
        symbol,
        side,
        event_type: "NEXT_OPEN_FILL",
        price: openPrice,
        message: `Ertesi açılışta dolduruldu (tetik ${trigger} → açılış ${openPrice}, aleyhte %${adversePct.toFixed(2)}).`,
        payload: { trigger, openPrice, adversePct },
      });

      await sendTelegramMessage(
        `🟢 AÇILIŞTA AÇILDI\n\n` +
          `Sembol: ${symbol}\n` +
          `Yön: ${side}\n\n` +
          `Tetik (kapanış): ${trigger}\n` +
          `Gerçek giriş (açılış): ${openPrice}\n` +
          `Fark: %${adversePct.toFixed(2)}\n\n` +
          `Lot: ${sizing.quantity} | Stop: ${risk.stopPrice} | TP1: ${risk.tp1Price}`
      );

      results.push({ symbol, action: "ACCEPTED_NEXT_OPEN", openPrice });
    } catch (e: any) {
      const message = e?.message ?? String(e);
      // SHORT_NOT_ELIGIBLE gibi kalıcı hatalar: terminal işaretle, tekrar deneme.
      const terminal = message.includes("SHORT_NOT_ELIGIBLE");
      await setDecision(sig.id, terminal ? "SKIPPED_SHORT_NOT_ELIGIBLE" : "OPEN_ERROR");
      results.push({ symbol, action: terminal ? "SKIPPED_SHORT_NOT_ELIGIBLE" : "OPEN_ERROR", error: message });
    }
  }

  // ---- Ertelenmiş-onaylı ai_decisions (seans-dışı Telegram onayı) ----
  // telegram-webhook, borsa kapalıyken onayı status=APPROVED + executed=false
  // bıraktı → açılışta burada uygulanır (aç/kapat, taze fiyatla executeAiDecision).
  const { data: deferredApproved } = await supabase
    .from("ai_decisions")
    .select("*")
    .eq("status", "APPROVED")
    .eq("executed", false)
    .gte("created_at", new Date(Date.now() - PENDING_LOOKBACK_DAYS * 86_400_000).toISOString());

  for (const d of deferredApproved ?? []) {
    const res = await executeAiDecision(d, "APPROVED");
    if (res.ok) {
      await supabase
        .from("ai_decisions")
        .update({ executed: true, executed_at: new Date().toISOString() })
        .eq("id", d.id);
      await sendTelegramMessage(
        `🟢 ERTELENMİŞ ONAY UYGULANDI (açılış)\n${d.decision_type}: ${d.symbol}\n${res.message}`
      );
      results.push({ symbol: d.symbol, action: "DEFERRED_APPROVED_EXECUTED" });
    } else {
      // Açılışta uygulanamadı (poz. kapanmış / short-uygun değil vb.) → EXPIRED
      await supabase.from("ai_decisions").update({ status: "EXPIRED" }).eq("id", d.id);
      await sendTelegramMessage(
        `⌛ ERTELENMİŞ ONAY UYGULANAMADI\n${d.decision_type}: ${d.symbol}\n${res.message}`
      );
      results.push({ symbol: d.symbol, action: "DEFERRED_APPROVED_FAILED", error: res.message });
    }
  }

  return NextResponse.json({
    ok: true,
    processedCount: results.length,
    processed: results,
  });
}
