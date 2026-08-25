import TerminalSidebar from "@/components/terminal/TerminalSidebar";
import { createClient } from "@supabase/supabase-js";
import { valuate, DEFAULT_ASSUMPTIONS, type FundRow, type ValResult, type HoldingNavInput, type StakeMktCap } from "@/lib/valuation";

export const dynamic = "force-dynamic";

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const A = DEFAULT_ASSUMPTIONS;

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
    default: return "text-slate-400 border-white/10 bg-white/5";
  }
}
function tmplBadge(t: string): { dot: string; label: string } {
  if (t === "bank") return { dot: "bg-emerald-400", label: "banka · doğrulandı" };
  if (t === "holding") return { dot: "bg-slate-500", label: "holding · NAV bekliyor" };
  return { dot: "bg-amber-400", label: "sanayi · taslak" };
}

function Row({ r, held }: { r: ValResult; held: boolean }) {
  const b = tmplBadge(r.template);
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
      <td className="px-2 text-right tabular-nums font-semibold text-slate-200">{fmt(r.fairBase)}</td>
      <td className="px-2 text-right tabular-nums text-slate-500">{r.fairLow != null ? `${fmt(r.fairLow)}–${fmt(r.fairHigh)}` : "—"}</td>
      <td className={`px-2 text-right tabular-nums font-bold ${r.upsidePct == null ? "text-slate-500" : r.upsidePct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(r.upsidePct)}</td>
      <td className="px-2 pr-3 text-right">
        <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${verdictCls(r.verdict)}`}>{r.verdict}</span>
      </td>
    </tr>
  );
}

function Table({ title, rows }: { title: string; rows: { r: ValResult; held: boolean }[] }) {
  if (!rows.length) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">{title}</h2>
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-2 pl-3 pr-2 text-left">Sembol</th>
              <th className="px-2 text-right">Fiyat</th>
              <th className="px-2 text-right">P/D</th>
              <th className="px-2 text-right">F/K</th>
              <th className="px-2 text-right">ROE</th>
              <th className="px-2 text-right">Adil (baz)</th>
              <th className="px-2 text-right">Aralık</th>
              <th className="px-2 text-right">Yukarı</th>
              <th className="px-2 pr-3 text-right">Verdikt</th>
            </tr>
          </thead>
          <tbody>{rows.map((x) => <Row key={x.r.symbol} r={x.r} held={x.held} />)}</tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ValuationPage() {
  let funds: FundRow[] = [];
  let period = "—";
  const priceMap = new Map<string, number>();
  const heldSet = new Set<string>();

  const sharesMap = new Map<string, number>();
  const navInputs = new Map<string, HoldingNavInput>();
  const liveSet = new Set<string>();

  if (supabase) {
    const [{ data: f }, { data: lp }, { data: pos }, { data: st }] = await Promise.all([
      supabase.from("fundamentals").select("*"),
      supabase.from("live_prices").select("symbol,last_price,change_pct"),
      supabase.from("positions").select("symbol").eq("status", "OPEN"),
      supabase.from("holding_stakes").select("holding_symbol,sub_ticker,stake_pct"),
    ]);
    funds = (f ?? []) as FundRow[];
    period = (f?.[0] as { period?: string } | undefined)?.period ?? "—";
    // Yalnız CANLI beslenen (change_pct dolu = Matriks aktif izleme listesi) değerlenir;
    // fiyatı olmayan/bayat hisse DĞ'de anlamsız (P/D-F/K-adil hesaplanamaz). İzleme
    // listesi büyürse liste otomatik genişler.
    for (const r of lp ?? []) {
      const row = r as { symbol: string; last_price: number; change_pct: number | null };
      priceMap.set(row.symbol, Number(row.last_price));
      if (row.change_pct != null) liveSet.add(row.symbol);
    }
    for (const p of pos ?? []) heldSet.add((p as { symbol: string }).symbol);
    for (const r of funds) if (r.shares != null) sharesMap.set(r.symbol, Number(r.shares));
    // holding_stakes → holding başına NAV girdisi (iştirak piyasa değeri = hisse × fiyat)
    for (const s of (st ?? []) as { holding_symbol: string; sub_ticker: string; stake_pct: number }[]) {
      const shares = sharesMap.get(s.sub_ticker);
      const px = priceMap.get(s.sub_ticker);
      const subMktCap = shares != null && px != null ? shares * px : null;
      const stake: StakeMktCap = { ticker: s.sub_ticker, stakePct: Number(s.stake_pct), subMktCap };
      const existing = navInputs.get(s.holding_symbol);
      if (existing) existing.stakes.push(stake);
      else navInputs.set(s.holding_symbol, { holdingShares: sharesMap.get(s.holding_symbol) ?? null, stakes: [stake] });
    }
  }

  // Yalnız canlı-verisi olan hisseleri değerle (fiyatı olmayanı gösterme).
  const results = funds
    .filter((f) => liveSet.has(f.symbol))
    .map((f) => ({
      r: valuate(f, priceMap.get(f.symbol) ?? null, A, navInputs.get(f.symbol)),
      held: heldSet.has(f.symbol),
    }));
  // sıralama: yukarı potansiyele göre; değeri olmayanlar (holding/veri-eksik) sona
  const sortKey = (x: { r: ValResult }) => (x.r.upsidePct == null ? -9999 : x.r.upsidePct);
  results.sort((a, b) => sortKey(b) - sortKey(a));

  const portfolio = results.filter((x) => x.held);
  const watchlist = results.filter((x) => !x.held);

  return (
    <div className="flex min-h-screen bg-[#050812] text-slate-200">
      <TerminalSidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-black tracking-tight text-cyan-300">Bilanço Değerleme</h1>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-400">
            Dönem: {period} · {results.length} hisse (canlı verili)
          </span>
          <span className="ml-auto text-xs text-slate-500">Çeyreklik güncellenir · fiyat/çarpanlar canlı · yalnız canlı-verisi olan hisseler</span>
        </header>

        <div className="mb-5 flex flex-wrap gap-2 text-xs">
          <span className="rounded border border-white/10 bg-white/[0.02] px-3 py-1 text-slate-400">
            Varsayım (reel): COE %{(A.coeReal * 100).toFixed(0)} · g %{(A.gReal * 100).toFixed(0)} · benchmark F/K {A.benchmarkPE}×
          </span>
          <span className="rounded border border-emerald-400/20 px-2 py-1 text-emerald-300/80">🟢 banka=doğrulandı</span>
          <span className="rounded border border-amber-400/20 px-2 py-1 text-amber-300/80">🟡 sanayi=taslak</span>
          <span className="rounded border border-white/10 px-2 py-1 text-slate-400">⚪ holding=NAV (Faz-2)</span>
        </div>

        {results.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-slate-500">
            Henüz temel veri yok. KAP finansalları parse edilip <code>fundamentals</code> tablosuna yazılınca görünür.
          </div>
        ) : (
          <>
            <Table title="Portföy" rows={portfolio} />
            <Table title="İzleme Listesi" rows={watchlist} />
          </>
        )}

        <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-slate-600">
          Yöntemler: banka → Justified P/B (ROE-Gordon) + Artık-Gelir; sanayi → Justified F/K + Görece F/K; holding → NAV (Faz-2).
          Enflasyon-muhasebeli (reel) tablolara reel COE/g uygulanır. Sanayi track TASLAK — tek-dönem ROE + düz COE, kaliteli/büyüme
          isimlerini olduğundan ucuz/pahalı gösterebilir. Bu bir <b>temel-analiz egzersizidir, yatırım tavsiyesi değildir</b>.
        </p>
      </main>
    </div>
  );
}
