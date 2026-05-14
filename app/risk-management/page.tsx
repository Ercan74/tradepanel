"use client";

import { useEffect, useMemo, useState } from "react";
import TerminalShell from "../components/TerminalShell";
import MetricCard from "../components/MetricCard";
import { supabase } from "@/lib/supabase";

const fmt = (v: any) => Number(v || 0).toFixed(2);

export default function RiskManagementPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("signals").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data || []));
  }, []);

  const stats = useMemo(() => {
    const open = rows.filter(r => r.status === "OPEN");
    const rejected = rows.filter(r => r.status === "REJECTED");
    const long = open.filter(r => r.side === "LONG");
    const short = open.filter(r => r.side === "SHORT");
    const openPnl = open.reduce((a, r) => a + Number(r.pnl || 0), 0);
    const capitalAtRisk = open.reduce((a, r) => {
      const entry = Number(r.entry_price || r.price || 0);
      const sl = Number(r.sl_price || 0);
      if (!entry || !sl) return a;
      return a + Math.abs(entry - sl);
    }, 0);
    return { open, rejected, long, short, openPnl, capitalAtRisk };
  }, [rows]);

  const rejectedByReason = useMemo(() => {
    const m: any = {};
    stats.rejected.forEach(r => {
      const k = r.reject_reason || "UNKNOWN";
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m);
  }, [stats.rejected]);

  return (
    <TerminalShell>
      <h1 className="mb-2 text-4xl font-black">Risk Desk</h1>
      <p className="mb-6 text-sm text-slate-400">Exposure, concentration, rejection analytics ve açık risk görünümü.</p>

      <div className="mb-6 grid grid-cols-5 gap-4">
        <MetricCard title="Open Positions" value={stats.open.length} tone="blue" />
        <MetricCard title="Long / Short" value={`${stats.long.length} / ${stats.short.length}`} />
        <MetricCard title="Open PnL" value={fmt(stats.openPnl)} tone={stats.openPnl >= 0 ? "green" : "red"} />
        <MetricCard title="Capital At Risk" value={fmt(stats.capitalAtRisk)} tone="yellow" />
        <MetricCard title="Rejected Signals" value={stats.rejected.length} tone="red" />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <section className="rounded-2xl border border-slate-800 bg-[#0b1626] p-5">
          <h2 className="mb-4 text-xl font-black">Open Risk Map</h2>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-widest text-slate-400">
              <tr><th className="py-3">Symbol</th><th>Side</th><th>Entry</th><th>SL</th><th>PnL</th><th>Life</th></tr>
            </thead>
            <tbody>
              {stats.open.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-800 font-bold">
                  <td className="py-4">{r.symbol}</td><td>{r.side}</td><td>{fmt(r.entry_price || r.price)}</td><td className="text-red-300">{fmt(r.sl_price)}</td><td>{fmt(r.pnl)}</td><td>{r.lifecycle_status || "OPEN"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0b1626] p-5">
          <h2 className="mb-4 text-xl font-black">Rejected Signal Analytics</h2>
          <div className="space-y-3">
            {rejectedByReason.map(([reason, count]: any) => (
              <div key={reason} className="flex justify-between rounded-xl bg-slate-800/60 p-4 font-bold">
                <span className="text-slate-300">{reason}</span>
                <span className="text-red-300">{count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </TerminalShell>
  );
}