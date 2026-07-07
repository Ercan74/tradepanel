import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import TerminalSidebar from "@/components/terminal/TerminalSidebar";
import { getSignalContext, SignalQualityGrade, EntryQuality, SignalRiskLevel } from "@/lib/intelligence";

export const dynamic = "force-dynamic";

type Side = "LONG" | "SHORT" | "-";
type Filter = "ALL" | "OPENED" | "ACCEPTED" | "REJECTED" | "LONG" | "SHORT";

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
  processed_at?: string;
  decision?: string;
  reject_reason?: unknown;
  telegram_status?: string;
  rsi?: number;
  dist_atr?: number;
  macd?: number;
  macd_hist?: number;
  slope_pct?: number;
  signal_state?: string;
  quality_band?: string;
  raw_payload?: unknown;
};

type DecisionGroup = "OPENED" | "ACCEPTED" | "REJECTED" | "PENDING";

type NormalizedSignal = {
  id: string;
  symbol: string;
  side: Side;
  price: number;
  score: number;
  rsi: number | null;
  macdHist: number | null;
  distAtr: number | null;
  slopePct: number | null;
  qualityBand: string;
  state: string;
  action: string;
  strategy: string;
  timeframe: string;
  eventLabel: string;
  createdAt: string;
  processedAt: string;
  dataQuality: "OK" | "NO_DATA";
  health: string;
  decision: string;
  decisionGroup: DecisionGroup;
  rejectReason: string;
  telegramStatus: string;
};

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    : null;

