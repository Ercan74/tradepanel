"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menu = [
  { href: "/dashboard", label: "Dashboard", icon: "◆" },
  { href: "/open-positions", label: "Positions", icon: "●" },
  { href: "/closed-trades", label: "Closed Trades", icon: "■" },
  { href: "/pnl-report", label: "Analytics / PnL", icon: "▲" },
  { href: "/risk-management", label: "Risk Desk", icon: "●" },
  { href: "/strategy-performance", label: "Strategy Lab", icon: "◆" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function TradeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return