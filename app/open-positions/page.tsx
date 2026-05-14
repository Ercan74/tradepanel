"use client";

import { useEffect, useState } from "react";
import TradeShell from "../components/TradeShell";
import { supabase } from "@/lib/supabase";

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
    <TradeShell>
      <h1 className="mb-8 text-5xl font-black">Açık Pozisyonlar</h1>
      <Table rows={rows} />
    </TradeShell>
  );
}

function Table({ rows }: any) {
  return (
    <div className="rounded-3xl bg-[#0e1b2d] p-6">
      <table className="w-full text-left">
        <thead className="text-blue-200">
          <tr><th>Symbol</th><th>Side</th><th>Entry</th><th>Current</th><th>PnL</th><th>PnL %</th><th>Life</th></tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} className="border-t border-slate-800 text-lg font-bold">
              <td className="py-4">{r.symbol}</td><td>{r.side}</td><td>{r.entry_price || r.price}</td><td>{r.current_price}</td><td>{r.pnl}</td><td>{r.pnl_pct}%</td><td>{r.lifecycle_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}