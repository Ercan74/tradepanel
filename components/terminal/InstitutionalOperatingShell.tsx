"use client";

import DashboardCommandCenter from "./DashboardCommandCenter";
import TerminalSidebar from "./TerminalSidebar";
import type {
  BrokerBridgeStatus,
  PositionLifecycle,
  Trade,
  TradingSignal,
} from "./types";

type GlobalMarketItem = {
  symbol: string;
  price: number;
  changePct: number;
};

type Props = {
  loading: boolean;
  source: "SUPABASE" | "MOCK";
  signals: TradingSignal[];
  trades: Trade[];
  positions: PositionLifecycle[];
  bridge: BrokerBridgeStatus;
  globalContext?: GlobalMarketItem[];
};

export default function InstitutionalOperatingShell({
  loading,
  source,
  signals,
  trades,
  positions,
  bridge,
  globalContext = [],
}: Props) {
  return (
    <main className="h-screen w-screen overflow-hidden bg-[#03050a] text-zinc-100">
      <div className="grid h-full w-full grid-cols-[76px_minmax(0,1fr)]">
        <TerminalSidebar bridgeOk={bridge.health === "OK"} />

        <section className="grid h-screen min-w-0 grid-rows-[68px_minmax(0,1fr)] overflow-hidden">
          <header className="flex min-w-0 items-center justify-between border-b border-white/10 bg-[#050812]/95 px-4">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-300">
                Portföy Yönetim Merkezi
              </div>
              <div className="mt-1 truncate text-xs text-zinc-500">
                {source} · {loading ? "Canlı veri yükleniyor..." : "Canlı veri hazır"} · EMA100 PRO · {bridge.lastAction}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusPill label="Mode" value={bridge.mode} tone="cyan" />
              <StatusPill label="Bridge" value={bridge.health} tone="good" />
              <StatusPill label="Signals" value={String(signals.length)} tone="neutral" />
              <StatusPill label="Open" value={String(positions.length)} tone="warn" />
            </div>
          </header>

          <DashboardCommandCenter
            signals={signals}
            trades={trades}
            positions={positions}
            bridge={bridge}
            source={source}
            globalContext={globalContext}
          />
        </section>
      </div>
    </main>
  );
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "cyan" | "neutral";
}) {
  const toneClass = {
    good: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    warn: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
    neutral: "border-white/10 bg-white/[0.03] text-zinc-300",
  }[tone];

  return (
    <div className={`rounded-full border px-3 py-1.5 ${toneClass}`}>
      <span className="mr-2 text-[9px] uppercase tracking-[0.18em] opacity-60">
        {label}
      </span>
      <span className="text-xs font-black">{value}</span>
    </div>
  );
}