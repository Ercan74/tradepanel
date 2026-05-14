"use client";

import { useEffect, useMemo, useState } from "react";
import TradeShell from "../components/TradeShell";
import { supabase } from "@/lib/supabase";

export default function StrategyPerformancePage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("signals").select("*").eq("status", "CLOSED").order("closed_at", { ascending: false }).then(({ data }) => setRows(data || []));
  }, []);

  const grouped = useMemo(() => {
    const map: any = {};
    rows.forEach(r => {
      const key = r.strategy_tag || r.strategyTag || r.strategy || "UNKNOWN";
      if (!map[key]) map[key] = { strategy: key, trades: 0, pnl: 0, wins: 0, best: null, worst: null };
      const pnl = Number(r.pnl || 0);
      map[key].trades++;
      map[key].pnl += pnl;
      if (pnl > 0) map[key].wins++;
      if (!map[key].best || pnl > map[key].best.pnl) map[key].best = { symbol: r.symbol, pnl };
      if (!map[key].worst || pnl < map[key].worst.pnl) map[key].worst = { symbol: r.symbol, pnl };
    });
    return Object.values(map);
  }, [rows]);

  return (
    <TradeShell>
      <h1 className="mb-8 text-5xl font-black">Strateji / İndikatör Performansı</h1>
      <div className="rounded-3xl bg-[#0e1b2d] p-6">
        <table className="w-full text-left">
          <thead className="text-blue-200">
            <tr><th>Strategy</th><th>Trades</th><th>Total PnL</th><th>Win Rate</th><th>Best Symbol</th><th>Worst Symbol</th></tr>
          </thead>
          <tbody>
            {grouped.map((g: any) => (
              <tr key={g.strategy} className="border-t border-slate-800 text-lg font-bold">
                <td className="py-4">{g.strategy}</td>
                <td>{g.trades}</td>
                <td className={g.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>{g.pnl.toFixed(2)}</td>
                <td>{g.trades ? ((g.wins / g.trades) * 100).toFixed(2) : "0.00"}%</td>
                <td>{g.best?.symbol} / {g.best?.pnl?.toFixed(2)}</td>
                <td>{g.worst?.symbol} / {g.worst?.pnl?.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TradeShell>
  );
}