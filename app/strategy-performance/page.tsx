"use client";

import { useEffect, useMemo, useState } from "react";
import TerminalShell from "../components/TerminalShell";
import MetricCard from "../components/MetricCard";
import { supabase } from "@/lib/supabase";

const fmt = (v: any) => Number(v || 0).toFixed(2);

export default function StrategyPerformancePage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("signals").select("*").eq("status", "CLOSED").order("closed_at", { ascending: false }).then(({ data }) => setRows(data || []));
  }, []);

  const grouped: any[] = useMemo(() => {
    const map: any = {};
    rows.forEach(r => {
      const key = r.strategy_tag || r.strategyTag || r.strategy || "UNKNOWN";
      if (!map[key]) map[key] = { strategy: key, trades: 0, pnl: 0, wins: 0, losses: 0, best: null, worst: null, symbols: {} };
      const pnl = Number(r.pnl || 0);
      map[key].trades++;
      map[key].pnl += pnl;
      pnl > 0 ? map[key].wins++ : map[key].losses++;
      if (!map[key].best || pnl > map[key].best.pnl) map[key].best = { symbol: r.symbol, pnl };
      if (!map[key].worst || pnl < map[key].worst.pnl) map[key].worst = { symbol: r.symbol, pnl };
      map[key].symbols[r.symbol] = (map[key].symbols[r.symbol] || 0) + pnl;
    });
    return Object.values(map).sort((a: any, b: any) => b.pnl - a.pnl);
  }, [rows]);

  const bestStrategy = grouped[0];

  return (
    <TerminalShell>
      <h1 className="mb-2 text-4xl font-black">Strategy Lab</h1>
      <p className="mb-6 text-sm text-slate-400">Strateji, indikatör, sembol ve kalite skor performans merkezi.</p>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <MetricCard title="Strategies" value={grouped.length} tone="blue" />
        <MetricCard title="Best Strategy" value={bestStrategy?.strategy || "-"} tone="green" />
        <MetricCard title="Best Strategy PnL" value={bestStrategy ? fmt(bestStrategy.pnl) : "-"} tone="green" />
        <MetricCard title="Closed Trades" value={rows.length} />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#0b1626] p-5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 text-xs uppercase tracking-widest text-slate-400">
            <tr><th className="py-3">Strategy</th><th>Trades</th><th>Total PnL</th><th>Win Rate</th><th>Best Symbol</th><th>Worst Symbol</th></tr>
          </thead>
          <tbody>
            {grouped.map((g: any) => (
              <tr key={g.strategy} className="border-b border-slate-800 font-bold">
                <td className="py-4">{g.strategy}</td>
                <td>{g.trades}</td>
                <td className={g.pnl >= 0 ? "text-emerald-300" : "text-red-300"}>{fmt(g.pnl)}</td>
                <td>{g.trades ? fmt((g.wins / g.trades) * 100) : "0.00"}%</td>
                <td className="text-emerald-300">{g.best?.symbol} / {fmt(g.best?.pnl)}</td>
                <td className="text-red-300">{g.worst?.symbol} / {fmt(g.worst?.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TerminalShell>
  );
}