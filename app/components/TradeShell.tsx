"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menu = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/open-positions", label: "Açık Pozisyonlar" },
  { href: "/closed-trades", label: "Kapalı İşlemler" },
  { href: "/pnl-report", label: "PnL Raporu" },
  { href: "/risk-management", label: "Risk Yönetimi" },
  { href: "/strategy-performance", label: "Strateji Performansı" },
  { href: "/settings", label: "Ayarlar" },
];

export default function TradeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-[#050b14] text-white">
      <aside className="fixed left-0 top-0 h-screen w-[280px] border-r border-slate-800 bg-[#0b1626] p-6">
        <div className="mb-12 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-900 text-3xl">
            📊
          </div>
          <div>
            <div className="text-2xl font-black">TradePanel</div>
            <div className="text-sm text-blue-300">Command Center v3</div>
          </div>
        </div>

        <nav className="space-y-3">
          {menu.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-2xl px-5 py-4 font-bold transition ${
                  active
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40"
                    : "text-blue-200 hover:bg-slate-800"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-8 left-6 right-6 rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
          <div className="text-sm text-slate-400">Engine Mode</div>
          <div className="mt-2 text-xl font-black text-emerald-400">LIVE BORSAPY</div>
          <div className="mt-3 text-sm text-slate-400">
            Simulation kapalı. Fiyat kaynağı Python Price Engine.
          </div>
        </div>
      </aside>

      <section className="ml-[280px] min-h-screen p-10">{children}</section>
    </main>
  );
}