import TerminalSidebar from "@/components/terminal/TerminalSidebar";
import { createClient } from "@supabase/supabase-js";
import { valuate, DEFAULT_ASSUMPTIONS, FINANCIAL_SECTORS, type FundRow, type ValResult, type HoldingNavInput, type StakeMktCap, type MarketMultiples, type PeerContext } from "@/lib/valuation";

const HOLDING_SECTOR = "HOLDİNGLER VE YATIRIM ŞİRKETLERİ";
const PEER_MIN_N = 5; // sektör-medyanı için asgari sanayi ismi; altında geniş-sanayi medyanı

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

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
    case "BAĞLAM": return "text-sky-300 border-sky-400/30 bg-sky-400/10";
    default: return "text-slate-400 border-white/10 bg-white/5";
  }
}
function tmplBadge(t: string): { dot: string; label: string } {
  if (t === "bank") return { dot: "bg-emerald-400", label: "banka/finansal · Justified P/B" };
  if (t === "holding") return { dot: "bg-slate-500", label: "holding · NAV" };
  return { dot: "bg-sky-400", label: "sanayi · çarpan bağlamı (hüküm yok)" };
}

function Row({ r, held, histPe }: { r: ValResult; held: boolean; histPe: number | null }) {
  const b = tmplBadge(r.template);
  // Kendi-tarihsel F/K kıyası (Option C): anlık F/K, kendi 6m-2y medyanının altında mı?
  const histCls =
    histPe != null && r.pe != null && r.pe > 0
      ? r.pe < histPe * 0.85
        ? "text-emerald-300"
        : r.pe > histPe * 1.15
          ? "text-rose-300"
          : "text-slate-400"
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

function Table({ title, rows }: { title: string; rows: { r: ValResult; held: boolean; histPe: number | null }[] }) {
  if (!rows.length) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">{title}</h2>
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-2 pl-3 pr-2 text-left">Sembol</th>
              <th className="px-2 text-right">Fiyat</th>
              <th className="px-2 text-right">P/D</th>
              <th className="px-2 text-right">F/K</th>
              <th className="px-2 text-right">ROE</th>
              <th className="px-2 text-right">EV/EBITDA<span className="text-slate-600"> / med</span></th>
              <th className="px-2 text-right" title="Kendi 6ay–2yıl F/K medyanı (yeşil=anlık ucuz)">F/K öz-tarih</th>
              <th className="px-2 text-right">Adil (baz)</th>
              <th className="px-2 text-right">Aralık</th>
              <th className="px-2 text-right">Yukarı</th>
              <th className="px-2 pr-3 text-right">Verdikt</th>
            </tr>
          </thead>
          <tbody>{rows.map((x) => <Row key={x.r.symbol} r={x.r} held={x.held} histPe={x.histPe} />)}</tbody>
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
  const marketMap = new Map<string, MarketMultiples>();
  const ownHistMap = new Map<string, number>(); // kendi-tarihsel F/K medyanı (Option C)

  const mktCapMap = new Map<string, number>();

  if (supabase) {
    const [{ data: f }, { data: lp }, { data: pos }, { data: st }, { data: hp }] = await Promise.all([
      supabase.from("fundamentals").select("*"),
      supabase.from("live_prices").select("symbol,last_price,change_pct,pb,pe,ev_ebitda,mkt_cap,firm_value,sector"),
      supabase.from("positions").select("symbol").eq("status", "OPEN"),
      supabase.from("holding_stakes").select("holding_symbol,sub_ticker,stake_pct"),
      supabase.from("historical_pe").select("symbol,pe_6m,pe_1y,pe_2y"),
    ]);
    // Kendi-tarihsel F/K medyanı (Option C): median(6m,1y,2y); TMS-29 kırılması için
    // 3y/5y HARİÇ; negatif/uç (>100) ele; ≥2 geçerli iyi, tek varsa onu al.
    for (const r of (hp ?? []) as { symbol: string; pe_6m: number | null; pe_1y: number | null; pe_2y: number | null }[]) {
      const xs = [r.pe_6m, r.pe_1y, r.pe_2y].filter((v): v is number => v != null && v > 0 && v < 100);
      const m = median(xs);
      if (m != null) ownHistMap.set(r.symbol, m);
    }
    funds = (f ?? []) as FundRow[];
    period = (f?.[0] as { period?: string } | undefined)?.period ?? "—";
    // Yalnız CANLI beslenen (change_pct dolu = Matriks aktif izleme listesi) değerlenir.
    // Matriks P/D(pb)/F/K(pe) → BVPS/EPS/ROE türetir; EV/EBITDA+PiyasaD+FirmaD+sektör
    // → sanayi sektör-göreli değerleme + holding NAV birebir (Faz-2b).
    for (const r of lp ?? []) {
      const row = r as {
        symbol: string; last_price: number; change_pct: number | null;
        pb: number | null; pe: number | null; ev_ebitda: number | null;
        mkt_cap: number | null; firm_value: number | null; sector: string | null;
      };
      priceMap.set(row.symbol, Number(row.last_price));
      if (row.change_pct != null) liveSet.add(row.symbol);
      if (row.mkt_cap != null) mktCapMap.set(row.symbol, Number(row.mkt_cap));
      marketMap.set(row.symbol, {
        pb: row.pb != null ? Number(row.pb) : null,
        pe: row.pe != null ? Number(row.pe) : null,
        evEbitda: row.ev_ebitda != null ? Number(row.ev_ebitda) : null,
        mktCap: row.mkt_cap != null ? Number(row.mkt_cap) : null,
        firmValue: row.firm_value != null ? Number(row.firm_value) : null,
        sector: row.sector,
      });
    }
    for (const p of pos ?? []) heldSet.add((p as { symbol: string }).symbol);
    for (const r of funds) if (r.shares != null) sharesMap.set(r.symbol, Number(r.shares));
    // holding_stakes → holding başına NAV girdisi. İştirak piyasa değeri = Matriks
    // Piyasa Değeri (mkt_cap) BİREBİR; yoksa hisse×fiyat yedeği (eski, yaklaşık).
    for (const s of (st ?? []) as { holding_symbol: string; sub_ticker: string; stake_pct: number }[]) {
      const px = priceMap.get(s.sub_ticker);
      const shares = sharesMap.get(s.sub_ticker);
      const subMktCap = mktCapMap.get(s.sub_ticker) ?? (shares != null && px != null ? shares * px : null);
      const stake: StakeMktCap = { ticker: s.sub_ticker, stakePct: Number(s.stake_pct), subMktCap };
      const existing = navInputs.get(s.holding_symbol);
      if (existing) existing.stakes.push(stake);
      else navInputs.set(s.holding_symbol, { holdingShares: sharesMap.get(s.holding_symbol) ?? null, stakes: [stake] });
    }
  }

  // Sektör EV/EBITDA medyanları — YALNIZ sanayi (finansal/holding hariç, EV/EBITDA>0).
  // Çapraz-sektör kıyası GEÇERSİZ (sektörlerin çarpan seviyeleri yapısal olarak farklı)
  // → yalnız kendi sektörü + n≥PEER_MIN_N. İnce sektör peer'siz kalır (medyan null →
  // motorda absolute Justified F/K'ya düşer).
  const bySector = new Map<string, number[]>();
  for (const [sym, m] of marketMap) {
    if (!liveSet.has(sym)) continue;
    const sec = m.sector;
    if (!sec || FINANCIAL_SECTORS.has(sec) || sec === HOLDING_SECTOR) continue;
    const ee = m.evEbitda;
    if (ee == null || !(ee > 0)) continue;
    if (!bySector.has(sec)) bySector.set(sec, []);
    bySector.get(sec)!.push(ee);
  }
  const peerOf = (sec: string | null | undefined): PeerContext => {
    const arr = sec ? bySector.get(sec) : undefined;
    if (arr && arr.length >= PEER_MIN_N) return { evEbitdaMedian: median(arr), n: arr.length, scope: "sector" };
    return { evEbitdaMedian: null, n: arr?.length ?? 0, scope: "broad" };
  };

  // Yalnız canlı-verisi olan hisseleri değerle (fiyatı olmayanı gösterme).
  const results = funds
    .filter((f) => liveSet.has(f.symbol))
    .map((f) => {
      const m = marketMap.get(f.symbol);
      return {
        r: valuate(f, priceMap.get(f.symbol) ?? null, A, navInputs.get(f.symbol), m, peerOf(m?.sector)),
        held: heldSet.has(f.symbol),
        histPe: ownHistMap.get(f.symbol) ?? null,
      };
    });
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
            Banka/finansal varsayım (reel): COE %{(A.coeReal * 100).toFixed(0)} · g %{(A.gReal * 100).toFixed(0)}
          </span>
          <span className="rounded border border-emerald-400/20 px-2 py-1 text-emerald-300/80">🟢 banka/finansal=Justified P/B</span>
          <span className="rounded border border-sky-400/20 px-2 py-1 text-sky-300/80">🔵 sanayi=çarpan bağlamı (hüküm yok)</span>
          <span className="rounded border border-white/10 px-2 py-1 text-slate-400">⚪ holding=NAV</span>
          <span className="rounded border border-white/10 px-2 py-1 text-slate-400">F/K öz-tarih: <span className="text-emerald-300">yeşil</span>=kendine göre ucuz</span>
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
          Çarpanlar Matriks canlı feed'inden (P/D, F/K, EV/EBITDA) — BVPS/EPS/ROE bunlardan türetilir (Matriks ile birebir).
          Yöntemler: banka/finansal (sigorta·faktoring·GYO dâhil) → Justified P/B (ROE-Gordon) + Artık-Gelir; holding → NAV
          (iştirak piyasa değerlerinin toplamı). <b>Sanayi için sert değerleme hükmü verilmez</b> — BIST sektör etiketleri
          EV/EBITDA-medyanı için fazla heterojen (rafineri+özel-kimya aynı kovada); kendi EV/EBITDA'sı ile sektör medyanı
          <b> bağlam</b> olarak sunulur, yorum kullanıcıya bırakılır. <b>F/K öz-tarih</b> = hissenin kendi 6ay–2yıl F/K medyanı
          (sektör-nötr; borsadirekt/Matriks); anlık F/K bunun altındaysa "kendine göre ucuz". ⚠ Çevrimsel isimlerde (rafineri/çelik/oto)
          F/K kâr döngüsüyle oynadığından bu sinyal gürültülüdür — istikrarlı kazançlılarda güvenilir. Bu bir <b>temel-analiz egzersizidir, yatırım tavsiyesi değildir</b>.
        </p>
      </main>
    </div>
  );
}
