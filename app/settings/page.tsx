"use client";

import TerminalShell from "../components/TerminalShell";

export default function SettingsPage() {
  return (
    <TerminalShell>
      <h1 className="mb-2 text-4xl font-black">Ayarlar</h1>
      <p className="mb-6 text-sm text-slate-400">Sistem modu ve entegrasyon durumu.</p>

      <div className="grid grid-cols-2 gap-5">
        <div className="rounded-2xl border border-slate-800 bg-[#0b1626] p-6">
          <div className="text-xs uppercase tracking-widest text-slate-400">Engine Mode</div>
          <div className="mt-3 text-3xl font-black text-emerald-300">LIVE BORSAPY</div>
          <p className="mt-3 text-sm text-slate-400">Simulation engine kapalı. Python Price Engine aktif.</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0b1626] p-6">
          <div className="text-xs uppercase tracking-widest text-slate-400">Next Layer</div>
          <div className="mt-3 text-3xl font-black text-blue-300">VPS Deployment</div>
          <p className="mt-3 text-sm text-slate-400">PC bağımsız 7/24 price engine çalıştırma aşaması.</p>
        </div>
      </div>
    </TerminalShell>
  );
}