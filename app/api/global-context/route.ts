import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.LAPLACE_API_KEY;

const symbols = ["SPY", "QQQ", "DIA", "GLD", "USO"];

export async function GET() {
  try {
    if (!API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing LAPLACE_API_KEY" },
        { status: 500 }
      );
    }

    const url =
      "https://api.getlaplace.com/api/v2/stock/price/live" +
      `?filter=${symbols.join(",")}&region=us`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
      cache: "no-store",
    });

    const text = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: text },
        { status: response.status }
      );
    }

    let data: unknown = null;

    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return NextResponse.json({
      ok: true,
      data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}