"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Trade Replay — mutabakata hazır zaman akışı.
// useTradingIntelligence'tan bağımsız, kendi sayfalamalı sorgusunu yapar:
// positions 50'şer kayıt ("daha fazla yükle"), her pozisyonun altında
// position_events timeline'ı (TP1, trailing, stop olayları).

const PAGE_SIZE = 50;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

type PositionRow = Record<string, any>;
type EventRow = Record<string, any>;

export default function ReplayTimeline() {
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [eventsByPosition, setEventsByPosition] = useState<Record<string, EventRow[]>>({});
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageRef = useRef(0);

  const loadPage = useCallback(async (pageIndex: number) => {
    if (!supabase) return;
    setLoading(true);
    try {
      const from = pageIndex * PAGE_SIZE;
      const { data: positions } = await supabase
        .from("positions")
        .select(
          "id,client_order_id,close_client_order_id,symbol,side,status,entry_price,exit_price,close_price,current_price,stop_price,trailing_stop_price,sl_price,tp1_price,tp_price,pnl_amount,pnl_pct,close_reason,strategy_tag,opened_at,closed_at,created_at"
        )
        .order("opened_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      const batch = positions ?? [];
      const ids = batch.map((p) => p.id);

      if (ids.length > 0) {
        const { data: events } = await supabase
          .from("position_events")
          .select("position_id,event_type,price,message,created_at")
          .in("position_id", ids)
          .order("created_at", { ascending: true });

        setEventsByPosition((prev) => {
          const next = { ...prev };
          (events ?? []).forEach((e) => {
            const key = String(e.position_id);
            (next[key] = next[key] ?? []).push(e);
          });
          return next;
        });
      }

      setRows((prev) => (pageIndex === 0 ? batch : [...prev, ...batch]));
      setHasMore(batch.length === PAGE_SIZE);
      pageRef.current = pageIndex;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  if (!supabase) {
    return <div className="text-xs text-zinc-500">Supabase bağlantısı yok.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-2">
          {rows.map((p) => {
            const ref = p.client_order_id ?? String(p.id).slice(0, 8).toUpperCase();
            const status = String(p.status ?? "").toUpperCase();
            const exit = p.exit_price ?? p.close_price;
            const events = eventsByPosition[String(p.id)] ?? [];
            const expanded = expandedId === p.id;
            const pnlPct = Number(p.pnl_pct ?? 0);

            return (
              <div key={p.id} className="rounded-xl border border-white/5 bg-white/[0.02]">
                <button
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                  className="grid w-full grid-cols-[150px_minmax(120px,1fr)_64px_repeat(4,minmax(80px,1fr))_90px] items-center gap-3 px-3 py-2 text-left transition hover:bg-white/[0.03]"
                >
                  <SmallBlock label="REF" value={ref} mono />
                  <div>
                    <div className="font-black">{p.symbol}</div>
                    <div className="text-[10px] text-zinc-500">
                      {fmtDate(p.opened_at ?? p.created_at)}
                      {p.closed_at ? ` → ${fmtDate(p.closed_at)}` : ""}
                    </div>
                  </div>
                  <span className={p.side === "LONG" ? "text-emerald-300 text-xs font-black" : "text-red-300 text-xs font-black"}>
                    {p.side}
                  </span>
                  <SmallBlock label="ENTRY" value={fmtMoney(p.entry_price)} />
                  <SmallBlock label={status === "OPEN" ? "CURRENT" : "EXIT"} value={fmtMoney(status === "OPEN" ? p.current_price : exit)} />
                  <SmallBlock label="PNL %" value={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`} tone={pnlPct >= 0 ? "good" : "bad"} />
                  <SmallBlock label="DURUM" value={status} tone={status === "OPEN" ? "good" : "neutral"} />
                  <span className="text-right text-[10px] text-zinc-500">
                    {events.length} olay {expanded ? "▲" : "▼"}
                  </span>
                </button>

                {expanded && (
                  <div className="border-t border-white/5 px-4 py-2">
                    {events.length === 0 ? (
                      <div className="py-1 text-[11px] text-zinc-600">Bu pozisyon için kayıtlı olay yok.</div>
                    ) : (
                      <div className="space-y-1 py-1">
                        {events.map((e, i) => (
                          <div key={i} className="grid grid-cols-[130px_140px_90px_minmax(0,1fr)] gap-3 text-[11px]">
                            <span className="text-zinc-500">{fmtDateTime(e.created_at)}</span>
                            <span className={eventTone(e.event_type)}>{String(e.event_type ?? "-")}</span>
                            <span className="text-zinc-300">{fmtMoney(e.price)}</span>
                            <span className="truncate text-zinc-500">{e.message ?? ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {p.close_client_order_id && (
                      <div className="pb-1 pt-1 text-[10px] text-zinc-600">
                        Kapanış REF: <span className="font-mono">{p.close_client_order_id}</span>
                        {p.close_reason ? ` · ${p.close_reason}` : ""}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {rows.length === 0 && !loading && (
          <div className="py-8 text-center text-xs text-zinc-600">Kayıt bulunamadı.</div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-zinc-600">{rows.length} kayıt yüklendi</span>
        {hasMore && (
          <button
            onClick={() => loadPage(pageRef.current + 1)}
            disabled={loading}
            className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300 transition hover:bg-cyan-400/20 disabled:opacity-40"
          >
            {loading ? "Yükleniyor..." : "Daha fazla yükle"}
          </button>
        )}
      </div>
    </div>
  );
}

function SmallBlock({ label, value, tone, mono }: { label: string; value: string; tone?: "good" | "bad" | "neutral"; mono?: boolean }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : "text-zinc-200";
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-600">{label}</div>
      <div className={`text-xs font-bold ${color} ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function eventTone(type: unknown): string {
  const t = String(type ?? "").toUpperCase();
  if (t === "STOP_LOSS" || t === "TRAILING_STOP") return "text-red-300 font-bold"; // stop tetiklendi
  if (t.includes("TP1")) return "text-emerald-300 font-bold";
  if (t.includes("TRAILING")) return "text-cyan-300"; // TRAILING_STOP_MOVED vb.
  if (t.includes("OPENED") || t.includes("REVERSAL")) return "text-zinc-200 font-bold";
  return "text-zinc-400";
}

function fmtMoney(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(v: unknown): string {
  if (!v) return "-";
  return new Date(String(v)).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fmtDateTime(v: unknown): string {
  if (!v) return "-";
  return new Date(String(v)).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
