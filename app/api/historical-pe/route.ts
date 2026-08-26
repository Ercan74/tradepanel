import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// TARİHSEL F/K TAZELEME (2026-08-26, Faz-2b Option C)
// ---------------------------------------------------------------------------
// borsadirekt.com "Yıllara göre F/K" partial'ını çeker (~580 hisse, Matriks-
// kaynaklı) → historical_pe'ye upsert. Haftalık cron. Tarihsel çapalar yavaş
// değişir. Değerleme sayfası median(pe_6m,pe_1y,pe_2y)'yi "kendi-tarihsel" bağlam
// olarak kullanır (pe_3y/pe_5y TMS-29 kırılması yüzünden kıyasa katılmaz).
// ---------------------------------------------------------------------------

const SRC =
  "https://www.borsadirekt.com/partial/partialPriceEarning.aspx?PageType=FK&Index=XUTUM";

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

// Türkçe sayı: "1.234,56" → 1234.56 ; "-" / boş → null
function parseNum(raw: string): number | null {
  const c = raw.replace(/<[^>]+>/g, "").trim();
  if (!c || c === "-" || c === "N/A") return null;
  const n = Number(c.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

type PeRow = {
  symbol: string;
  close: number | null;
  pe_now: number | null;
  pe_1w: number | null;
  pe_1m: number | null;
  pe_6m: number | null;
  pe_1y: number | null;
  pe_2y: number | null;
  pe_3y: number | null;
  pe_5y: number | null;
  fetched_at: string;
};

function parseTable(html: string): PeRow[] {
  const now = new Date().toISOString();
  const out: PeRow[] = [];
  const rows = html.split(/<tr[^>]*>/i).slice(1);
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 10) continue;
    const symbol = cells[0].replace(/<[^>]+>/g, "").trim();
    if (!/^[A-Z]{3,6}$/.test(symbol)) continue;
    out.push({
      symbol,
      close: parseNum(cells[1]),
      pe_now: parseNum(cells[2]),
      pe_1w: parseNum(cells[3]),
      pe_1m: parseNum(cells[4]),
      pe_6m: parseNum(cells[5]),
      pe_1y: parseNum(cells[6]),
      pe_2y: parseNum(cells[7]),
      pe_3y: parseNum(cells[8]),
      pe_5y: parseNum(cells[9]),
      fetched_at: now,
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Missing Supabase env." }, { status: 500 });
    }
    const secret =
      req.nextUrl.searchParams.get("secret") ??
      req.headers.get("x-monitor-secret") ??
      req.headers.get("authorization")?.replace("Bearer ", "");
    if (secret !== MONITOR_SECRET) {
      return NextResponse.json({ ok: false, error: "Invalid secret" }, { status: 401 });
    }
    const reportOnly = req.nextUrl.searchParams.get("reportOnly") === "1";

    const res = await fetch(SRC, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://www.borsadirekt.com/fiyat-kazanc",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `borsadirekt HTTP ${res.status}` },
        { status: 502 }
      );
    }
    const html = await res.text();
    const rows = parseTable(html);
    if (rows.length < 100) {
      // Beklenen ~580; 100 altı = parse kırıldı (site değişmiş olabilir) → yazma.
      return NextResponse.json(
        { ok: false, error: `Parse şüpheli: yalnız ${rows.length} satır`, sample: rows.slice(0, 3) },
        { status: 502 }
      );
    }
    if (reportOnly) {
      return NextResponse.json({ ok: true, reportOnly, count: rows.length, sample: rows.slice(0, 5) });
    }
    // 200'lük parçalarla upsert
    let written = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await supabase.from("historical_pe").upsert(chunk, { onConflict: "symbol" });
      if (error) throw error;
      written += chunk.length;
    }
    return NextResponse.json({ ok: true, count: written });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
