"use client";

import TradeShell from "../components/TradeShell";

export default function SettingsPage() {
  return (
    <TradeShell>
      <h1 className="mb-8 text-5xl font-black">Ayarlar</h1>
      <div className="rounded-3xl bg-[#0e1b2d] p-8">
        <div className="text-2xl font-black text-emerald-400">Engine Mode: LIVE BORSAPY</div>
        <div className="mt-4 text-slate-300">
          Simulation engine kapalı. Price Engine lokal PC üzerinde çalışıyor.
        </div>
      </div>
    </TradeShell>
  );
}