export default async function SignalsPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = normalizeFilter(params?.filter);

  const signals = await getSignals();
  const normalized = signals.map(normalizeSignal);
  const filtered = applyFilter(normalized, filter);

  const total = normalized.length;
  const longCount = normalized.filter((s) => s.side === "LONG").length;
  const shortCount = normalized.filter((s) => s.side === "SHORT").length;
  const opened = normalized.filter((s) => s.decisionGroup === "OPENED").length;
  const accepted = normalized.filter((s) => s.decisionGroup === "ACCEPTED").length;
  const rejected = normalized.filter((s) => s.decisionGroup === "REJECTED").length;
  const telegramSent = normalized.filter((s) => s.telegramStatus === "SENT").length;

  const avgScore =
    total > 0
      ? Math.round(normalized.reduce((sum, s) => sum + s.score, 0) / total)
      : 0;

  const noData = normalized.filter((s) => s.dataQuality === "NO_DATA").length;

  return (
    <main className="min-h-screen bg-[#030712] text-white">
      <div className="flex min-h-screen">
        <TerminalSidebar />

        <section className="min-w-0 flex-1 px-6 py-5">
          <header className="mb-5 flex items-start justify-between border-b border-white/10 pb-5">
            <div>
              <p className="text-xs font-bold tracking-[0.55em] text-cyan-300">
                SIGNAL OPERATIONS CENTER
              </p>
              <h1 className="mt-4 text-3xl font-black">AI Signal Ranking Engine</h1>
              <p className="mt-2 text-sm text-slate-400">
                TradingView alarmı, karar durumu, red nedeni, Telegram ve teknik kalite takibi.
              </p>
            </div>

            <div className="flex gap-3">
              <Badge label="MODE" value="PAPER" />
              <Badge label="SIGNALS" value={String(total)} />
              <Badge label="AVG" value={`%${avgScore}`} />
            </div>
          </header>

          <section className="mb-5 grid grid-cols-8 gap-4">
            <Kpi title="TOTAL" value={total} tone="neutral" />
            <Kpi title="OPENED" value={opened} tone="green" />
            <Kpi title="ACCEPTED" value={accepted} tone="blue" />
            <Kpi title="REJECTED" value={rejected} tone="red" />
            <Kpi title="LONG" value={longCount} tone="green" />
            <Kpi title="SHORT" value={shortCount} tone="red" />
            <Kpi title="TELEGRAM" value={telegramSent} tone="yellow" />
            <Kpi title="NO DATA" value={noData} tone="yellow" />
          </section>

          <section className="mb-5 flex flex-wrap gap-2">
            <FilterLink active={filter === "ALL"} href="/signals">
              ALL
            </FilterLink>
            <FilterLink active={filter === "OPENED"} href="/signals?filter=OPENED" tone="green">
              OPENED
            </FilterLink>
            <FilterLink active={filter === "ACCEPTED"} href="/signals?filter=ACCEPTED" tone="blue">
              ACCEPTED
            </FilterLink>
            <FilterLink active={filter === "REJECTED"} href="/signals?filter=REJECTED" tone="red">
              REJECTED
            </FilterLink>
            <FilterLink active={filter === "LONG"} href="/signals?filter=LONG" tone="green">
              LONG
            </FilterLink>
            <FilterLink active={filter === "SHORT"} href="/signals?filter=SHORT" tone="red">
              SHORT
            </FilterLink>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#070b18] p-5">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-xs font-bold tracking-[0.45em] text-cyan-300">
                FULL WIDTH LIVE SIGNAL FEED
              </p>
              <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-300">
                {filter} / {filtered.length}
              </span>
            </div>

            <div className="max-h-[690px] space-y-3 overflow-y-auto pr-2">
              {filtered.map((s) => {
                // Signal Intelligence
                const intel = getSignalContext({
                  id: s.id,
                  symbol: s.symbol,
                  side: s.side,
                  price: s.price,
                  score: s.score,
                  rsi: s.rsi,
                  macdHist: s.macdHist,
                  distAtr: s.distAtr,
                  slopePct: s.slopePct,
                  qualityBand: s.qualityBand,
                  decisionGroup: s.decisionGroup,
                  strategy: s.strategy,
                  timeframe: s.timeframe,
                });
                const m = intel.value;

                const GRADE_CONFIG: Record<SignalQualityGrade, { bg: string; border: string; text: string }> = {
                  "A+": { bg: "bg-emerald-900/40", border: "border-emerald-500/40", text: "text-emerald-200" },
                  "A":  { bg: "bg-emerald-900/30", border: "border-emerald-500/30", text: "text-emerald-300" },
                  "B+": { bg: "bg-cyan-900/30",    border: "border-cyan-500/30",    text: "text-cyan-300"    },
                  "B":  { bg: "bg-cyan-900/20",    border: "border-cyan-500/20",    text: "text-cyan-400"    },
                  "C":  { bg: "bg-amber-900/30",   border: "border-amber-500/30",   text: "text-amber-300"   },
                  "D":  { bg: "bg-red-900/30",     border: "border-red-500/30",     text: "text-red-300"     },
                };
                const RISK_COLOR: Record<SignalRiskLevel, string> = {
                  LOW: "text-emerald-400", MODERATE: "text-amber-400", HIGH: "text-orange-400", EXTREME: "text-red-400",
                };
                const ENTRY_COLOR: Record<EntryQuality, string> = {
                  OPTIMAL: "text-emerald-300", GOOD: "text-cyan-300", ACCEPTABLE: "text-zinc-300", LATE: "text-amber-300", RISKY: "text-red-300",
                };
                const gradeConf = GRADE_CONFIG[m.qualityGrade];

                return (
                  <article key={s.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#050814]">
                    {/* Intelligence header */}
                    <div className={`flex items-center justify-between px-4 py-2.5 border-b border-white/5 ${gradeConf.bg}`}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border font-black text-lg ${gradeConf.border} ${gradeConf.text}`}>
                          {m.qualityGrade}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-zinc-500">Trend</span>
                            <span className="font-semibold text-zinc-200">{m.trendScore.toFixed(0)}</span>
                            <span className="text-zinc-700">·</span>
                            <span className="text-zinc-500">Momentum</span>
                            <span className="font-semibold text-zinc-200">{m.momentumScore.toFixed(0)}</span>
                            <span className="text-zinc-700">·</span>
                            <span className="text-zinc-500">Risk</span>
                            <span className={`font-semibold ${RISK_COLOR[m.riskLevel]}`}>{m.riskLevel}</span>
                            <span className="text-zinc-700">·</span>
                            <span className="text-zinc-500">Giriş</span>
                            <span className={`font-semibold ${ENTRY_COLOR[m.entryQuality]}`}>{m.entryQuality}</span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-zinc-600">{m.summary}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        <div>
                          <div className="text-[9px] text-zinc-600 uppercase tracking-widest">AI Güven</div>
                          <div className={`text-sm font-black ${gradeConf.text}`}>{m.aiConfidence.toFixed(0)}%</div>
                        </div>
                        {intel.warnings.length > 0 && (
                          <span className="text-[10px] text-amber-400 font-semibold">⚠</span>
                        )}
                      </div>
                    </div>

                    {/* Signal data row */}
                    <div className="grid grid-cols-[190px_90px_110px_100px_130px_120px_minmax(220px,1fr)] items-start gap-5 px-4 py-3">
                      <div>
                        <p className="text-xl font-black leading-none">{s.symbol}</p>
                        <p className="mt-2 text-xs text-slate-500">{s.eventLabel} · {s.timeframe}</p>
                      </div>
                      <p className={s.side === "LONG" ? "text-base font-black text-emerald-300" : s.side === "SHORT" ? "text-base font-black text-rose-300" : "text-base font-black text-slate-400"}>
                        {s.side}
                      </p>
                      <Metric label="PRICE" value={formatPrice(s.price)} />
                      <Metric label="SCORE" value={`%${s.score}`} />
                      <DecisionBadge group={s.decisionGroup} decision={s.decision} />
                      <TelegramBadge status={s.telegramStatus} />
                      <div className="min-w-0">
                        <p className="text-[10px] tracking-[0.35em] text-slate-500">REASON</p>
                        <p className={s.decisionGroup === "REJECTED" ? "mt-1 break-words text-sm font-black leading-5 text-rose-300" : "mt-1 break-words text-sm font-black leading-5 text-slate-300"} title={s.rejectReason}>
                          {s.rejectReason}
                        </p>
                      </div>
                    </div>

                    {/* Technical + intelligence bars */}
                    <div className="grid grid-cols-[repeat(5,minmax(110px,1fr))_minmax(260px,1.6fr)] gap-3 px-4 pb-3">
                      <TechnicalBox label="RSI" value={formatNum(s.rsi)} />
                      <TechnicalBox label="MACD" value={formatNum(s.macdHist)} />
                      <TechnicalBox label="DIST ATR" value={formatNum(s.distAtr)} />
                      <TechnicalBox label="SLOPE" value={formatNum(s.slopePct)} />
                      <TechnicalBox label="STATE" value={s.state} />
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                          <div>
                            <div className="text-[9px] text-zinc-600 uppercase tracking-widest">Trend Skoru</div>
                            <div className="h-1.5 mt-1 w-full rounded-full bg-zinc-800">
                              <div className="h-1.5 rounded-full bg-cyan-500" style={{ width: `${m.trendScore}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] text-zinc-600 uppercase tracking-widest">Momentum</div>
                            <div className="h-1.5 mt-1 w-full rounded-full bg-zinc-800">
                              <div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${m.momentumScore}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] text-zinc-600 uppercase tracking-widest">Risk Skoru</div>
                            <div className="h-1.5 mt-1 w-full rounded-full bg-zinc-800">
                              <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${m.riskScore}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] text-zinc-600 uppercase tracking-widest">Kalite</div>
                            <div className="h-1.5 mt-1 w-full rounded-full bg-zinc-800">
                              <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${m.qualityScore}%` }} />
                            </div>
                          </div>
                        </div>
                        {intel.warnings.length > 0 && (
                          <div className="mt-2 space-y-0.5">
                            {intel.warnings.slice(0, 2).map((w, i) => (
                              <p key={i} className="text-[10px] text-amber-400">⚠ {w}</p>
                            ))}
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <Pill label={`Data: ${s.dataQuality}`} tone={s.dataQuality === "OK" ? "green" : "yellow"} />
                          <Pill label={`Strategy: ${s.strategy}`} tone="neutral" />
                          <Pill label={`Band: ${s.qualityBand}`} tone="green" />
                          <Pill label={`Time: ${formatDate(s.processedAt || s.createdAt)}`} tone="neutral" />
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}

              {filtered.length === 0 && (
                <div className="rounded-2xl border border-white/10 p-8 text-center text-slate-400">
                  Bu filtreye uygun sinyal bulunamadı.
                </div>
              )}
            </div>
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

function normalizeSignal(row: SignalRow): NormalizedSignal {
  const raw = normalizePayload(row.raw_payload);

  const side = normalizeSide(
    row.side ?? raw.side ?? raw.order_action ?? raw.orderSide ?? raw.action
  );

  const score = Math.round(
    number(row.quality_score) ??
      number(row.score) ??
      number(raw.quality_score) ??
      number(raw.score) ??
      0
  );

  const rsi = number(row.rsi ?? raw.rsi);
  const macdHist = number(
    row.macd_hist ?? row.macd ?? raw.hist ?? raw.macd_hist ?? raw.macdHist ?? raw.macd
  );
  const distAtr = number(row.dist_atr ?? raw.distATR ?? raw.dist_atr ?? raw.atr);
  const slopePct = number(row.slope_pct ?? raw.slopePct ?? raw.ema_slope ?? raw.slope);

  const decision = String(
    row.decision ??
      row.action ??
      raw.decision ??
      raw.action ??
      raw.signal ??
      row.signal ??
      "RECEIVED"
  ).toUpperCase();

  const decisionGroup = getDecisionGroup(decision);
  const telegramStatus = String(
    row.telegram_status ?? raw.telegram_status ?? raw.telegramStatus ?? "PENDING"
  ).toUpperCase();

  const qualityBand = String(
    row.quality_band ?? raw.quality_band ?? raw.signal_grade ?? bandFromScore(score)
  );

  const state = String(row.signal_state ?? raw.state ?? raw.signal_state ?? "-");
  const action = String(row.action ?? raw.action ?? raw.signal ?? row.signal ?? "-");
  const price = number(row.price) ?? number(raw.price) ?? number(raw.close) ?? 0;

  const dataQuality =
    rsi == null && macdHist == null && distAtr == null && slopePct == null
      ? "NO_DATA"
      : "OK";

  return {
    id: String(row.id ?? `${row.symbol}-${row.created_at}`),
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
    timeframe: String(row.timeframe ?? raw.timeframe ?? raw.tf ?? "-"),
    eventLabel: String(row.event_type ?? row.signal ?? raw.signal ?? "CONFIRMED"),
    createdAt: String(row.created_at ?? ""),
    processedAt: String(row.processed_at ?? raw.processed_at ?? ""),
    dataQuality,
    health: healthLabel(score, rsi, distAtr, macdHist),
    decision,
    decisionGroup,
    rejectReason: formatRejectReason(row.reject_reason ?? raw.reject_reason),
    telegramStatus,
  };
}

function applyFilter(signals: NormalizedSignal[], filter: Filter) {
  if (filter === "ALL") return signals;
  if (filter === "LONG" || filter === "SHORT") {
    return signals.filter((s) => s.side === filter);
  }
  return signals.filter((s) => s.decisionGroup === filter);
}

function normalizeFilter(value?: string): Filter {
  const raw = String(value ?? "ALL").toUpperCase();
  if (["ALL", "OPENED", "ACCEPTED", "REJECTED", "LONG", "SHORT"].includes(raw)) {
    return raw as Filter;
  }
  return "ALL";
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  if (!payload) return {};
  if (typeof payload === "object") return payload as Record<string, unknown>;

  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      return typeof parsed === "object" && parsed ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeSide(value: unknown): Side {
  const raw = String(value ?? "").toUpperCase();
  if (raw.includes("LONG") || raw.includes("BUY")) return "LONG";
  if (raw.includes("SHORT") || raw.includes("SELL")) return "SHORT";
  return "-";
}

function number(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getDecisionGroup(decision: string): DecisionGroup {
  const value = decision.toUpperCase();

  if (value.includes("OPENED") || value.includes("INSERTED") || value.includes("POSITION_OPEN")) {
    return "OPENED";
  }

  if (
    value.includes("REJECT") ||
    value.includes("ERROR") ||
    value.includes("BLOCK") ||
    value.includes("IGNORE") ||
    value.includes("FAILED")
  ) {
    return "REJECTED";
  }

  if (value.includes("ACCEPT") || value.includes("CONFIRMED") || value.includes("EXECUTED")) {
    return "ACCEPTED";
  }

  return "PENDING";
}

function formatRejectReason(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";

  const raw =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();

  const normalized = raw.toUpperCase();

  if (normalized.includes("RSI")) return "RSI aşırı bölge";
  if (normalized.includes("ATR") || normalized.includes("DIST")) return "ATR uzaklık filtresi";
  if (normalized.includes("MACD")) return "MACD uyumsuzluğu";
  if (normalized.includes("SLOPE")) return "EMA eğim filtresi";
  if (normalized.includes("CAP") || normalized.includes("MAX_OPEN")) return "Pozisyon limiti dolu";
  if (normalized.includes("DUPLICATE")) return "Aynı sembol/TF açık";
  if (normalized.includes("TIMEFRAME")) return "Farklı timeframe izole";
  if (normalized.includes("SHORT") && normalized.includes("X50")) return "X50 dışı short engeli";
  if (normalized.includes("INSERT")) return "Pozisyon kayıt hatası";
  if (normalized.includes("LIVE PRICE")) return "Canlı fiyat eksik";

  return raw.replaceAll("_", " ");
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
  if (score >= 90 && rsi !== null && distAtr !== null && macdHist !== null) return "ELITE";
  if (score >= 80) return "STRONG";
  if (score >= 70) return "WATCH";
  return "WEAK";
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
      <span className="mr-2 text-[10px] tracking-[0.35em] text-slate-500">{label}</span>
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
      <p className="mt-1 text-base font-black">{value}</p>
    </div>
  );
}

function TechnicalBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-100">{value}</p>
    </div>
  );
}

function DecisionBadge({
  group,
  decision,
}: {
  group: DecisionGroup;
  decision: string;
}) {
  const cls =
    group === "OPENED" || group === "ACCEPTED"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : group === "REJECTED"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
        : "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";

  const label =
    decision.includes("POSITION_INSERT_ERROR")
      ? "INSERT ERROR"
      : decision.includes("CAP")
        ? "CAP BLOCK"
        : group;

  return (
    <div>
      <p className="text-[10px] tracking-[0.35em] text-slate-500">DECISION</p>
      <span className={`mt-1 inline-flex rounded-full border px-3 py-1 text-[10px] font-black ${cls}`}>
        {label}
      </span>
    </div>
  );
}

function TelegramBadge({ status }: { status: string }) {
  const cls =
    status === "SENT"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : status === "FAILED" || status === "ERROR"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
        : "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";

  return (
    <div>
      <p className="text-[10px] tracking-[0.35em] text-slate-500">TELEGRAM</p>
      <span className={`mt-1 inline-flex rounded-full border px-3 py-1 text-[10px] font-black ${cls}`}>
        {status || "PENDING"}
      </span>
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

function FilterLink({
  href,
  active,
  children,
  tone = "neutral",
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  tone?: "green" | "red" | "blue" | "neutral";
}) {
  const cls =
    active && tone === "green"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
      : active && tone === "red"
        ? "border-rose-400/40 bg-rose-400/10 text-rose-300"
        : active && tone === "blue"
          ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
          : active
            ? "border-white/30 bg-white/10 text-white"
            : "border-white/10 bg-white/[0.03] text-slate-500 hover:text-white";

  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-2 text-xs font-black tracking-[0.16em] ${cls}`}
    >
      {children}
    </Link>
  );
}
