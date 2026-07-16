import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MONITOR_SECRET = process.env.RISK_MONITOR_SECRET ?? "ema100_secret_2026";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Rapor kartının mount'ta son raporu geri yükleyebilmesi için hafif okuma
// ucu. agent_run_log anon key'e kapalı (RLS) olduğundan service key ile
// sunucu tarafında okunur. Yalnızca kartın gösterdiği alanlar döner —
// decisions kırpılır (type/symbol/reason/urgency), suggested fiyat/lot
// gibi işlem detayları DAHİL EDİLMEZ.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabase
      .from("agent_run_log")
      .select("run_at,trigger_source,summary,monthly_outlook,decisions")
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json({ ok: true, report: null });
    }

    return NextResponse.json({
      ok: true,
      report: {
        runAt: data.run_at,
        triggerSource: data.trigger_source ?? null,
        summary: data.summary ?? null,
        monthlyOutlook: data.monthly_outlook ?? null,
        decisions: (data.decisions ?? []).map((d: any) => ({
          type: d.type,
          symbol: d.symbol,
          reason: d.reason,
          urgency: d.urgency,
        })),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("LAST_REPORT_ERROR", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
