"use client";

import { useMemo, useState } from "react";
import { useTradingIntelligence } from "./useTradingIntelligence";
import TerminalSidebar from "./TerminalSidebar";
import ReplayTimeline from "./ReplayTimeline";
import type { Trade, TradingSignal, PositionLifecycle } from "./types";

type ModuleKind =
  | "positions"
  | "signals"
  | "analytics"
  | "replay"
  | "strategy-lab"
  | "risk"
  | "settings";

type Props = {
  kind: ModuleKind;
};

export default function TerminalModulePage({ kind }: Props) {
  const { loading, source, signals, trades, positions, bridge } =
    useTradingIntelligence();

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#03050a] text-zinc-100">
      <div className="grid h-full w-full grid-cols-[76px_minmax(0,1fr)]">
        <TerminalSidebar bridgeOk={bridge.health === "OK"} />

        <section className="grid h-screen min-w-0 grid-rows-[68px_minmax(0,1fr)] overflow-hidden">
          <header className="flex items-center justify-between border-b border-white/10 bg-[#050812] px-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-300">
                {titleFor(kind)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Source: {source} · {loading ? "Loading..." : "Live ready"} ·{" "}
                Bridge {bridge.health}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Pill label="Mode" value={bridge.mode} tone="cyan" />
              <Pill label="Signals" value={String(signals.length)} tone="neutral" />
              <Pill label="Open" value={String(positions.length)} tone="warn" />
            </div>
          </header>

          <div className="min-h-0 overflow-hidden p-3">
            {kind === "positions" && (
              <PositionsModule positions={positions} trades={trades} />
            )}
            {kind === "signals" && <SignalsModule signals={signals} />}
            {kind === "analytics" && (
              <AnalyticsModule trades={trades} signals={signals} />
            )}
            {kind === "replay" && <ReplayModule trades={trades} signals={signals} />}
            {kind === "strategy-lab" && <StrategyLabModule />}
            {kind === "risk" && (
              <RiskModule trades={trades} positions={positions} signals={signals} />
            )}
            {kind === "settings" && (
              <SettingsModule source={source} bridgeHealth={bridge.health} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function PositionsModule({
  positions,
  trades,
}: {
  positions: PositionLifecycle[];
  trades: Trade[];
}) {
  return (
    <ModuleGrid>
      <Panel title="Open Position Lifecycle" badge="LIVE" className="col-span-8">
        <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-3">
          <div className="grid grid-cols-4 gap-3">
            <Metric label="Open" value={positions.length} />
            <Metric
              label="Reversal Ready"
              value={positions.filter((p) => p.reversalReady).length}
              tone="warn"
            />
            <Metric label="Long" value={trades.filter((t) => t.side === "LONG").length} tone="good" />
            <Metric label="Short" value={trades.filter((t) => t.side === "SHORT").length} tone="bad" />
          </div>

          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="grid gap-2">
              {positions.map((p) => (
                <Row key={p.id}>
                  <div>
                    <div className="font-black">{p.symbol}</div>
                    <div className="text-[10px] text-zinc-500">{p.strategy}</div>
                  </div>
                  <Side side={p.side} />
                  <Small label="ENTRY" value={money(p.entry)} />
                  <Small label="CURRENT" value={money(p.current)} />
                  <Small label="STOP" value={money(p.stop)} />
                  <Small label="TP" value={money(p.takeProfit)} />
                  <Small label="PNL" value={pct(p.pnlPct)} tone={p.pnlPct >= 0 ? "good" : "bad"} />
                  <Small label="AI" value={`%${p.aiScore}`} />
                </Row>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Position Control" badge="POLICY" className="col-span-4">
        <Stack>
          <Metric label="Max Position Policy" value="5" tone="cyan" />
          <Metric label="Auto Reversal" value="Armed" tone="good" />
          <Metric label="TP / SL Engine" value="Tracking" tone="warn" />
          <Metric label="External State" value="Required" tone="cyan" />
        </Stack>
      </Panel>
    </ModuleGrid>
  );
}

function SignalsModule({ signals }: { signals: TradingSignal[] }) {
  const [decisionFilter, setDecisionFilter] = useState<
    "ALL" | "OPENED" | "ACCEPTED" | "REJECTED"
  >("ALL");
  const [sideFilter, setSideFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [eliteOnly, setEliteOnly] = useState(false);

  const enriched = useMemo(() => {
    return signals.map((s) => {
      const decision = String(
        getAny(s, "decision") ??
          getAny(s, "action") ??
          getAny(s, "lifecycle_status") ??
          s.status ??
          "RECEIVED"
      ).toUpperCase();

      const score = Number(s.score ?? getAny(s, "quality_score") ?? 0);
      const reason = formatRejectReason(getAny(s, "reject_reason"));
      const telegram = String(
        getAny(s, "telegram_status") ?? getAny(s, "telegramStatus") ?? "PENDING"
      ).toUpperCase();

      const group = getDecisionGroup(decision);

      return {
        signal: s,
        decision,
        group,
        score,
        reason,
        telegram,
        time: formatSignalTime(s),
      };
    });
  }, [signals]);

  const filtered = useMemo(() => {
    return enriched.filter((item) => {
      if (decisionFilter !== "ALL" && item.group !== decisionFilter) return false;
      if (sideFilter !== "ALL" && item.signal.side !== sideFilter) return false;
      if (eliteOnly && item.score < 90) return false;
      return true;
    });
  }, [decisionFilter, eliteOnly, enriched, sideFilter]);

  const opened = enriched.filter((x) => x.group === "OPENED").length;
  const accepted = enriched.filter((x) => x.group === "ACCEPTED").length;
  const rejected = enriched.filter((x) => x.group === "REJECTED").length;
  const telegramSent = enriched.filter((x) => x.telegram === "SENT").length;

  return (
    <ModuleGrid>
      <Panel title="Signal Operations Center" badge="LIVE OPS" className="col-span-9">
        <div className="grid h-full grid-rows-[auto_auto_minmax(0,1fr)] gap-3">
          <div className="grid grid-cols-6 gap-3">
            <Metric label="Total" value={signals.length} />
            <Metric label="Opened" value={opened} tone="good" />
            <Metric label="Accepted" value={accepted} tone="cyan" />
            <Metric label="Rejected" value={rejected} tone="bad" />
            <Metric label="Telegram" value={telegramSent} tone="warn" />
            <Metric label="Avg Score" value={`%${avg(enriched.map((x) => x.score))}`} tone="cyan" />
          </div>

          <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
            <FilterButton active={decisionFilter === "ALL"} onClick={() => setDecisionFilter("ALL")}>
              ALL
            </FilterButton>
            <FilterButton active={decisionFilter === "OPENED"} onClick={() => setDecisionFilter("OPENED")} tone="good">
              OPENED
            </FilterButton>
            <FilterButton active={decisionFilter === "ACCEPTED"} onClick={() => setDecisionFilter("ACCEPTED")} tone="cyan">
              ACCEPTED
            </FilterButton>
            <FilterButton active={decisionFilter === "REJECTED"} onClick={() => setDecisionFilter("REJECTED")} tone="bad">
              REJECTED
            </FilterButton>
            <FilterButton active={sideFilter === "LONG"} onClick={() => setSideFilter(sideFilter === "LONG" ? "ALL" : "LONG")} tone="good">
              LONG
            </FilterButton>
            <FilterButton active={sideFilter === "SHORT"} onClick={() => setSideFilter(sideFilter === "SHORT" ? "ALL" : "SHORT")} tone="bad">
              SHORT
            </FilterButton>
            <FilterButton active={eliteOnly} onClick={() => setEliteOnly(!eliteOnly)} tone="warn">
              90+
            </FilterButton>
          </div>

          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="grid gap-2">
              {filtered.map((item) => {
                const s = item.signal;

                return (
                  <SignalRow key={s.id}>
                    <div>
                      <div className="font-black">{s.symbol}</div>
                      <div className="text-[10px] text-zinc-500">
                        {String(getAny(s, "timeframe") ?? getAny(s, "tf") ?? "240")} · {item.time}
                      </div>
                    </div>

                    <Side side={s.side} />
                    <Small label="PRICE" value={money(s.price)} />
                    <Small label="SCORE" value={`%${item.score}`} tone={item.score >= 90 ? "good" : "neutral"} />

                    <DecisionBadge value={item.group} decision={item.decision} />

                    <div className="min-w-0">
                      <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                        REASON
                      </div>
                      <div className="mt-1 truncate text-xs font-black text-zinc-300" title={item.reason}>
                        {item.reason}
                      </div>
                    </div>

                    <TelegramBadge status={item.telegram} />

                    <div className="grid grid-cols-4 gap-1">
                      <MiniValue label="RSI" value={fmt(s.rsi)} />
                      <MiniValue label="MACD" value={fmt(s.macd)} />
                      <MiniValue label="DIST" value={fmt(s.distAtr)} />
                      <MiniValue label="STATE" value={String(getAny(s, "signal_state") ?? getAny(s, "state") ?? "-")} />
                    </div>
                  </SignalRow>
                );
              })}

              {!filtered.length && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-zinc-500">
                  Bu filtrelere uygun sinyal yok.
                </div>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Signal Decision Logic" badge="ENGINE" className="col-span-3">
        <Stack>
          <Metric label="EMA100 Reference" value="Active" tone="cyan" />
          <Metric label="ATR Distance Zones" value="Enabled" tone="good" />
          <Metric label="MACD Cross Logic" value="Tracked" tone="warn" />
          <Metric label="RSI Filter" value="Enabled" />
          <Metric label="Slope Filter" value="Enabled" />
          <Metric label="Webhook Status" value="Listening" tone="cyan" />
        </Stack>
      </Panel>
    </ModuleGrid>
  );
}

function AnalyticsModule({
  trades,
  signals,
}: {
  trades: Trade[];
  signals: TradingSignal[];
}) {
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate = trades.length
    ? Math.round((trades.filter((t) => t.pnl > 0).length / trades.length) * 100)
    : 0;

  return (
    <ModuleGrid>
      <Panel title="Institutional PnL Analytics" badge="ANALYTICS" className="col-span-8">
        <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-3">
          <div className="grid grid-cols-4 gap-3">
            <Metric label="Net PnL" value={`${money(totalPnl)} ₺`} tone={totalPnl >= 0 ? "good" : "bad"} />
            <Metric label="Win Rate" value={`%${winRate}`} tone="cyan" />
            <Metric label="Trades" value={trades.length} />
            <Metric label="Signals" value={signals.length} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <svg viewBox="0 0 900 360" className="h-full w-full">
              <path d="M0 180 H900" stroke="rgba(148,163,184,.18)" />
              <polyline
                fill="none"
                stroke="rgb(34,211,238)"
                strokeWidth="4"
                points={equityPoints(trades)}
              />
            </svg>
          </div>
        </div>
      </Panel>

      <Panel title="Regime & Exposure Analytics" badge="RISK" className="col-span-4">
        <Stack>
          <Metric label="Exposure Load" value={`%${Math.min(100, trades.length * 20)}`} tone="warn" />
          <Metric label="Long Bias" value={trades.filter((t) => t.side === "LONG").length} tone="good" />
          <Metric label="Short Bias" value={trades.filter((t) => t.side === "SHORT").length} tone="bad" />
          <Metric label="Market Mode" value="Selective" tone="cyan" />
        </Stack>
      </Panel>
    </ModuleGrid>
  );
}

function ReplayModule({
  trades,
  signals,
}: {
  trades: Trade[];
  signals: TradingSignal[];
}) {
  return (
    <ModuleGrid>
      <Panel title="Trade Replay Timeline" badge="REPLAY" className="col-span-9">
        <ReplayTimeline />
      </Panel>

      <Panel title="Replay Intelligence" badge="FLOW" className="col-span-3">
        <Stack>
          <Metric label="Signal Events" value={signals.length} />
          <Metric label="Trade Events" value={trades.length} />
          <Metric label="Reversal Flow" value="Tracked" tone="warn" />
          <Metric label="Lifecycle Replay" value="Ready" tone="good" />
        </Stack>
      </Panel>
    </ModuleGrid>
  );
}

function StrategyLabModule() {
  return (
    <ModuleGrid>
      <Panel title="EMA100 Strategy Laboratory" badge="LAB" className="col-span-8">
        <div className="grid grid-cols-2 gap-3">
          <StrategyBlock title="ATR Distance Zones" rows={["LONG: below EMA extreme", "LONG: above EMA continuation", "SHORT: above EMA extreme", "SHORT: below EMA continuation"]} />
          <StrategyBlock title="MACD Logic" rows={["Bullish cross accepted", "Bearish cross accepted", "Zero-line not hard-blocked", "Momentum confirmation enabled"]} />
          <StrategyBlock title="Risk Engine" rows={["TP / SL planned", "Trailing engine planned", "Reversal engine planned", "External state required"]} />
          <StrategyBlock title="AI Ranking Calibration" rows={["RSI penalty", "ATR distance weight", "EMA slope weight", "MACD weight"]} />
        </div>
      </Panel>

      <Panel title="Current Parameter Set" badge="PARAMS" className="col-span-4">
        <Stack>
          <Metric label="EMA Length" value="100" tone="cyan" />
          <Metric label="ATR Mode" value="Balanced" />
          <Metric label="Position Cap" value="5" tone="warn" />
          <Metric label="Execution Mode" value="Paper" tone="good" />
        </Stack>
      </Panel>
    </ModuleGrid>
  );
}

function RiskModule({
  trades,
  positions,
  signals,
}: {
  trades: Trade[];
  positions: PositionLifecycle[];
  signals: TradingSignal[];
}) {
  const exposure = Math.min(100, positions.length * 20);

  return (
    <ModuleGrid>
      <Panel title="Institutional Risk Matrix" badge="RISK" className="col-span-8">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Exposure" value={`%${exposure}`} tone={exposure >= 80 ? "bad" : "warn"} />
          <Metric label="Position Cap" value={`${positions.length}/5`} tone={positions.length >= 5 ? "bad" : "good"} />
          <Metric label="Signals" value={signals.length} tone="cyan" />
          <Metric label="Long Risk" value={trades.filter((t) => t.side === "LONG").length} tone="good" />
          <Metric label="Short Risk" value={trades.filter((t) => t.side === "SHORT").length} tone="bad" />
          <Metric label="Emergency Flatten" value="Manual" tone="warn" />
        </div>
      </Panel>

      <Panel title="Risk Policies" badge="POLICY" className="col-span-4">
        <Stack>
          <Metric label="Max Open Positions" value="5" tone="cyan" />
          <Metric label="Duplicate Prevention" value="Required" />
          <Metric label="Cooldown System" value="Planned" tone="warn" />
          <Metric label="Runaway Momentum" value="Watch" tone="bad" />
        </Stack>
      </Panel>
    </ModuleGrid>
  );
}

function SettingsModule({
  source,
  bridgeHealth,
}: {
  source: "SUPABASE" | "MOCK";
  bridgeHealth: string;
}) {
  return (
    <ModuleGrid>
      <Panel title="System Settings & Connectivity" badge="SETTINGS" className="col-span-8">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Data Source" value={source} tone="cyan" />
          <Metric label="Bridge Health" value={bridgeHealth} tone="good" />
          <Metric label="Supabase Realtime" value="Enabled" />
          <Metric label="TradingView Webhook" value="Listening" tone="warn" />
          <Metric label="Broker Execution" value="Not Connected" tone="bad" />
          <Metric label="Mode" value="Paper" tone="good" />
        </div>
      </Panel>

      <Panel title="Universe & Routing" badge="CONFIG" className="col-span-4">
        <Stack>
          <Metric label="Market" value="BIST" tone="cyan" />
          <Metric label="Scanner Groups" value="20-symbol buckets" />
          <Metric label="Webhook State" value="External" tone="warn" />
          <Metric label="Deployment" value="Vercel" tone="good" />
        </Stack>
      </Panel>
    </ModuleGrid>
  );
}

function ModuleGrid({ children }: { children: React.ReactNode }) {
  return <section className="grid h-full min-h-0 grid-cols-12 gap-3">{children}</section>;
}

function Panel({
  title,
  badge,
  className,
  children,
}: {
  title: string;
  badge: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-[#050812] p-4 ${className ?? ""}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">
          {title}
        </h2>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[9px] font-black text-cyan-300">
          {badge}
        </span>
      </div>
      {children}
    </section>
  );
}


function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-8 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs">
      {children}
    </div>
  );
}

function SignalRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1.2fr_0.6fr_0.75fr_0.7fr_1fr_1.4fr_0.8fr_1.6fr] items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs">
      {children}
    </div>
  );
}

function MiniValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-1">
      <div className="text-[8px] uppercase tracking-[0.12em] text-zinc-600">{label}</div>
      <div className="mt-0.5 truncate text-[10px] font-black text-zinc-200">{value}</div>
    </div>
  );
}

function Stack({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3">{children}</div>;
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "good" | "bad" | "warn" | "cyan" | "neutral";
}) {
  const cls = {
    good: "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300",
    bad: "border-red-400/20 bg-red-400/[0.08] text-red-300",
    warn: "border-amber-400/20 bg-amber-400/[0.08] text-amber-300",
    cyan: "border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-300",
    neutral: "border-white/10 bg-white/[0.035] text-zinc-200",
  }[tone];

  return (
    <div className={`rounded-2xl border p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-[0.18em] opacity-60">{label}</div>
      <div className="mt-2 text-xl font-black">{value}</div>
    </div>
  );
}

function Small({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const cls =
    tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : "text-zinc-200";

  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className={`mt-1 font-black ${cls}`}>{value}</div>
    </div>
  );
}

function Side({ side }: { side: string }) {
  return (
    <div className={side === "LONG" ? "font-black text-emerald-300" : "font-black text-red-300"}>
      {side}
    </div>
  );
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "cyan" | "neutral";
}) {
  return (
    <div className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5">
      <span className="mr-2 text-[9px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <span className="text-xs font-black text-cyan-300">{value}</span>
    </div>
  );
}

function StrategyBlock({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
        {title}
      </div>
      <div className="mt-4 grid gap-2">
        {rows.map((r) => (
          <div key={r} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">
            {r}
          </div>
        ))}
      </div>
    </div>
  );
}

function titleFor(kind: ModuleKind) {
  const map: Record<ModuleKind, string> = {
    positions: "Position Lifecycle Engine",
    signals: "Signal Intelligence Matrix",
    analytics: "Institutional Analytics Terminal",
    replay: "Trade Replay System",
    "strategy-lab": "EMA100 Strategy Laboratory",
    risk: "Institutional Risk Engine",
    settings: "System Settings & Connectivity",
  };

  return map[kind];
}


function getAny(source: unknown, key: string): unknown {
  if (!source || typeof source !== "object") return undefined;
  return (source as Record<string, unknown>)[key];
}

function getDecisionGroup(decision: string): "OPENED" | "ACCEPTED" | "REJECTED" {
  const value = decision.toUpperCase();

  if (
    value.includes("OPENED") ||
    value.includes("INSERTED") ||
    value.includes("POSITION_OPEN")
  ) {
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

  return "ACCEPTED";
}

function formatRejectReason(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";

  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const normalized = raw.toUpperCase();

  if (normalized.includes("RSI")) return "RSI aşırı bölge";
  if (normalized.includes("ATR") || normalized.includes("DIST")) return "ATR uzaklık filtresi";
  if (normalized.includes("MACD")) return "MACD uyumsuzluğu";
  if (normalized.includes("SLOPE")) return "EMA eğim filtresi";
  if (normalized.includes("CAP") || normalized.includes("MAX_OPEN")) return "Pozisyon limiti dolu";
  if (normalized.includes("DUPLICATE")) return "Aynı sembol/TF açık";
  if (normalized.includes("TIMEFRAME")) return "Farklı timeframe izole";
  if (normalized.includes("INSERT")) return "Pozisyon kayıt hatası";
  if (normalized.includes("LIVE PRICE")) return "Canlı fiyat eksik";

  return raw.replaceAll("_", " ");
}

function formatSignalTime(signal: TradingSignal) {
  const raw =
    getAny(signal, "processed_at") ??
    getAny(signal, "created_at") ??
    getAny(signal, "createdAt") ??
    getAny(signal, "time");

  if (!raw) return "-";

  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) return String(raw);

  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FilterButton({
  active,
  onClick,
  children,
  tone = "neutral",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "good" | "bad" | "warn" | "cyan" | "neutral";
}) {
  const activeClass = {
    good: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300",
    bad: "border-red-400/40 bg-red-400/15 text-red-300",
    warn: "border-amber-400/40 bg-amber-400/15 text-amber-300",
    cyan: "border-cyan-400/40 bg-cyan-400/15 text-cyan-300",
    neutral: "border-white/20 bg-white/10 text-zinc-100",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition ${
        active
          ? activeClass
          : "border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function DecisionBadge({
  value,
  decision,
}: {
  value: string;
  decision: string;
}) {
  const cls =
    value === "OPENED" || value === "ACCEPTED"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : value === "REJECTED"
        ? "border-red-400/30 bg-red-400/10 text-red-300"
        : "border-amber-400/30 bg-amber-400/10 text-amber-300";

  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">DECISION</div>
      <div className={`mt-1 w-fit rounded-full border px-2 py-1 text-[10px] font-black ${cls}`}>
        {decision.includes("POSITION_INSERT_ERROR")
          ? "INSERT ERROR"
          : decision.includes("CAP")
            ? "CAP BLOCK"
            : value}
      </div>
    </div>
  );
}

function TelegramBadge({ status }: { status: string }) {
  const cls =
    status === "SENT"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : status === "FAILED" || status === "ERROR"
        ? "border-red-400/30 bg-red-400/10 text-red-300"
        : "border-amber-400/30 bg-amber-400/10 text-amber-300";

  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">TELEGRAM</div>
      <div className={`mt-1 w-fit rounded-full border px-2 py-1 text-[10px] font-black ${cls}`}>
        {status || "PENDING"}
      </div>
    </div>
  );
}

function money(value: number) {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function fmt(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return Number(value).toFixed(2);
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function equityPoints(trades: Trade[]) {
  if (!trades.length) return "0,180 900,180";

  let cumulative = 0;
  const values = trades.map((t) => {
    cumulative += t.pnl;
    return cumulative;
  });

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 860 + 20;
      const y = 330 - ((value - min) / range) * 290;
      return `${x},${y}`;
    })
    .join(" ");
}