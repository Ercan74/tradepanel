import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Sembol-düzeyi soğuma filtresi (churn emniyet kemeri) — SALT KOD TARAFI.
// Agent'ın ürettiği kararlar PENDING'e yazılmadan/Telegram'a gitmeden önce
// urgent-check ve agent GET akışında uygulanır. Prompt'a kural eklenmez.
//
// KURAL 1 (reopen): bir sembolde pozisyon kapandıktan sonra
//   REOPEN_COOLDOWN_HOURS boyunca (her iki yön) RECOMMEND_OPEN engellenir.
// KURAL 2 (early-close): bir pozisyon açıldıktan sonra CLOSE_COOLDOWN_MINUTES
//   boyunca CLOSE/REDUCE engellenir; ama pozisyon aleyhine
//   COOLDOWN_OVERRIDE_LOSS_PCT'ten fazla hareket varsa soğuma iptal.
//
// MUAFİYETLER (bu filtre HİÇ uygulanmaz): risk-monitor stop/trailing
// (ayrı dosya, buraya hiç gelmez) ve chat [ACTION] akışı (runChat bu
// filtreyi çağırmaz — kullanıcı bilinçli talebi her zaman geçerli).
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export const REOPEN_COOLDOWN_HOURS = Number(process.env.REOPEN_COOLDOWN_HOURS ?? 24);
export const CLOSE_COOLDOWN_MINUTES = Number(process.env.CLOSE_COOLDOWN_MINUTES ?? 240);
export const COOLDOWN_OVERRIDE_LOSS_PCT = Number(process.env.COOLDOWN_OVERRIDE_LOSS_PCT ?? 5);

export type CooldownSuppression = { decision: any; reason: "REOPEN_COOLDOWN" | "CLOSE_COOLDOWN" };
export type CooldownResult = { kept: any[]; suppressed: CooldownSuppression[] };

export async function applyCooldownFilter(decisions: any[]): Promise<CooldownResult> {
  if (!supabase || decisions.length === 0) return { kept: decisions, suppressed: [] };

  const symbols = [...new Set(decisions.map((d) => String(d.symbol).toUpperCase()))];
  const nowMs = Date.now();

  const [closedRes, openRes, liveRes] = await Promise.all([
    // En son kapanışlar (KURAL 1) — closed_at DESC, sembol başına ilki en güncel
    supabase
      .from("positions")
      .select("symbol,closed_at")
      .eq("status", "CLOSED")
      .in("symbol", symbols)
      .order("closed_at", { ascending: false }),
    // Açık pozisyonlar (KURAL 2)
    supabase
      .from("positions")
      .select("symbol,side,entry_price,current_price,opened_at")
      .eq("status", "OPEN")
      .in("symbol", symbols),
    supabase.from("live_prices").select("symbol,last_price").in("symbol", symbols),
  ]);

  const lastClose = new Map<string, string>();
  for (const r of closedRes.data ?? []) {
    const s = String(r.symbol).toUpperCase();
    if (!lastClose.has(s) && r.closed_at) lastClose.set(s, r.closed_at); // DESC → ilk = en güncel
  }
  const openMap = new Map((openRes.data ?? []).map((r: any) => [String(r.symbol).toUpperCase(), r]));
  const liveMap = new Map((liveRes.data ?? []).map((r: any) => [String(r.symbol).toUpperCase(), Number(r.last_price)]));

  const kept: any[] = [];
  const suppressed: CooldownSuppression[] = [];

  for (const d of decisions) {
    const sym = String(d.symbol).toUpperCase();
    const type = String(d.type).toUpperCase();

    // KURAL 1 — tekrar-açılış soğuması (her iki yön). SWAP de dahil: bu kod
    // tabanında SWAP tek symbol taşır (açılış bacağı), o sembol soğumadaysa
    // SWAP da engellenir. SWAP'ın kapanış bacağına KURAL 2 uygulanmaz.
    if (type === "RECOMMEND_OPEN" || type === "SWAP") {
      const ca = lastClose.get(sym);
      if (ca) {
        const hrs = (nowMs - new Date(ca).getTime()) / 3_600_000;
        if (hrs >= 0 && hrs < REOPEN_COOLDOWN_HOURS) {
          suppressed.push({ decision: d, reason: "REOPEN_COOLDOWN" });
          continue;
        }
      }
    }

    // KURAL 2 — erken kapanış soğuması (aleyhte %5+ hareket varsa iptal).
    // SWAP KAPSAM DIŞI (bilinçli pozisyon değiştirme, erken-kapanış gürültüsü değil).
    if (type === "CLOSE" || type === "REDUCE") {
      const pos: any = openMap.get(sym);
      if (pos) {
        const mins = (nowMs - new Date(pos.opened_at).getTime()) / 60_000;
        if (mins >= 0 && mins < CLOSE_COOLDOWN_MINUTES) {
          const entry = Number(pos.entry_price);
          const cur = liveMap.get(sym) ?? Number(pos.current_price);
          const side = String(pos.side).toUpperCase();
          const lossPct =
            entry > 0 && cur > 0
              ? side === "LONG"
                ? ((entry - cur) / entry) * 100
                : ((cur - entry) / entry) * 100
              : 0;
          // lossPct pozitif = zarar; eşiği aşmadıysa soğumada tut
          if (lossPct <= COOLDOWN_OVERRIDE_LOSS_PCT) {
            suppressed.push({ decision: d, reason: "CLOSE_COOLDOWN" });
            continue;
          }
          // aksi halde acil override → kept'e düşer
        }
      }
    }

    kept.push(d);
  }

  return { kept, suppressed };
}
