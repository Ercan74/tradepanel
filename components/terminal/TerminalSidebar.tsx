"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Tek kanonik nav listesi — tüm terminal sayfaları bu sidebar'ı kullanır.
// Kısaltmalar sabittir; slice ile üretim yok (Positions/Portfolio "PO"
// çakışması bu yüzden vardı).
const navItems = [
  { label: "Terminal", href: "/dashboard", code: "TE" },
  { label: "Positions", href: "/positions", code: "PO" },
  { label: "Portfolio", href: "/portfolio", code: "PF" },
  { label: "Signals", href: "/signals", code: "Sİ" },
  { label: "Haber", href: "/news", code: "HB" },
  { label: "Değerleme", href: "/valuation", code: "DĞ" },
  { label: "Analytics", href: "/analytics", code: "AN" },
  { label: "Replay", href: "/replay", code: "RE" },
  { label: "Risk", href: "/risk", code: "Rİ" },
  { label: "Settings", href: "/settings", code: "SE" },
];

type Props = {
  /** Alt durum çubuğu rengi: true = emerald (sağlıklı), false = amber */
  bridgeOk?: boolean;
};

export default function TerminalSidebar({ bridgeOk = true }: Props) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-[76px] shrink-0 flex-col border-r border-white/10 bg-[#050812]">
      <div className="flex h-[68px] items-center justify-center border-b border-white/10">
        <div className="grid h-10 w-10 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-sm font-black text-cyan-300">
          TI
        </div>
      </div>

      <nav className="flex-1 space-y-2 overflow-hidden px-2 py-4">
        {navItems.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex h-11 items-center justify-center rounded-2xl border text-[10px] font-bold uppercase tracking-[0.12em] transition ${
                active
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                  : "border-transparent text-zinc-600 hover:border-white/10 hover:bg-white/[0.03] hover:text-zinc-300"
              }`}
            >
              {item.code}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-2">
        <div className={`h-3 w-full rounded-full ${bridgeOk ? "bg-emerald-400" : "bg-amber-400"}`} />
      </div>
    </aside>
  );
}
