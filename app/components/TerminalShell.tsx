"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menu = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/open-positions", label: "Açık Pozisyonlar", icon: "●" },
  { href: "/closed-trades", label: "Kapalı İşlemler", icon: "■" },
  { href: "/pnl-report", label: "PnL Raporu", icon: "▧" },
  { href: "/risk-management", label: "Risk Desk", icon: "▲" },
  { href: "/strategy-performance", label: "Strategy Lab", icon: "◆" },
  { href: "/settings", label: "Ayarlar", icon: "⚙" },
];

export default function TerminalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-[#050912] text-white">
      <aside className="fixed left-0 top-0 h-screen w-[260px] border-r border-slate-800 bg-[#08111f] px-5 py-6">
        <div className="mb-9 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700/30 text-2xl">
            📊
          </div>
          <div>
            <div className="text-xl font-black leading-tight">TradePanel</div>
            <div className="text-xs font-semibold text-blue-300">Terminal Architecture v4</div>
          </div>
        </div>

        <nav className="space-y-1.5">
          {menu.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${
                  active
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-950/40"
                    : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                }`}
              >
                <span className="w-5 text-blue-300">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-slate-700 bg-[#0d1a2c] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>ENGINE</span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">LIVE</span>
          </div>
          <div className="mt-3 text-lg font-black text-emerald-300">BORSAPY</div>
          <div className="mt-2 text-xs leading-relaxed text-slate-400">
            Simulation OFF · Python Price Engine aktif.
          </div>
        </div>
      </aside>

      <section className="ml-[260px] min-h-screen px-8 py-7">{children}</section>
    </main>
  );
}