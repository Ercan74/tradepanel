"use client";

import { useEffect, useState } from "react";
import TradeShell from "../components/TradeShell";
import { supabase } from "@/lib/supabase";

export default function ClosedTradesPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("signals").select("*").eq("status", "CLOSED").order("closed_at", { ascending: false }).then(({ data }) => setRows(data || []));
  }, []);

  return (
    <TradeShell>
      <h1 className="mb-8 text-5xl font-black">Kapalı İşlemler</h1>
      <div className="rounded-3xl bg-[#0e1b2d] p-6">
        <table className="w-full text-left">
          <thead className="text-blue-200">
            <tr><th>Symbol</th><th>Side</th><th>Entry</th><th>Close</th><th>PnL</th><th>PnL %</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-800 text-lg font-bold">
                <td className="py-4">{r.symbol}</td><td>{r.side}</td><td>{r.entry_price || r.price}</td><td>{r.close_price}</td><td>{r.pnl}</td><td>{r.pnl_pct}%</td><td>{r.close_reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TradeShell>
  );
}