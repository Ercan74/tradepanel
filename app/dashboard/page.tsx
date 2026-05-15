import Sidebar from "@/components/terminal/Sidebar"
import Topbar from "@/components/terminal/Topbar"
import StatsRow from "@/components/terminal/StatsRow"
import ExecutionDesk from "@/components/terminal/ExecutionDesk"
import AnalyticsGrid from "@/components/terminal/AnalyticsGrid"

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
    side: "LONG" as const,
    strategy: "TREND FOLLOW",
    pnl: 2.31,
    confidence: 88,
    entry: 142.4,
    time: "2026-05-13",
  },
]

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#030712] p-5 text-white">
      <Topbar />

      <div className="mt-5 grid gap-5 xl:grid-cols-[320px_1fr]">
        <Sidebar trades={trades} />

        <div className="space-y-5">
          <section className="rounded-3xl border border-cyan-500/10 bg-[#071018] p-8">
            <div className="text-cyan-300">
              LIVE INSTITUTIONAL TERMINAL
            </div>

            <h1 className="mt-2 text-6xl font-bold leading-tight">
              EMA100 Pro Trading Terminal
            </h1>

            <div className="mt-4 text-2xl text-slate-400">
              Execution Desk · Strategy Intelligence ·
              PnL Analytics · Risk Monitor
            </div>
          </section>

          <StatsRow />

          <ExecutionDesk trades={trades} />

          <AnalyticsGrid />
        </div>
      </div>
    </main>
  )
}