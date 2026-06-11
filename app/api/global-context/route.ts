import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export async function GET() {
  try {
    if (!supabase) {
      return NextResponse.json(
        {
          ok: false,
          source: "MATRIX_DDE",
          error: "Supabase not configured",
          data: [],
        },
        { status: 500 }
      );
    }

    const { data, error } = await supabase
      .from("global_context_prices")
      .select("*")
      .order("symbol", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          source: "MATRIX_DDE",
          error: error.message,
          data: [],
        },
        { status: 500 }
      );
    }

    const normalized = (data ?? []).map((item) => ({
      symbol: item.symbol,
      name: item.name,
      price: Number(item.last_price ?? 0),
      changePct: Number(item.change_pct ?? 0),
      source: item.source ?? "MATRIX_DDE",
      updatedAt: item.updated_at,
    }));

    return NextResponse.json({
      ok: true,
      source: "MATRIX_DDE",
      updatedAt: new Date().toISOString(),
      count: normalized.length,
      data: normalized,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        source: "MATRIX_DDE",
        error: error instanceof Error ? error.message : "Unknown error",
        data: [],
      },
      { status: 500 }
    );
  }
}