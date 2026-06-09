import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Side = "LONG" | "SHORT" | "-";

type SignalRow = {
  id?: string;
  symbol?: string;
  side?: string;
  price?: number;
  quality_score?: number;
  score?: number;
  status?: string;
  action?: string;
  event_type?: string;
  signal?: string;
  timeframe?: string;
  strategy_tag?: string;
  created_at?: string;
  raw_payload?: any;
};

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    : null;

export default async function SignalsPage() {
  const signals = await getSignals();
  const normalized = signals.map(normalizeSignal);

  const total = normalized.length;
  const longCount = normalized.filter((s) => s.side === "LONG").length;
  const shortCount = normalized.filter((s) => s.side === "SHORT").length;
  const avgScore =
    total > 0
      ? Math.round(
          normalized.reduce((sum, s) => sum + s.score, 0) / total
        )
      : 0;

  const elite = normalized.filter((s) => s.score >= 90).length;
  const strong = normalized.filter((s) => s.score >= 80 && s.score < 90).length;
  const weak = normalized.filter((s) => s.score < 80).length;
  const noData = normalized.filter((s) => s.dataQuality === "NO_DATA").length;

  return (
    <main className="min-h-screen bg-[#030712] text-white">
      <div className="flex min-h-screen">
        <aside className="w-[84px] border-r border-white/10 bg-[#050916]">
          <div className="mx-auto mt-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/40 bg-cyan-400/10 font-black text-cyan-300">
            TI
          </div>
          <nav className="mt-12 flex flex-col items-center gap-8 text-xs tracking-[0.3em] text-slate-500">
            <a href="/dashboard">TE</a>
            <a href="/positions">PO</a>
            <a className="rounded-2xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-4 text-cyan-300" href="/signals">
              Sİ
            </a>
            <a href="/analytics">AN</a>
            <a href="/replay">RE</a>
            <a href="/strategy-lab">ST</a>
            <a href="/risk">Rİ</a>
          </nav>
        </aside>

        <section className="flex-1 px-6 py-5">
          <header className="mb-5 flex items-start justify-between border-b border-white/10 pb-5">
            <div>
              <p className="text-xs font-bold tracking-[0.55em] text-cyan-300">
                SIGNAL INTELLIGENCE MATRIX
              </p>
              <h1 className="mt-4 text-3xl font-black">
                AI Signal Ranking Engine
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                TradingView EMA100 alarm payload, kalite skoru, teknik veri ve sinyal sağlığı takibi.
              </p>
            </div>

            <div className="flex gap-3">
              <Badge label="MODE" value="PAPER" />
              <Badge label="SIGNALS" value={String(total)} />
              <Badge label="AVG" value={`%${avgScore}`} />
            </div>
          </header>

          <section className="mb-5 grid grid-cols-7 gap-4">
            <Kpi title="TOTAL SIGNALS" value={total} tone="neutral" />
            <Kpi title="LONG" value={longCount} tone="green" />
            <Kpi title="SHORT" value={shortCount} tone="red" />
            <Kpi title="AVG SCORE" value={`%${avgScore}`} tone="blue" />
            <Kpi title="ELITE 90+" value={elite} tone="green" />
            <Kpi title="STRONG 80+" value={strong} tone="blue" />
            <Kpi title="NO DATA" value={noData} tone="yellow" />
          </section>

          <section className="grid grid-cols-[1fr_420px] gap-5">
            <div className="rounded-3xl border border-white/10 bg-[#070b18] p-5">
              <div className="mb-5 flex items-center justify-between">
                <p className="text-xs font-bold tracking-[0.45em] text-cyan-300">
                  LIVE SIGNAL FEED
                </p>
                <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-300">
                  PAYLOAD PARSED
                </span>
              </div>

              <div className="max-h-[690px] space-y-3 overflow-y-auto pr-2">
                {normalized.map((s) => (
                  <article
                    key={s.id}
                    className="rounded-2xl border border-white/10 bg-[#050814] p-4"
                  >
                    <div className="grid grid-cols-[170px_90px_100px_repeat(6,1fr)_110px] items-center gap-4">
                      <div>
                        <p className="text-lg font-black">{s.symbol}</p>
                        <p className="text-xs text-slate-500">
                          {s.eventLabel} · {s.timeframe}
                        </p>
                      </div>

                      <p
                        className={
                          s.side === "LONG"
                            ? "font-black text-emerald-300"
                            : s.side === "SHORT"
                            ? "font-black text-rose-300"
                            : "font-black text-slate-400"
                        }
                      >
                        {s.side}
                      </p>

                      <Metric label="PRICE" value={formatPrice(s.price)} />
                      <Metric label="RSI" value={formatNum(s.rsi)} />
                      <Metric label="MACD" value={formatNum(s.macdHist)} />
                      <Metric label="DIST" value={formatNum(s.distAtr)} />
                      <Metric label="SLOPE" value={formatNum(s.slopePct)} />
                      <Metric label="STATE" value={s.state} />
                      <Metric label="BAND" value={s.qualityBand} />

                      <div className="text-right">
                        <p className={scoreClass(s.score)}>%{s.score}</p>
                        <p className="mt-1 text-[10px] tracking-[0.25em] text-slate-500">
                          {s.health}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Pill label={`Data: ${s.dataQuality}`} tone={s.dataQuality === "OK" ? "green" : "yellow"} />
                      <Pill label={`Action: ${s.action}`} tone="blue" />
                      <Pill label={`Strategy: ${s.strategy}`} tone="neutral" />
                      <Pill label={`Time: ${formatDate(s.createdAt)}`} tone="neutral" />
                    </div>
                  </article>
                ))}

                {normalized.length === 0 && (
                  <div className="rounded-2xl border border-white/10 p-8 text-center text-slate-400">
                    Henüz sinyal bulunamadı.
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-5">
              <Panel title="EMA100 SIGNAL LOGIC">
                <StatusCard title="EMA100 REFERENCE" value="Active" tone="blue" />
                <StatusCard title="ATR DISTANCE ZONES" value="Enabled" tone="green" />
                <StatusCard title="MACD CROSS LOGIC" value="Tracked" tone="yellow" />
                <StatusCard title="RSI FILTER" value="Enabled" tone="neutral" />
                <StatusCard title="SLOPE FILTER" value="Enabled" tone="neutral" />
              </Panel>

              <Panel title="QUALITY DISTRIBUTION">
                <div className="space-y-3">
                  <Bar label="Elite 90+" value={elite} total={total} />
                  <Bar label="Strong 80-89" value={strong} total={total} />
                  <Bar label="Weak <80" value={weak} total={total} />
                  <Bar label="No Data" value={noData} total={total} />
                </div>
              </Panel>

              <Panel title="NEXT IMPROVEMENT">
                <p className="text-sm leading-6 text-slate-400">
                  Sonraki adım: Pine payload içindeki RSI, MACD hist, distATR,
                  slopePct ve quality_band alanlarını positions tablosuna entry
                  anı olarak kaydedip pozisyon sağlığı skoruna bağlamak.
                </p>
              </Panel>
            </aside>
          </section>
        </section>
      </div>
    </main>
  );
}

async function getSignals(): Promise<SignalRow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("signals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    console.error("signals fetch error", error);
    return [];
  }

  return data ?? [];
}

function normalizeSignal(row: SignalRow) {
  const raw = normalizePayload(row.raw_payload);

  const side = normalizeSide(
    row.side ??
      raw.side ??
      raw.order_action ??
      raw.orderSide ??
      raw.action
  );

  const score = Math.round(
    number(row.quality_score) ??
      number(row.score) ??
      number(raw.quality_score) ??
      number(raw.score) ??
      0
  );

  const rsi = number(raw.rsi ?? row.raw_payload?.rsi);
  const macdHist = number(raw.hist ?? raw.macd_hist ?? raw.macdHist);
  const distAtr = number(raw.distATR ?? raw.dist_atr ?? raw.atr);
  const slopePct = number(raw.slopePct ?? raw.ema_slope ?? raw.slope);
  const qualityBand =
    String(raw.quality_band ?? raw.signal_grade ?? bandFromScore(score));
  const state = String(raw.state ?? "-");
  const action = String(row.action ?? raw.action ?? raw.signal ?? row.signal ?? "-");
  const price =
    number(row.price) ??
    number(raw.price) ??
    number(raw.close) ??
    0;

  const dataQuality =
    rsi == null && macdHist == null && distAtr == null && slopePct == null
      ? "NO_DATA"
      : "OK";

  return {
    id: String(row.id ?? `${row.symbol}-${row.created_at}-${Math.random()}`),
    symbol: String(row.symbol ?? raw.symbol ?? "-").replace("BIST:", ""),
    side,
    price,
    score,
    rsi,
    macdHist,
    distAtr,
    slopePct,
    qualityBand,
    state,
    action,
    strategy: String(row.strategy_tag ?? raw.strategyTag ?? raw.strategy_tag ?? "-"),
    timeframe: String(row.timeframe ?? raw.timeframe ?? "-"),
    eventLabel: String(row.event_type ?? row.signal ?? raw.signal ?? "CONFIRMED"),
    createdAt: String(row.created_at ?? ""),
    dataQuality,
    health: healthLabel(score, rsi, distAtr, macdHist),
  };
}

function normalizePayload(payload: any) {
  if (!payload) return {};
  if (typeof payload === "object") return payload;

  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeSide(value: any): Side {
  const raw = String(value ?? "").toUpperCase();
  if (raw.includes("LONG") || raw.includes("BUY")) return "LONG";
  if (raw.includes("SHORT") || raw.includes("SELL")) return "SHORT";
  return "-";
}

function number(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bandFromScore(score: number) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  return "C";
}

function healthLabel(
  score: number,
  rsi: number | null,
  distAtr: number | null,
  macdHist: number | null
) {
  if (score >= 90 && rsi !== null && distAtr !== null && macdHist !== null)
    return "ELITE";
  if (score >= 80) return "STRONG";
  if (score >= 70) return "WATCH";
  return "WEAK";
}

function scoreClass(score: number) {
  if (score >= 90) return "text-xl font-black text-emerald-300";
  if (score >= 80) return "text-xl font-black text-cyan-300";
  if (score >= 70) return "text-xl font-black text-yellow-300";
  return "text-xl font-black text-rose-300";
}

function formatPrice(value: number) {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatNum(value: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3">
      <span className="mr-2 text-[10px] tracking-[0.35em] text-slate-500">
        {label}
      </span>
      <span className="font-black text-cyan-300">{value}</span>
    </div>
  );
}

function Kpi({
  title,
  value,
  tone,
}: {
  title: string;
  value: string | number;
  tone: "green" | "red" | "blue" | "yellow" | "neutral";
}) {
  const cls =
    tone === "green"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : tone === "red"
      ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
      : tone === "blue"
      ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
      : tone === "yellow"
      ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-300"
      : "border-white/10 bg-white/5 text-white";

  return (
    <div className={`rounded-2xl border p-5 ${cls}`}>
      <p className="text-xs tracking-[0.35em] opacity-70">{title}</p>
      <p className="mt-4 text-3xl font-black">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.35em] text-slate-500">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  );
}

function Pill({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "yellow" | "blue" | "neutral";
}) {
  const cls =
    tone === "green"
      ? "border-emerald-400/30 text-emerald-300"
      : tone === "yellow"
      ? "border-yellow-400/30 text-yellow-300"
      : tone === "blue"
      ? "border-cyan-400/30 text-cyan-300"
      : "border-white/10 text-slate-400";

  return <span className={`rounded-full border px-3 py-1 ${cls}`}>{label}</span>;
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#070b18] p-5">
      <p className="mb-5 text-xs font-bold tracking-[0.45em] text-cyan-300">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function StatusCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "green" | "blue" | "yellow" | "neutral";
}) {
  const cls =
    tone === "green"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : tone === "blue"
      ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
      : tone === "yellow"
      ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-300"
      : "border-white/10 bg-white/5 text-white";

  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <p className="text-xs tracking-[0.35em] opacity-70">{title}</p>
      <p className="mt-3 text-2xl font-black">{value}</p>
    </div>
  );
}

function Bar({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>
          {value} / %{pct}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}