"use client";

import { useEffect, useMemo, useState } from "react";
import TradeShell from "../components/TradeShell";
import { supabase } from "@/lib/supabase";

export default function PnlReportPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("signals").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data || []));
  }, []);

  const stats = useMemo(() => {
    const closed = rows.filter(r => r.status === "CLOSED");
    const total = closed.reduce((a, r) => a + Number(r.pnl || 0), 0);
    const win = closed.filter(r => Number(r.pnl || 0) > 0).length;
    const loss = closed.length - win;
    return { closed: closed.length, total, win, loss, winRate: closed.length ? win / closed.length * 100 : 0 };
  }, [rows]);

  return (
    <TradeShell>
      <h1 className="mb-8 text-5xl font-black">PnL Raporu</h1>
      <div className="grid grid-cols-4 gap-6">
        <Card t="Kapalı İşlem" v={stats.closed} />
        <Card t="Toplam PnL" v={stats.total.toFixed(2)} />
        <Card t="Kazanan / Kaybeden" v={`${stats.win} / ${stats.loss}`} />
        <Card t="Win Rate" v={`${stats.winRate.toFixed(2)}%`} />
      </div>
    </TradeShell>
  );
}

function Card({ t, v }: any) {
  return <div className="rounded-3xl bg-[#0e1b2d] p-8"><div className="text-blue-200">{t}</div><div className="mt-4 text-4xl font-black">{v}</div></div>;
}