"use client";

import { useEffect, useMemo, useState } from "react";
import TradeShell from "../components/TradeShell";
import { supabase } from "@/lib/supabase";

type Signal = any;

function n(v: any, d = 2) {
  const x = Number(v || 0);
  return x.toFixed(d);
}

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
  const openPnl = open.reduce((a, s) => a + Number(s.pnl || 0), 0);
  const closedPnl = closed.reduce((a, s) => a + Number(s.pnl || 0), 0);
  const wins = closed.filter((s) => Number(s.pnl || 0) > 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;
  const recentClosed = closed.slice(0, 4);

  return (
    <TradeShell>
      <div className="mb-10 flex items-start justify-between">
        <div>
          <div className="mb-4 inline-flex rounded-full border border-blue-800 bg-blue-950 px-4 py-2 text-sm font-bold text-blue-300">
            Live Position Lifecycle Engine
          </div>
          <h1 className="text-6xl font-black">TradePanel Dashboard</h1>
          <p className="mt-3 text-lg text-blue-200">
            Pozisyon, PnL, TP/SL, trailing ve strateji takip merkezi
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4">
          Son güncelleme: <b>{lastUpdate}</b>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-4 gap-6">
        <Card title="Açık Pozisyon" value={open.length} sub={`LONG ${open.filter(s => s.side === "LONG").length} / SHORT ${open.filter(s => s.side === "SHORT").length}`} />
        <Card title="Açık PnL" value={n(openPnl)} sub="Canlı PnL" green={openPnl >= 0} />
        <Card title="Kapalı PnL" value={n(closedPnl)} sub={`${closed.length} kapanmış işlem`} green={closedPnl >= 0} />
        <Card title="Win Rate" value={`${n(winRate)}%`} sub="Kapalı işlemler üzerinden" yellow />
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-8">
        <div className="rounded-3xl border border-slate-800 bg-[#0e1b2d] p-6">
          <div className="mb-6 flex items-center justify-between">
            <div className="rounded-2xl bg-emerald-600 px-8 py-4 text-xl font-black">
              Açık Pozisyonlar
            </div>
            <div className="rounded-2xl border border-slate-700 px-6 py-4 font-bold">
              Source: BORSAPY
            </div>
          </div>

          <table className="w-full text-left">
            <thead className="text-blue-200">
              <tr>
                <th className="py-3">SYMBOL</th>
                <th>SIDE</th>
                <th>ENTRY</th>
                <th>CURRENT</th>
                <th>PNL</th>
                <th>PNL %</th>
                <th>SL</th>
                <th>TP1</th>
                <th>TP2</th>
                <th>TRAILING</th>
              </tr>
            </thead>
            <tbody>
              {open.map((s) => (
                <tr key={s.id} className="border-t border-slate-800 text-lg font-bold">
                  <td className="py-5">{s.symbol}</td>
                  <td className={s.side === "LONG" ? "text-emerald-400" : "text-red-400"}>{s.side}</td>
                  <td>{n(s.entry_price || s.price)}</td>
                  <td>{n(s.current_price)}</td>
                  <td className={Number(s.pnl) >= 0 ? "text-emerald-400" : "text-red-400"}>{n(s.pnl)}</td>
                  <td className={Number(s.pnl_pct) >= 0 ? "text-emerald-400" : "text-red-400"}>{n(s.pnl_pct)}%</td>
                  <td className="text-red-300">{n(s.sl_price)}</td>
                  <td className="text-emerald-300">{n(s.tp1_price)}</td>
                  <td className="text-emerald-300">{n(s.tp2_price)}</td>
                  <td className="text-cyan-300">{n(s.trailing_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-[#0e1b2d] p-6">
          <h2 className="mb-6 text-3xl font-black">Son Kapanan İşlemler</h2>
          <div className="space-y-4">
            {recentClosed.map((s) => (
              <div key={s.id} className="rounded-2xl bg-slate-800 p-5">
                <div className="flex justify-between text-2xl font-black">
                  <span>{s.symbol}</span>
                  <span className={Number(s.pnl) >= 0 ? "text-emerald-400" : "text-red-400"}>{n(s.pnl)}</span>
                </div>
                <div className="mt-2 text-sm text-cyan-300">{s.close_reason || "-"}</div>
                <div className="text-sm text-slate-400">{n(s.pnl_pct)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TradeShell>
  );
}

function Card({ title, value, sub, green, yellow }: any) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-[#0b1626] p-7">
      <div className="text-lg text-blue-200">{title}</div>
      <div className={`mt-5 text-4xl font-black ${yellow ? "text-yellow-300" : green ? "text-emerald-400" : "text-red-300"}`}>
        {value}
      </div>
      <div className="mt-3 text-sm text-slate-400">{sub}</div>
    </div>
  );
}