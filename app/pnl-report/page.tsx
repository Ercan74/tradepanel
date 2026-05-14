"use client";

import { useEffect, useMemo, useState } from "react";
import TerminalShell from "../components/TerminalShell";
import MetricCard from "../components/MetricCard";
import { supabase } from "@/lib/supabase";

const fmt = (v: any) => Number(v || 0).toFixed(2);

export default function PnlReportPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("signals").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data || []));
  }, []);

  const stats = useMemo(() => {
    const closed = rows.filter(r => r.status === "CLOSED");
    const total = closed.reduce((a, r) => a + Number(r.pnl || 0), 0);
    const wins = closed.filter(r => Number(r.pnl || 0) > 0);
    const losses = closed.filter(r => Number(r.pnl || 0) <= 0);
    const grossProfit = wins.reduce((a, r) => a + Number(r.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((a, r) => a + Number(r.pnl || 0), 0));
    return {
      closed: closed.length,
      total,
      winRate: closed.length ? wins.length / closed.length * 100 : 0,
      avgWin: wins.length ? grossProfit / wins.length : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
      profitFactor: grossLoss ? grossProfit / grossLoss : 0,
      best: closed.slice().sort((a, b) => Number(b.pnl || 0) - Number(a.pnl || 0))[0],
      worst: closed.slice().sort((a, b) => Number(a.pnl || 0) - Number(b.pnl || 0))[0],
    };
  }, [rows]);

  return (
    <TerminalShell>
      <h1 className="mb-2 text-4xl font-black">PnL Raporu</h1>
      <p className="mb-6 text-sm text-slate-400">Gerçekleşmiş kârlılık, edge ve trade kalitesi analizi.</p>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <MetricCard title="Total Closed PnL" value={fmt(stats.total)} tone={stats.total >= 0 ? "green" : "red"} />
        <MetricCard title="Win Rate" value={`${fmt(stats.winRate)}%`} tone="yellow" />
        <MetricCard title="Profit Factor" value={fmt(stats.profitFactor)} tone="blue" />
        <MetricCard title="Closed Trades" value={stats.closed} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <MetricCard title="Average Winner" value={fmt(stats.avgWin)} tone="green" />
        <MetricCard title="Average Loser" value={fmt(stats.avgLoss)} tone="red" />
        <MetricCard title="Best Trade" value={stats.best ? `${stats.best.symbol} ${fmt(stats.best.pnl)}` : "-"} tone="green" />
        <MetricCard title="Worst Trade" value={stats.worst ? `${stats.worst.symbol} ${fmt(stats.worst.pnl)}` : "-"} tone="red" />
      </div>
    </TerminalShell>
  );
}