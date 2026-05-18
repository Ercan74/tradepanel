"use client";

import Sidebar from "@/components/terminal/Sidebar";
import Topbar from "@/components/terminal/Topbar";
import StatsRow from "@/components/terminal/StatsRow";
import ExecutionDesk from "@/components/terminal/ExecutionDesk";
import AnalyticsGrid from "@/components/terminal/AnalyticsGrid";
import VisualIntelligenceLayer from "@/components/terminal/VisualIntelligenceLayer";
import DashboardCommandCenter from "@/components/terminal/DashboardCommandCenter";
import TradingIntelligenceLayer from "@/components/terminal/TradingIntelligenceLayer";
import { useTradingIntelligence } from "@/components/terminal/useTradingIntelligence";

export default function DashboardPage() {
  const { loading, source, signals, trades, positions, bridge } =
    useTradingIntelligence();

  return (
    <main className="min-h-screen bg-[#05070d] text-zinc-100">
      <div className="flex min-h-screen">
        <Sidebar trades={trades} />

        <section className="flex-1 min-w-0">
          <Topbar />

          <div className="p-3 space-y-3">
            <div className="rounded-2xl border border-zinc-800 bg-[#070b12] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">
                    Realtime Trading Intelligence
                  </div>
                  <div className="mt-1 text-sm text-zinc-500">
                    Source: {source} · {loading ? "Loading..." : "Live ready"}
                  </div>
                </div>

                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
                  {bridge.health}
                </div>
              </div>
            </div>

            <StatsRow />

            <ExecutionDesk trades={trades} />

            <VisualIntelligenceLayer signals={signals} />

            <DashboardCommandCenter trades={trades} signals={signals} />

            <TradingIntelligenceLayer
              signals={signals}
              trades={trades}
              positions={positions}
              bridge={bridge}
              source={source}
            />

            <AnalyticsGrid />
          </div>
        </section>
      </div>
    </main>
  );
}