import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessageWithButtons } from "@/lib/telegram";
import { calculateSizing, toNumber } from "@/lib/execution";
import { isMarketOpen, getDataFreshness, formatTradeTimeTR } from "@/lib/marketStatus";
import { applyCooldownFilter } from "@/lib/cooldown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// İç analiz (Claude çağrısı, max_tokens 4000) 60 sn'yi aşabiliyor;
// self-fetch + DB işlemleri için geniş pay bırak
export const maxDuration = 300;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MONITOR_SECRET = process.env.RISK_MONITOR_SECRET ?? "ema100_secret_2026";
const MAX_OPEN_POSITIONS = Number(process.env.MAX_OPEN_POSITIONS ?? 10);

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

// Değerlendirilen karar tipleri ve genel aciliyet eşiği
// (LOW yalnızca rapor kartında kalır, otomatik bildirime girmez)
const ACTIONABLE_TYPES = ["CLOSE", "REDUCE", "SWAP", "RECOMMEND_OPEN"];
const NOTIFY_URGENCIES = ["HIGH", "MEDIUM"];

// Dedup kuralları — ikisi birlikte çalışır, biri bile tutarsa aday atlanır:
//  a) aynı symbol+type için son 60 dk'da PENDING kayıt varsa (tekrar sorma)
//  b) aynı symbol+type için son 48 saatte REJECTED kayıt varsa
//     (kullanıcının reddettiği öneri 48 saat yeniden sorulmaz)
const DEDUP_PENDING_WINDOW_MINUTES = 60;
const DEDUP_REJECTED_WINDOW_HOURS = 48;

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
// Aday filtresi — side'dan (LONG/SHORT) tamamen bağımsız, simetrik mantık
// ---------------------------------------------------------------------------
//  - CLOSE/REDUCE: slot AÇAR → kapasiteden bağımsız, HIGH+MEDIUM geçer
//  - RECOMMEND_OPEN: yalnızca boş slot varsa değerlendirilir (yoksa NO_SLOT)
//  - SWAP: her zaman değerlendirilir (kapat+aç, net slot değişimi yok);
//    ancak slot doluyken eşik yalnızca HIGH'a yükselir

function filterCandidate(
  d: any,
  hasSlot: boolean
): { eligible: boolean; skipReason: "NO_SLOT" | null } {
  if (!ACTIONABLE_TYPES.includes(d.type)) return { eligible: false, skipReason: null };
  if (!NOTIFY_URGENCIES.includes(d.urgency)) return { eligible: false, skipReason: null };

  if (d.type === "RECOMMEND_OPEN" && !hasSlot) {
    return { eligible: false, skipReason: "NO_SLOT" };
  }

  if (d.type === "SWAP" && !hasSlot && d.urgency !== "HIGH") {
    return { eligible: false, skipReason: null };
  }

  return { eligible: true, skipReason: null };
}

function decisionEmoji(type: string): string {
  return type === "CLOSE" ? "🔴"
    : type === "REDUCE" ? "🟡"
    : type === "SWAP" ? "🔄"
    : type === "RECOMMEND_OPEN" ? "🟢"
    : "⚪";
}

