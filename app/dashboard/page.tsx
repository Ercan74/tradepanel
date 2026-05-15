import Sidebar from "@/components/terminal/Sidebar";
import Topbar from "@/components/terminal/Topbar";
import StatsRow from "@/components/terminal/StatsRow";
import ExecutionDesk from "@/components/terminal/ExecutionDesk";
import AnalyticsGrid from "@/components/terminal/AnalyticsGrid";
import VisualIntelligenceLayer from "@/components/terminal/VisualIntelligenceLayer";

const trades = [
  {
    symbol: "AFYON",
    side: "LONG" as const,
    strategy: "EMA100 CORE",
    pnl: -0.07,
    confidence: 72,
    entry: 13.25,
    time: "2026-05-13",
  },
  {
    symbol: "ASELS",
    side: "SHORT" as const,
    strategy: "EMA100 REVERSAL",
    pnl: 1.42,
    confidence: 86,
    entry: 74.15,
    time: "2026-05-13",
  },
  {
    symbol: "EKGYO",
    side: "LONG" as const,
    strategy: "ATR DISTANCE",
    pnl: 0.64,
    confidence: 79,
    entry: 11.82,
    time: "2026-05-13",
  },
  {
    symbol: "SASA",
    side: "SHORT" as const,
    strategy: "MACD CROSS",
    pnl: -0.31,
    confidence: 68,
    entry: 43.92,
    time: "2026-05-13",
  },
];

const signals = trades.map((trade, index) => ({
  id: String(index),
  symbol: trade.symbol,
  side: trade.side,
  price: trade.entry,
  status: "OPEN" as const,
  created_at: trade.time,

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
            <StatsRow trades={trades} />

            <ExecutionDesk trades={trades} />

            <VisualIntelligenceLayer signals={signals} />

            <AnalyticsGrid trades={trades} />
          </div>
        </section>
      </div>
    </main>
  );
}