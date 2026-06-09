import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.LAPLACE_API_KEY;

const symbols = ["SPY", "QQQ", "DIA", "GLD", "USO"];

export async function GET() {
  try {
    if (!API_KEY) {
      return NextResponse.json({
        ok: true,
        source: "fallback",
        warning: "Missing LAPLACE_API_KEY",
        data: [],
        updatedAt: new Date().toISOString(),
      });
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
      return NextResponse.json({
        ok: true,
        source: "fallback",
        warning: `Laplace returned ${response.status}`,
        data: [],
        updatedAt: new Date().toISOString(),
      });
    }

    let data: unknown = null;

    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return NextResponse.json({
      ok: true,
      source: "laplace",
      data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      source: "fallback",
      warning: error instanceof Error ? error.message : "Unknown error",
      data: [],
      updatedAt: new Date().toISOString(),
    });
  }
}