// ---------------------------------------------------------------------------
// GET — otomatik acil aksiyon + fırsat taraması (cron)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Katman 1 — tatil/hafta sonu: kapalı günlerde hiç analiz yapma
  const day = await isMarketOpen();
  if (!day.open) {
    console.log(`URGENT_SKIP_CLOSED ${day.dateTR} — ${day.reason}`);
    return NextResponse.json({ ok: true, marketOpen: false, reason: day.reason, skipped: true });
  }

  // İLK İŞ: piyasa saati penceresi dışındaysa Claude'u hiç çağırmadan çık
  const market = marketStatusTR();
  if (!market.open) {
    return NextResponse.json({
      ok: true,
      marketOpen: false,
      now: market.label,
      skipped: "Piyasa kapalı — analiz çalıştırılmadı, maliyet oluşmadı",
    });
  }

  // Katman 2 — bayat-veri guard'ı: 6 referans sembolün TAMAMI eşikten eskiyse
  // (tatil listesinde unutulan gün / feed arızası) karar ÜRETME. reportOnly'yi
  // BU route çağıracağı için guard'ı burada, çağrı ÖNCESİ uyguluyoruz — yoksa
  // reportOnly muafiyeti bayat veriyle karar üretilmesine izin verirdi.
  const freshness = await getDataFreshness();
  if (freshness.ok && freshness.allStale) {
    const newest = formatTradeTimeTR(freshness.newestTradeTime);
    console.warn(`URGENT_SKIPPED_STALE_DATA — son güncelleme ${newest}`);
    await supabase.from("agent_run_log").insert({
      mode: "agent",
      trigger_source: "cron_urgent_check",
      decisions: [],
      decision_count: 0,
      summary: `SKIPPED_STALE_DATA: 6 referans sembolün tamamı ${freshness.thresholdMinutes}+ dk bayat (son ${newest}) — karar üretilmedi`,
      portfolio_snapshot: { freshness: { allStale: true, newestTradeTime: freshness.newestTradeTime, thresholdMinutes: freshness.thresholdMinutes } },
    });
    return NextResponse.json({
      ok: true,
      marketOpen: true,
      skipped: "SKIPPED_STALE_DATA",
      newestTradeTime: freshness.newestTradeTime,
      thresholdMinutes: freshness.thresholdMinutes,
    });
  }

  try {
    // Analizi portfolio-ai-agent'ın reportOnly modu üzerinden çalıştır:
    // kararlar üretilir ama o uç kendi başına hiçbir yan etki yaratmaz —
    // kayıt/bildirim aşağıda BU route tarafından yapılır.
    //
    // ÖNEMLİ: self-fetch tabanı req.nextUrl.origin OLAMAZ. Vercel cron,
    // fonksiyonu deployment-unique URL (tradepanel-xxxx.vercel.app)
    // üzerinden çağırır ve bu URL'ler SSO korumalıdır — origin'den yapılan
    // self-fetch JSON yerine SSO HTML sayfası alır ve her cron turu 500
    // ile ölür (2026-07-08/10 arası yaşandı; agent_run_log'un boş kalma
    // sebebi buydu). Her zaman public production alias'ı kullan.
    const origin = process.env.PUBLIC_BASE_URL
      ? process.env.PUBLIC_BASE_URL
      : process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : req.nextUrl.origin;
    const res = await fetch(
      `${origin}/api/portfolio-ai-agent?secret=${MONITOR_SECRET}&reportOnly=1&trigger=cron_urgent_check`,
      { cache: "no-store" }
    );
    const analysis = await res.json().catch(() => null);
    if (!analysis?.ok) {
      throw new Error(`Analiz başarısız: ${analysis?.error ?? `HTTP ${res.status}`}`);
    }

    const decisions: any[] = analysis.decisions ?? [];

    // Pozisyon kapasitesi (karar anındaki gerçek DB durumu)
    const { count } = await supabase
      .from("positions")
      .select("id", { count: "exact", head: true })
      .eq("status", "OPEN");
    const openPositions = count ?? 0;
    const hasSlot = openPositions < MAX_OPEN_POSITIONS;

    let skippedNoSlot = 0;
    const preCooldownCandidates: any[] = [];
    for (const d of decisions) {
      const f = filterCandidate(d, hasSlot);
      if (f.eligible) preCooldownCandidates.push(d);
      else if (f.skipReason === "NO_SLOT") skippedNoSlot++;
    }

    // Sembol-düzeyi soğuma (churn emniyet kemeri): filtrelenenler PENDING'e
    // yazılmaz/Telegram'a gitmez; suppressed_by ile agent_run_log'a iz düşer.
    const { kept: candidates, suppressed: cooldownSuppressed } =
      await applyCooldownFilter(preCooldownCandidates);
    if (cooldownSuppressed.length > 0) {
      await supabase.from("agent_run_log").insert({
        mode: "agent",
        trigger_source: "cron_urgent_check",
        decisions: cooldownSuppressed.map((s) => ({ ...s.decision, suppressed_by: s.reason })),
        decision_count: 0,
        summary: `COOLDOWN_SUPPRESSED: ${cooldownSuppressed.length} karar soğuma penceresinde engellendi (${cooldownSuppressed.map((s) => `${s.decision.type}:${s.decision.symbol}/${s.reason}`).join(", ")})`,
        portfolio_snapshot: analysis.portfolioSnapshot ?? null,
      });
    }

    let skippedDedup = 0;
    let skippedRecentlyRejected = 0;
    let skippedNoPosition = 0;
    const created: string[] = [];

    const pendingSinceIso = new Date(
      Date.now() - DEDUP_PENDING_WINDOW_MINUTES * 60_000
    ).toISOString();
    const rejectedSinceIso = new Date(
      Date.now() - DEDUP_REJECTED_WINDOW_HOURS * 3_600_000
    ).toISOString();

    for (const d of candidates) {
      // Dedup a) son 60 dk'da aynı symbol+type PENDING
      const { data: dupPending } = await supabase
        .from("ai_decisions")
        .select("id")
        .eq("symbol", d.symbol)
        .eq("decision_type", d.type)
        .eq("status", "PENDING")
        .gte("created_at", pendingSinceIso)
        .limit(1)
        .maybeSingle();

      if (dupPending) {
        skippedDedup++;
        continue;
      }

      // Dedup b) son 48 saatte aynı symbol+type REJECTED
      const { data: dupRejected } = await supabase
        .from("ai_decisions")
        .select("id")
        .eq("symbol", d.symbol)
        .eq("decision_type", d.type)
        .eq("status", "REJECTED")
        .gte("created_at", rejectedSinceIso)
        .limit(1)
        .maybeSingle();

      if (dupRejected) {
        skippedRecentlyRejected++;
        continue;
      }

      // suggested_* doldurma — executeAiDecision ile tutarlı:
      // RECOMMEND_OPEN canlı fiyat + calculateSizing kullanır (sektör,
      // uygulama anında executeAiDecision içinde sectorMap'ten çekilir);
      // CLOSE/REDUCE/SWAP açık pozisyondan beslenir.
      const { data: pos } = await supabase
        .from("positions")
        .select("side,current_price,remaining_quantity")
        .eq("symbol", d.symbol)
        .eq("status", "OPEN")
        .limit(1)
        .maybeSingle();

      const { data: live } = await supabase
        .from("live_prices")
        .select("last_price")
        .eq("symbol", d.symbol)
        .maybeSingle();
      const livePrice = toNumber(live?.last_price, null);

      let suggestedSide: string | null = null;
      let suggestedPrice: number | null = null;
      let suggestedQty: number | null = null;

      if (d.type === "RECOMMEND_OPEN") {
        // Yeni açılış: sembolde açık pozisyon OLMAMALI, yön karardan,
        // fiyat canlı veriden, lot standart sizing'den gelmeli
        if (pos || !d.side || !livePrice) {
          skippedNoPosition++;
          continue;
        }
        suggestedSide = String(d.side).toUpperCase();
        suggestedPrice = livePrice;
        try {
          suggestedQty = calculateSizing(livePrice).quantity;
        } catch {
          skippedNoPosition++;
          continue;
        }
      } else {
        // CLOSE/REDUCE/SWAP: açık pozisyon şart
        if (!pos) {
          skippedNoPosition++;
          continue;
        }
        suggestedSide = pos.side;
        suggestedPrice = livePrice ?? toNumber(pos.current_price, null);
        suggestedQty = toNumber(pos.remaining_quantity, null);
      }

      const { data: inserted, error: insErr } = await supabase
        .from("ai_decisions")
        .insert({
          decision_type: d.type,
          symbol: d.symbol,
          reason: d.reason,
          details: {
            detail: d.details,
            urgency: d.urgency,
            source: d.source ?? null,
            origin: "URGENT_SCAN",
          },
          portfolio_context: analysis.portfolioSnapshot ?? null,
          executed: false,
          status: "PENDING",
          suggested_side: suggestedSide,
          suggested_price: suggestedPrice,
          suggested_qty: suggestedQty,
        })
        .select("id")
        .single();

      if (insErr || !inserted) {
        console.error("URGENT_INSERT_ERROR", insErr?.message);
        continue;
      }

      const title =
        d.type === "RECOMMEND_OPEN"
          ? "💡 YENİ FIRSAT — OTOMATİK TARAMA"
          : "🚨 ACİL AKSİYON — OTOMATİK TARAMA";

      const lines = [
        title,
        `${decisionEmoji(d.type)} ${d.type}: ${d.symbol}`,
        `Aciliyet: ${d.urgency}`,
        `Sebep: ${d.reason}`,
        `Öneri: ${suggestedSide} ${suggestedQty ?? "?"} lot @ ${suggestedPrice ?? "?"}`,
      ];
      if (d.source) {
        lines.push(
          `Kaynak: ${d.source === "MATRIKS_SCREENING" ? "Matriks taraması (ön onaysız — temkinli)" : "TradingView havuzu (doğrulanmış)"}`
        );
      }
      lines.push("");
      lines.push("⏱ 5 dk içinde yanıt yoksa hatırlatılır, 10 dk sonra hâlâ geçerliyse otomatik uygulanır.");

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
      openPositions,
      maxPositions: MAX_OPEN_POSITIONS,
      hasSlot,
      analyzedDecisions: decisions.length,
      urgentFound: candidates.length,
      skippedNoSlot,
      skippedCooldown: cooldownSuppressed.length,
      cooldownDetail: cooldownSuppressed.map((s) => `${s.decision.type}:${s.decision.symbol}/${s.reason}`),
      skippedDedup,
      skippedRecentlyRejected,
      skippedNoPosition,
      created,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("URGENT_CHECK_ERROR", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
