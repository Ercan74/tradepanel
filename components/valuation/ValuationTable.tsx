"use client";

import { useState } from "react";
import type { ValResult } from "@/lib/valuation";

export type ValRow = { r: ValResult; held: boolean; histPe: number | null };

function fmt(n: number | null | undefined, d = 2): string {
  return n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function pct(n: number | null | undefined, d = 0): string {
  return n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
}
function verdictCls(v: ValResult["verdict"]): string {
  switch (v) {
    case "İSKONTOLU": return "text-emerald-300 border-emerald-400/30 bg-emerald-400/10";
    case "PRİMLİ": return "text-rose-300 border-rose-400/30 bg-rose-400/10";
    case "ADİL": return "text-amber-300 border-amber-400/30 bg-amber-400/10";
    case "BAĞLAM": return "text-sky-300 border-sky-400/30 bg-sky-400/10";
    default: return "text-slate-400 border-white/10 bg-white/5";
  }
}
function tmplBadge(t: string): { dot: string; label: string } {
  if (t === "bank") return { dot: "bg-emerald-400", label: "banka/finansal · Justified P/B" };
  if (t === "holding") return { dot: "bg-slate-500", label: "holding · NAV" };
  return { dot: "bg-sky-400", label: "sanayi · çarpan bağlamı (hüküm yok)" };
}

// Sıralanabilir kolonlar + her satırdan değeri çıkaran erişimci.
type SortKey = "symbol" | "price" | "pb" | "pe" | "roe" | "evEbitda" | "histPe" | "upside" | "verdict";
const VERDICT_RANK: Record<string, number> = {
  "İSKONTOLU": 6, "ADİL": 5, "BAĞLAM": 4, "PRİMLİ": 3, "NAV-GEREKLİ": 2, "VERİ-EKSİK": 1,
};
function sortVal(row: ValRow, key: SortKey): number | string | null {
  const r = row.r;
  switch (key) {
    case "symbol": return r.symbol;
    case "price": return r.price;
    case "pb": return r.pb;
    case "pe": return r.pe;
    case "roe": return r.roe;
    case "evEbitda": return r.evEbitda != null && r.evEbitda >= 0.1 ? r.evEbitda : null;
    case "histPe": return row.histPe;
    case "upside": return r.upsidePct;
    case "verdict": return VERDICT_RANK[r.verdict] ?? 0;
  }
}

function Row({ r, held, histPe }: ValRow) {
  const b = tmplBadge(r.template);
  const histCls =
    histPe != null && r.pe != null && r.pe > 0
      ? r.pe < histPe * 0.85 ? "text-emerald-300" : r.pe > histPe * 1.15 ? "text-rose-300" : "text-slate-400"
      : "text-slate-500";
  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.03]">
      <td className="py-2 pl-3 pr-2 font-semibold text-slate-200">
        <span className="inline-flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${b.dot}`} title={b.label} />
          {r.symbol}
          {held && <span className="rounded bg-cyan-400/10 px-1 text-[10px] text-cyan-300">portföy</span>}
        </span>
      </td>
      <td className="px-2 text-right tabular-nums text-slate-300">{fmt(r.price)}</td>
      <td className="px-2 text-right tabular-nums text-slate-400">{fmt(r.pb)}</td>
      <td className="px-2 text-right tabular-nums text-slate-400">{fmt(r.pe, 1)}</td>
      <td className="px-2 text-right tabular-nums text-slate-400">{r.roe != null ? `${(r.roe * 100).toFixed(0)}%` : "—"}</td>
      <td className="px-2 text-right tabular-nums text-slate-400">
        {r.evEbitda != null && r.evEbitda >= 0.1
          ? <span>{fmt(r.evEbitda, 1)}×{r.peerMedian != null && <span className="text-slate-600"> / {fmt(r.peerMedian, 1)}</span>}</span>
          : "—"}
      </td>
      <td className={`px-2 text-right tabular-nums ${histCls}`} title="Anlık F/K vs kendi 6ay–2yıl medyanı (yeşil=kendine göre ucuz)">
        {histPe != null ? fmt(histPe, 1) : "—"}
      </td>
      <td className="px-2 text-right tabular-nums font-semibold text-slate-200">{fmt(r.fairBase)}</td>
      <td className="px-2 text-right tabular-nums text-slate-500">{r.fairLow != null ? `${fmt(r.fairLow)}–${fmt(r.fairHigh)}` : "—"}</td>
      <td className={`px-2 text-right tabular-nums font-bold ${r.upsidePct == null ? "text-slate-500" : r.upsidePct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(r.upsidePct)}</td>
      <td className="px-2 pr-3 text-right">
        <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${verdictCls(r.verdict)}`}>{r.verdict}</span>
      </td>
    </tr>
  );
}

// Tıklanabilir başlık: aktif kolonu ok ile gösterir; aynı kolona tıklayınca yön döner.
function Th({ label, k, sort, setSort, align = "right", title }: {
  label: string; k: SortKey; sort: { key: SortKey; dir: "asc" | "desc" };
  setSort: (s: { key: SortKey; dir: "asc" | "desc" }) => void; align?: "left" | "right"; title?: string;
}) {
  const active = sort.key === k;
  const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "";
  return (
    <th
      title={title}
      onClick={() => setSort({ key: k, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
      className={`cursor-pointer select-none px-2 ${align === "left" ? "py-2 pl-3 pr-2 text-left" : "text-right"} hover:text-slate-300 ${active ? "text-cyan-300" : ""}`}
    >
      {label}{arrow && <span className="ml-0.5 text-[9px]">{arrow}</span>}
    </th>
  );
}

export default function ValuationTable({ title, rows }: { title: string; rows: ValRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "upside", dir: "desc" });
  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => {
    const va = sortVal(a, sort.key), vb = sortVal(b, sort.key);
    const na = va == null, nb = vb == null;
    if (na && nb) return 0;
    if (na) return 1;   // null'lar yön fark etmeksizin sona
    if (nb) return -1;
    const cmp = typeof va === "string" ? va.localeCompare(vb as string, "tr") : (va as number) - (vb as number);
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const thProps = { sort, setSort };
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">{title} <span className="ml-1 text-[10px] font-normal normal-case text-slate-600">· başlığa tıkla → sırala</span></h2>
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-500">
              <Th label="Sembol" k="symbol" align="left" {...thProps} />
              <Th label="Fiyat" k="price" {...thProps} />
              <Th label="P/D" k="pb" {...thProps} />
              <Th label="F/K" k="pe" {...thProps} />
              <Th label="ROE" k="roe" {...thProps} />
              <Th label="EV/EBITDA" k="evEbitda" title="Kendi EV/EBITDA (sanayi)" {...thProps} />
              <Th label="F/K öz-tarih" k="histPe" title="Kendi 6ay–2yıl F/K medyanı (yeşil=anlık ucuz)" {...thProps} />
              <th className="px-2 text-right">Adil (baz)</th>
              <th className="px-2 text-right">Aralık</th>
              <Th label="Yukarı" k="upside" {...thProps} />
              <Th label="Verdikt" k="verdict" {...thProps} />
            </tr>
          </thead>
          <tbody>{sorted.map((x) => <Row key={x.r.symbol} r={x.r} held={x.held} histPe={x.histPe} />)}</tbody>
        </table>
      </div>
    </section>
  );
}
