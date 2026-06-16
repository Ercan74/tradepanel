"use client";

import Link from "next/link";
import DashboardCommandCenter from "./DashboardCommandCenter";
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

const navItems = [
  { label: "Özet", href: "/dashboard", code: "ÖZ", active: true },
  { label: "Pozisyonlar", href: "/positions", code: "PO" },
  { label: "Sinyaller", href: "/signals", code: "Sİ" },
  { label: "Analitik", href: "/analytics", code: "AN" },
  { label: "Replay", href: "/replay", code: "RE" },
  { label: "Risk", href: "/risk", code: "Rİ" },
  { label: "Ayarlar", href: "/settings", code: "AY" },
];

export default function InstitutionalOperatingShell({
  loading,
  source,
  signals,
  trades,
  positions,
  bridge,
  globalContext,
}: Props) {
  return (
    <main className="h-screen w-screen overflow-hidden bg-[#03050a] text-zinc-100">
      <div className="grid h-full w-full grid-cols-[76px_minmax(0,1fr)]">
        <aside className="flex h-screen flex-col border-r border-white/10 bg-[#050812]">
          <div className="flex h-[68px] items-center justify-center border-b border-white/10">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-sm font-black text-cyan-300">
              TI
            </div>
          </div>

          <nav className="flex-1 space-y-2 overflow-hidden px-2 py-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex h-11 items-center justify-center rounded-2xl border text-[10px] font-bold uppercase tracking-[0.12em] transition ${
                  item.active
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                    : "border-transparent bg-transparent text-zinc-600 hover:border-white/10 hover:bg-white/[0.03] hover:text-zinc-300"
                }`}
                title={item.label}
              >
                {item.code}
              </Link>
            ))}
          </nav>

          <div className="border-t border-white/10 p-2">
            <div
              className={`h-3 w-full rounded-full ${
                bridge.health === "OK" ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
          </div>
        </aside>

        <section className="grid h-screen min-w-0 grid-rows-[68px_minmax(0,1fr)] overflow-hidden">
          <header className="flex min-w-0 items-center justify-between border-b border-white/10 bg-[#050812]/95 px-4">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.36em] text-cyan-300">
                Portföy Yönetim Merkezi
              </div>
              <div className="mt-1 truncate text-xs text-zinc-500">
                {source} · {loading ? "Canlı katman yükleniyor..." : "Canlı veri hazır"} · EMA100 PRO · {bridge.lastAction}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusPill label="Mode" value={bridge.mode} tone="cyan" />
              <StatusPill label="Bridge" value={bridge.health} tone="good" />
              <StatusPill label="Open" value={String(positions.length)} tone="warn" />
              <StatusPill label="Signals" value={String(signals.length)} tone="neutral" />
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
