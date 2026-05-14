"use client";

import { useEffect, useMemo, useState } from "react";
import TradeShell from "../components/TradeShell";
import { supabase } from "@/lib/supabase";

export default function RiskManagementPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("signals").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data || []));
  }, []);

  const open = rows.filter(r => r.status === "OPEN");
  const rejected = rows.filter(r => r.status === "REJECTED");

  return (
    <TradeShell>
      <h1 className="mb-8 text-5xl font-black">Risk Yönetimi</h1>
      <div className="grid grid-cols-3 gap-6">
        <Box title="Açık Pozisyon" value={open.length} />
        <Box title="Rejected Sinyal" value={rejected.length} />
        <Box title="Aktif Long / Short" value={`${open.filter(r => r.side === "LONG").length} / ${open.filter(r => r.side === "SHORT").length}`} />
      </div>
      <div className="mt-8 rounded-3xl bg-[#0e1b2d] p-6 text-slate-300">
        Risk motoru: max position, duplicate prevention, cooldown ve exposure kontrolleri webhook tarafında uygulanır.
      </div>
    </TradeShell>
  );
}

function Box({ title, value }: any) {
  return <div className="rounded-3xl bg-[#0e1b2d] p-8"><div className="text-blue-200">{title}</div><div className="mt-4 text-4xl font-black">{value}</div></div>;
}