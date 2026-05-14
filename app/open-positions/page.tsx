"use client";

import { useEffect, useState } from "react";
import TerminalShell from "../components/TerminalShell";
import StatusBadge from "../components/StatusBadge";
import { supabase } from "@/lib/supabase";

const fmt = (v: any) => Number(v || 0).toFixed(2);

export default function OpenPositionsPage() {
  const [rows, setRows] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.from("signals").select("*").eq("status", "OPEN").order("created_at", { ascending: false });
    setRows(data || []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <TerminalShell>
      <h1 className="mb-2 text-4xl font-black">Açık Pozisyonlar</h1>
      <p className="mb-6 text-sm text-slate-400">Canlı pozisyon, risk, hedef ve lifecycle görünümü.</p>

      <div className="rounded-2xl border border-slate-800 bg-[#0b1626] p-5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 text-xs uppercase tracking-widest text-slate-400">
            <tr><th className="py-3">Symbol</th><th>Side</th><th>Entry</th><th>Current</th><th>PnL</th><th>PnL %</th><th>SL</th><th>TP1</th><th>TP2</th><th>Life</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800 font-bold">
                <td className="py-4 text-base">{r.symbol}</td>
                <td className={r.side === "LONG" ? "text-emerald-300" : "text-red-300"}>{r.side}</td>
                <td>{fmt(r.entry_price || r.price)}</td>
                <td>{fmt(r.current_price)}</td>
                <td className={Number(r.pnl) >= 0 ? "text-emerald-300" : "text-red-300"}>{fmt(r.pnl)}</td>
                <td>{fmt(r.pnl_pct)}%</td>
                <td className="text-red-300">{fmt(r.sl_price)}</td>
                <td className="text-emerald-300">{fmt(r.tp1_price)}</td>
                <td className="text-emerald-300">{fmt(r.tp2_price)}</td>
                <td><StatusBadge value={r.lifecycle_status || r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TerminalShell>
  );
}