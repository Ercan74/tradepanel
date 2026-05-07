import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "TradingView webhook endpoint is alive",
  });
}

export async function POST(req: Request) {
  const body = await req.json();

  console.log("TradingView Webhook:", body);

  return NextResponse.json({
    success: true,
    received: body,
  });
}