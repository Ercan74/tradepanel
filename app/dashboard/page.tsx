import Sidebar from "@/components/terminal/Sidebar";
import Topbar from "@/components/terminal/Topbar";
import StatsRow from "@/components/terminal/StatsRow";
import ExecutionDesk from "@/components/terminal/ExecutionDesk";
import AnalyticsGrid from "@/components/terminal/AnalyticsGrid";
import VisualIntelligenceLayer from "@/components/terminal/VisualIntelligenceLayer";
import type { Trade } from "@/components/terminal/types";

const trades: Trade[] = [
  {
    id: "1",
    symbol: "AFYON",
    side: "LONG",
    strategy: "EMA100 CORE",
    pnl: -0.07,
    confidence: 72,
    entry: 13.25,
    price: 13.25,
    stop: null,
    takeProfit: null,
    time: "2026-05-13",
    createdAt: "2026-05-13T16:35:00",
    status: "OPEN",
  },
  {
    id: "2",
    symbol: "ASELS",
    side: "SHORT",
    strategy: "EMA100 REVERSAL",
    pnl: 1.42,
    confidence: 86,
    entry: 74.15,
    price: 74.15,
    stop: null,
    takeProfit: null,
    time: "2026-05-13",
    createdAt: "2026-05-13T16:40:00",
    status: "OPEN",
  },
  {
    id: "3",
    symbol: "EKGYO",
    side: "LONG",
    strategy: "ATR DISTANCE",
    pnl: 0.64,
    confidence: 79,
    entry: 11.82,
    price: 11.82,
    stop: null,
    takeProfit: null,
    time: "2026-05-13",
    createdAt: "2026-05-13T16:45:00",
    status: "OPEN",
  },
  {
    id: "4",
    symbol: "SASA",
    side: "SHORT",
    strategy: "MACD CROSS",
    pnl: -0.31,
    confidence: 68,
    entry: 43.92,
    price: 43.92,
    stop: null,
    takeProfit: null,
    time: "2026-05-13",
    createdAt: "2026-05-13T16:50:00",
    status: "OPEN",
  },
];

const signals = trades.map((trade, index) => ({
  id: trade.id,
  symbol: trade.symbol,
  side: trade.side,
  price: trade.price ?? trade.entry,
  status: trade.status,
  created_at: trade.createdAt,

  pnlPct: trade.pnl,
  score: trade.confidence,

  rsi: 54 + index * 4,
  macd: 1.2 - index * 0.25,
  atr: 2.1 + index * 0.3,
  distAtr: 1.4 + index * 0.35,
  emaSlope: 0.8 + index * 0.15,
}));

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#05070d] text-zinc-100">
      <div className="flex min-h-screen">
        <Sidebar trades={trades} />

        <section className="flex-1 min-w-0">
          <Topbar />

          <div className="p-3 space-y-3">
            <StatsRow />

            <ExecutionDesk trades={trades} />

            <VisualIntelligenceLayer signals={signals} />

            <AnalyticsGrid />
          </div>
        </section>
      </div>
    </main>
  );
}