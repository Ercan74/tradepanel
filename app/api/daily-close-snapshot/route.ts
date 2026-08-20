import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GÜNLÜK KAPANIŞ SNAPSHOT — "dün tavan mıydı" denetimi için (2026-08-19)
// ---------------------------------------------------------------------------
// Her seans kapanışında (Vercel cron ~18:10 TR = 15:10 UTC, hafta içi) her
// sembolün O GÜNÜN change_pct'ini prev_day_change_pct'e DONDURUR. Ertesi gün
// giriş denetimi bunu "dünkü değişim" olarak okur (dün tavana yakın kapandıysa
// bugünkü açılış riskli). change_pct = (son − önceki_kapanış)/önceki_kapanış
// zaten O GÜNÜN tam hareketidir → tek değeri dondurmak yeterli, iki kapanış
// gerekmez. change_pct null olan satırlar atlanır (eski değer korunur).
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MONITOR_SECRET =
  process.env.RISK_MONITOR_SECRET ??
  process.env.TRADINGVIEW_WEBHOOK_SECRET ??
  "ema100_secret_2026";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase server environment variables." },
        { status: 500 }
      );
    }

    const secret =
      req.nextUrl.searchParams.get("secret") ??
      req.headers.get("x-monitor-secret") ??
      req.headers.get("authorization")?.replace("Bearer ", "");

    if (secret !== MONITOR_SECRET) {
      return NextResponse.json({ ok: false, error: "Invalid secret" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("live_prices")
      .select("symbol,change_pct");
    if (error) throw error;

    const rows = (data ?? []).filter(
      (r: { change_pct: number | null }) => r.change_pct != null
    );

    let ok = 0;
    let fail = 0;
    // 50'lik gruplar — column-copy tek statement'la yapılamadığından satır-satır.
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const results = await Promise.all(
        batch.map((r: { symbol: string; change_pct: number | null }) =>
          supabase!
            .from("live_prices")
            .update({ prev_day_change_pct: r.change_pct })
            .eq("symbol", r.symbol)
        )
      );
      for (const x of results) {
        if (x.error) fail++;
        else ok++;
      }
    }

    return NextResponse.json({
      ok: true,
      total: data?.length ?? 0,
      snapshotted: ok,
      failed: fail,
      at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
