import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      engine: "DISABLED",
      message:
        "Simulation price engine is disabled. Live prices are controlled only by external Python Price Engine.",
    },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      engine: "DISABLED",
      message:
        "Simulation price engine is disabled. Live prices are controlled only by external Python Price Engine.",
    },
    { status: 410 }
  );
}