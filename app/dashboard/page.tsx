"use client";

import { useEffect, useMemo, useState } from "react";
import TerminalShell from "../components/TerminalShell";
import MetricCard from "../components/MetricCard";
import StatusBadge from "../components/StatusBadge";
import { supabase } from "@/lib/supabase";

type Signal = any;

const fmt = (v: any, d = 2) => Number(v || 0).toFixed(d);

export default function DashboardPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [lastUpdate, setLastUpdate] = useState("");

  async function load() {
    const { data } = await supabase
      .from("signals")
      .select("*")
      .order("created_at", { ascending: false });

    setSignals(data || []);
    setLastUpdate(new Date().toLocaleTimeString("tr-TR"));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const open = signals.filter((s) => s.status === "OPEN");
  const closed = signals.filter((s) => s.status === "CLOSED");
  const rejected = signals.filter((s) => s.status === "REJECTED");

  const openPnl = open.reduce((a, s) => a + Number(s.pnl || 0), 0);
  const closedPnl = closed.reduce((a, s) => a + Number(s.pnl || 0), 0);
  const wins = closed.filter((s) => Number(s.pnl || 0) > 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;

  const topWinner = closed.slice().sort((a, b) => Number(b.pnl || 0) - Number(a.pnl || 0))[0];
  const worstTrade = closed.slice().sort((a, b) => Number(a.pnl || 0) - Number(b.pnl || 0))[0];

  return (
    <TerminalShell>
      <Header title="TradePanel Command Center" subtitle="Live positions · risk · lifecycle · strategy analytics" lastUpdate={lastUpdate} />

      <div className="mb-6 grid grid-cols-5 gap-4">
        <MetricCard title="Open Positions" value={open.length} sub={`LONG ${open.filter(s => s.side === "LONG").length} / SHORT ${open.filter(s => s.side === "SHORT").length}`} tone="blue" />
        <MetricCard title="Open PnL" value={fmt(openPnl)} sub="Unrealized" tone={openPnl >= 0 ? "green" : "red"} />
        <MetricCard title="Closed PnL" value={fmt(closedPnl)} sub={`${closed.length} closed trades`} tone={closedPnl >= 0 ? "green" : "red"} />
        <MetricCard title="Win Rate" value={`${fmt(winRate)}%`} sub="Closed trades" tone="yellow" />
        <MetricCard title="Rejected" value={rejected.length} sub="Risk gate filtered" tone="red" />
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-5">
        <section className="rounded-2xl border border-slate-800 bg-[#0b1626] p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-xl font-black">Live Position Grid</div>
              <div className="text-xs text-slate-400">External Price Engine · BORSAPY · Simulation OFF</div>
            </div>
            <StatusBadge value="LIVE ENGINE" />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1050px] w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-xs uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="py-3">Symbol</th>
                  <th>Side</th>
                  <th>Strategy</th>
                  <th>Entry</th>
                  <th>Current</th>
                  <th>PnL</th>
                  <th>PnL %</th>
                  <th>SL</th>
                  <th>TP1</th>
                  <th>TP2</th>
                  <th>Trail</th>
                  <th>Life</th>
                </tr>
              </thead>
              <tbody>
                {open.map((s) => (
                  <tr key={s.id} className="border-b border-slate-800/70 font-bold">
                    <td className="py-4 text-base">{s.symbol}</td>
                    <td className={s.side === "LONG" ? "text-emerald-300" : "text-red-300"}>{s.side}</td>
                    <td className="text-slate-300">{s.strategy_tag || s.strategyTag || "-"}</td>
                    <td>{fmt(s.entry_price || s.price)}</td>
                    <td>{fmt(s.current_price)}</td>
                    <td className={Number(s.pnl) >= 0 ? "text-emerald-300" : "text-red-300"}>{fmt(s.pnl)}</td>
                    <td className={Number(s.pnl_pct) >= 0 ? "text-emerald-300" : "text-red-300"}>{fmt(s.pnl_pct)}%</td>
                    <td className="text-red-300">{fmt(s.sl_price)}</td>
                    <td className="text-emerald-300">{fmt(s.tp1_price)}</td>
                    <td className="text-emerald-300">{fmt(s.tp2_price)}</td>
                    <td className="text-cyan-300">{fmt(s.trailing_price)}</td>
                    <td><StatusBadge value={s.lifecycle_status || s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-5">
          <Panel title="Performance Snapshot">
            <Info label="Best Trade" value={topWinner ? `${topWinner.symbol} ${fmt(topWinner.pnl)}` : "-"} tone="green" />
            <Info label="Worst Trade" value={worstTrade ? `${worstTrade.symbol} ${fmt(worstTrade.pnl)}` : "-"} tone="red" />
            <Info label="Closed Trades" value={closed.length} />
            <Info label="Risk Rejections" value={rejected.length} />
          </Panel>

          <Panel title="Recent Closed">
            <div className="space-y-3">
              {closed.slice(0, 5).map((s) => (
                <div key={s.id} className="rounded-xl bg-slate-800/70 p-4">
                  <div className="flex justify-between text-lg font-black">
                    <span>{s.symbol}</span>
                    <span className={Number(s.pnl) >= 0 ? "text-emerald-300" : "text-red-300"}>{fmt(s.pnl)}</span>
                  </div>
                  <div className="mt-1 text-xs text-cyan-300">{s.close_reason || "-"}</div>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </TerminalShell>
  );
}

function Header({ title, subtitle, lastUpdate }: any) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <div className="mb-3 inline-flex rounded-full border border-blue-800 bg-blue-950/60 px-4 py-1.5 text-xs font-black text-blue-300">
          Live Position Lifecycle Engine
        </div>
        <h1 className="text-5xl font-black tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-blue-200">{subtitle}</p>
      </div>
      <div className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm">
        Last update: <b>{lastUpdate}</b>
      </div>
    </div>
  );
}

function Panel({ title, children }: any) {
  return <div className="rounded-2xl border border-slate-800 bg-[#0b1626] p-5"><h2 className="mb-4 text-xl font-black">{title}</h2>{children}</div>;
}

function Info({ label, value, tone }: any) {
  const color = tone === "green" ? "text-emerald-300" : tone === "red" ? "text-red-300" : "text-white";
  return <div className="mb-3 flex justify-between text-sm"><span className="text-slate-400">{label}</span><b className={color}>{value}</b></div>;
}