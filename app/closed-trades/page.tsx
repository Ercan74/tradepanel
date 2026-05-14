"use client";

import { useEffect, useState } from "react";
import TerminalShell from "../components/TerminalShell";
import { supabase } from "@/lib/supabase";

const fmt = (v: any) => Number(v || 0).toFixed(2);

export default function ClosedTradesPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("signals").select("*").eq("status", "CLOSED").order("closed_at", { ascending: false }).then(({ data }) => setRows(data || []));
  }, []);

  return (
    <TerminalShell>
      <h1 className="mb-2 text-4xl font-black">Kapalı İşlemler</h1>
      <p className="mb-6 text-sm text-slate-400">Gerçekleşmiş PnL, kapanış nedeni ve trade geçmişi.</p>

      <div className="rounded-2xl border border-slate-800 bg-[#0b1626] p-5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 text-xs uppercase tracking-widest text-slate-400">
            <tr><th className="py-3">Symbol</th><th>Side</th><th>Strategy</th><th>Entry</th><th>Close</th><th>PnL</th><th>PnL %</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800 font-bold">
                <td className="py-4 text-base">{r.symbol}</td>
                <td>{r.side}</td>
                <td>{r.strategy_tag || "-"}</td>
                <td>{fmt(r.entry_price || r.price)}</td>
                <td>{fmt(r.close_price)}</td>
                <td className={Number(r.pnl) >= 0 ? "text-emerald-300" : "text-red-300"}>{fmt(r.pnl)}</td>
                <td>{fmt(r.pnl_pct)}%</td>
                <td className="text-cyan-300">{r.close_reason || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TerminalShell>
  );
}