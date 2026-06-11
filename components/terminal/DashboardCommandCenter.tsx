"use client";

import type {
  BrokerBridgeStatus,
  PositionLifecycle,
  Trade,
  TradingSignal,
} from "./types";

type GlobalMarketItem = {
  symbol: string;
  price: number;
  changePct: number;
};

type Props = {
  trades: Trade[];
  signals: TradingSignal[];
  positions: PositionLifecycle[];
  bridge: BrokerBridgeStatus;
  source: "SUPABASE" | "MOCK";
  globalContext?: GlobalMarketItem[] | { data?: unknown[] };
};

type Conviction = "WAIT" | "TACTICAL" | "STRONG" | "ELITE";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type Regime = "MOMENTUM" | "TREND" | "SELECTIVE" | "DEFENSIVE";

type EnrichedSignal = TradingSignal & {
  aiScore: number;
  riskLevel: RiskLevel;
  pressure: number;
  regime: Regime;
  conviction: Conviction;
};

export default function DashboardCommandCenter({
  trades,
  signals,
  positions,
  bridge,
  source,
  globalContext = [],
}: Props) {
  const normalizedGlobalContext = normalizeGlobalContext(globalContext);
  const enrichedSignals = enrichSignals(signals);

  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const winners = trades.filter((trade) => trade.pnl > 0).length;
  const losers = trades.filter((trade) => trade.pnl < 0).length;
  const winRate = trades.length ? Math.round((winners / trades.length) * 100) : 0;

  const longCount = trades.filter((trade) => trade.side === "LONG").length;
  const shortCount = trades.filter((trade) => trade.side === "SHORT").length;
  const exposurePct = Math.min(100, trades.length * 20);

  const avgAi =
    enrichedSignals.reduce((sum, signal) => sum + signal.aiScore, 0) /
    Math.max(1, enrichedSignals.length);

  const avgPressure =
    enrichedSignals.reduce((sum, signal) => sum + signal.pressure, 0) /
    Math.max(1, enrichedSignals.length);

  const priority = enrichedSignals[0];

  return (
    <div className="grid h-full min-h-0 grid-rows-[54px_minmax(0,1fr)_86px] overflow-hidden bg-[#03050a] p-3">
      <MarketPressureRibbon
        priority={priority}
        avgAi={avgAi}
        avgPressure={avgPressure}
        totalPnl={totalPnl}
        exposurePct={exposurePct}
        source={source}
      />

      <section className="grid min-h-0 grid-cols-[240px_minmax(0,1fr)_330px] gap-3 overflow-hidden py-3">
        <LeftTacticalRail
          totalPnl={totalPnl}
          winRate={winRate}
          winners={winners}
          losers={losers}
          longCount={longCount}
          shortCount={shortCount}
          exposurePct={exposurePct}
          bridge={bridge}
        />

        <CenterIntelligenceCanvas
          trades={trades}
          signals={enrichedSignals}
          positions={positions}
          totalPnl={totalPnl}
          winRate={winRate}
          exposurePct={exposurePct}
        />

        <RightScannerRail signals={enrichedSignals} />
      </section>

      <BottomActivityDock
        trades={trades}
        signals={enrichedSignals}
        positions={positions}
        totalPnl={totalPnl}
        globalContext={normalizedGlobalContext}
      />
    </div>
  );
}

function MarketPressureRibbon({
  priority,
  avgAi,
  avgPressure,
  totalPnl,
  exposurePct,
  source,
}: {
  priority?: EnrichedSignal;
  avgAi: number;
  avgPressure: number;
  totalPnl: number;
  exposurePct: number;
  source: "SUPABASE" | "MOCK";
}) {
  const regime =
    avgAi >= 82
      ? "AGGRESSIVE MOMENTUM"
      : avgAi >= 70
      ? "CONTROLLED TREND"
      : avgAi >= 55
      ? "SELECTIVE MARKET"
      : "DEFENSIVE MODE";

  return (
    <section className="grid min-h-0 grid-cols-6 gap-2">
      <RibbonCell label="Macro Regime" value={regime} tone="cyan" />
      <RibbonCell
        label="Priority"
        value={priority ? `${priority.symbol} ${priority.side}` : "-"}
        tone="neutral"
      />
      <RibbonCell label="AI Confidence" value={`%${avgAi.toFixed(0)}`} tone="good" />
      <RibbonCell label="Pressure" value={`%${avgPressure.toFixed(0)}`} tone="warn" />
      <RibbonCell
        label="Exposure"
        value={`%${exposurePct}`}
        tone={exposurePct >= 80 ? "bad" : "neutral"}
      />
      <RibbonCell
        label={source}
        value={totalPnl >= 0 ? `+${money(totalPnl)} ₺` : `${money(totalPnl)} ₺`}
        tone={totalPnl >= 0 ? "good" : "bad"}
      />
    </section>
  );
}

function LeftTacticalRail({
  totalPnl,
  winRate,
  winners,
  losers,
  longCount,
  shortCount,
  exposurePct,
  bridge,
}: {
  totalPnl: number;
  winRate: number;
  winners: number;
  losers: number;
  longCount: number;
  shortCount: number;
  exposurePct: number;
  bridge: BrokerBridgeStatus;
}) {
  return (
    <aside className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden">
      <Panel title="Execution State" badge="LIVE">
        <div className="space-y-2">
          <Metric
            label="Net PnL"
            value={`${money(totalPnl)} ₺`}
            tone={totalPnl >= 0 ? "good" : "bad"}
          />
          <Metric label="Win Rate" value={`%${winRate}`} tone="cyan" />
          <Metric label="W / L" value={`${winners} / ${losers}`} tone="neutral" />
        </div>
      </Panel>

      <Panel title="Exposure Engine" badge="RISK">
        <div className="space-y-3">
          <Bar
            label="Total Exposure"
            value={exposurePct}
            tone={exposurePct >= 80 ? "bad" : "cyan"}
          />
          <Bar label="Long Load" value={Math.min(100, longCount * 25)} tone="good" />
          <Bar label="Short Load" value={Math.min(100, shortCount * 25)} tone="bad" />
          <div className="grid grid-cols-2 gap-2">
            <TinyBox label="LONG" value={String(longCount)} tone="good" />
            <TinyBox label="SHORT" value={String(shortCount)} tone="bad" />
          </div>
        </div>
      </Panel>

      <Panel title="System Bridge" badge="OPS" className="min-h-0">
        <div className="flex h-full min-h-0 flex-col">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-300">
              Broker Bridge
            </div>
            <div className="mt-2 text-xl font-black text-white">{bridge.health}</div>
            <div className="mt-1 text-xs text-zinc-500">{bridge.mode}</div>
          </div>

          <div className="mt-3 min-h-0 flex-1 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Last Action
            </div>
            <div className="mt-2 text-sm leading-relaxed text-zinc-300">
              {bridge.lastAction}
            </div>
          </div>
        </div>
      </Panel>
    </aside>
  );
}

function CenterIntelligenceCanvas({
  trades,
  signals,
  positions,
  totalPnl,
  winRate,
  exposurePct,
}: {
  trades: Trade[];
  signals: EnrichedSignal[];
  positions: PositionLifecycle[];
  totalPnl: number;
  winRate: number;
  exposurePct: number;
}) {
  const priority = signals[0];

  return (
    <main className="grid min-h-0 grid-rows-[minmax(0,1fr)_104px] gap-2 overflow-hidden">
      <Panel
        title="Dominant Execution & Intelligence Canvas"
        badge="CENTER"
        className="min-h-0"
      >
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_260px] gap-2">
          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_72px] gap-2">
            <div className="min-h-0 rounded-2xl border border-cyan-400/10 bg-black/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">
                    Equity Command Map
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    No-scroll primary canvas · execution-aware intelligence layer
                  </div>
                </div>

                <div className={totalPnl >= 0 ? "text-emerald-300" : "text-red-300"}>
                  <div className="text-right text-[10px] uppercase tracking-[0.2em] opacity-70">
                    Net PnL
                  </div>
                  <div className="text-2xl font-black">{money(totalPnl)} ₺</div>
                </div>
              </div>

              <svg viewBox="0 0 900 390" className="h-[calc(100%-52px)] w-full">
                <defs>
                  <linearGradient id="terminalGradient" x1="0" x2="1">
                    <stop offset="0%" stopColor="rgb(34,211,238)" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="rgb(34,211,238)" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="rgb(52,211,153)" stopOpacity="0.7" />
                  </linearGradient>
                </defs>

                <path d="M0 195 H900" stroke="rgba(148,163,184,.18)" strokeWidth="1" />
                <path d="M0 95 H900" stroke="rgba(148,163,184,.08)" strokeWidth="1" />
                <path d="M0 295 H900" stroke="rgba(148,163,184,.08)" strokeWidth="1" />

                <polyline
                  fill="none"
                  stroke="url(#terminalGradient)"
                  strokeWidth="4"
                  points={buildEquityPoints(trades)}
                />

                {trades.map((trade, index) => {
                  const x = trades.length <= 1 ? 30 : (index / (trades.length - 1)) * 840 + 30;
                  const y = trade.pnl >= 0 ? 132 : 258;

                  return (
                    <g key={trade.id}>
                      <circle
                        cx={x}
                        cy={y}
                        r="7"
                        fill={trade.pnl >= 0 ? "rgb(52,211,153)" : "rgb(248,113,113)"}
                      />
                      <text
                        x={x}
                        y={y - 14}
                        textAnchor="middle"
                        fill="rgba(244,244,245,.76)"
                        fontSize="11"
                        fontWeight="700"
                      >
                        {trade.symbol}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="grid min-h-0 grid-cols-4 gap-2">
              <CommandCard
                title="Primary Signal"
                value={priority?.symbol ?? "-"}
                subtitle={priority ? `${priority.side} · ${priority.conviction}` : "No active signal"}
                tone="cyan"
              />
              <CommandCard
                title="Position Policy"
                value={`${positions.length}/5`}
                subtitle="max open positions"
                tone={positions.length >= 5 ? "bad" : "good"}
              />
              <CommandCard
                title="Win Rate"
                value={`%${winRate}`}
                subtitle="live signal quality"
                tone="good"
              />
              <CommandCard
                title="Exposure"
                value={`%${exposurePct}`}
                subtitle="portfolio load"
                tone={exposurePct >= 80 ? "warn" : "cyan"}
              />
            </div>
          </div>

          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                Center Command
              </div>
              <div className="mt-2 text-xl font-black leading-none text-cyan-300">
                OPERATING MODE
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Bloomberg-style bounded center canvas
              </div>
            </div>

            <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
              {signals.slice(0, 6).map((signal) => (
                <div
                  key={signal.id}
                  className="rounded-2xl border border-white/10 bg-[#07101a] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-white">
                        {signal.symbol}
                      </div>
                      <div className="mt-1 text-[10px] text-zinc-500">
                        {signal.regime} · {signal.conviction}
                      </div>
                    </div>
                    <div className={sideClass(signal.side)}>{signal.side}</div>
                  </div>
                  <Bar label="AI Score" value={signal.aiScore} tone="cyan" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <section className="grid min-h-0 grid-cols-3 gap-2">
        <MiniMatrix
          title="Risk Matrix"
          items={[
            ["Regime", exposurePct >= 80 ? "Elevated" : "Normal"],
            ["Liquidity", "OK"],
            ["Volatility", "Normal"],
          ]}
        />
        <MiniMatrix
          title="Execution Matrix"
          items={[
            ["TP/SL", "Armed"],
            ["Reversal", "Ready"],
            ["Webhook", "Listening"],
          ]}
        />
        <MiniMatrix
          title="EMA100 Engine"
          items={[
            ["ATR Zone", "Active"],
            ["MACD Cross", "Tracked"],
            ["Slope Filter", "Enabled"],
          ]}
        />
      </section>
    </main>
  );
}

function RightScannerRail({ signals }: { signals: EnrichedSignal[] }) {
  return (
    <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
      <Panel title="Scanner Dominance Matrix" badge="RANK" className="min-h-0">
        <div className="grid grid-cols-3 gap-2">
          <TinyBox
            label="ELITE"
            value={String(signals.filter((s) => s.conviction === "ELITE").length)}
            tone="good"
          />
          <TinyBox
            label="STRONG"
            value={String(signals.filter((s) => s.conviction === "STRONG").length)}
            tone="cyan"
          />
          <TinyBox
            label="WAIT"
            value={String(signals.filter((s) => s.conviction === "WAIT").length)}
            tone="warn"
          />
        </div>
      </Panel>

      <Panel title="Live Scanner Rail" badge="LIVE" className="min-h-0">
        <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
          {signals.map((signal) => (
            <div
              key={signal.id}
              className={`rounded-2xl border p-3 ${
                signal.conviction === "ELITE"
                  ? "border-emerald-400/25 bg-emerald-400/[0.07]"
                  : signal.conviction === "STRONG"
                  ? "border-cyan-400/25 bg-cyan-400/[0.06]"
                  : signal.conviction === "TACTICAL"
                  ? "border-amber-400/25 bg-amber-400/[0.06]"
                  : "border-white/10 bg-white/[0.025]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-white">{signal.symbol}</div>
                  <div className="mt-1 text-[10px] text-zinc-500">
                    {signal.regime} · {signal.riskLevel} RISK
                  </div>
                </div>

                <div className="text-right">
                  <div className={sideClass(signal.side)}>{signal.side}</div>
                  <div className="mt-1 text-[10px] text-zinc-500">
                    %{signal.aiScore}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-[10px]">
                <SmallData label="RSI" value={fmt(signal.rsi)} />
                <SmallData label="MACD" value={fmt(signal.macd)} />
                <SmallData label="ATR" value={fmt(signal.atr)} />
                <SmallData label="DIST" value={fmt(signal.distAtr)} />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </aside>
  );
}

function BottomActivityDock({
  trades,
  signals,
  positions,
  totalPnl,
  globalContext,
}: {
  trades: Trade[];
  signals: EnrichedSignal[];
  positions: PositionLifecycle[];
  totalPnl: number;
  globalContext: GlobalMarketItem[];
}) {
  return (
    <footer className="grid min-h-0 grid-cols-[minmax(0,1fr)_300px_260px] gap-3">
      <div className="rounded-2xl border border-white/10 bg-[#050812] p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">
            Realtime Activity Dock
          </div>
          <div className="text-[10px] text-zinc-500">bounded stream</div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {trades.slice(0, 4).map((trade) => (
            <div
              key={trade.id}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white">{trade.symbol}</span>
                <span className={sideClass(trade.side)}>{trade.side}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px]">
                <span className="text-zinc-500">{trade.createdAt.slice(11, 16)}</span>
                <span className={trade.pnl >= 0 ? "text-emerald-300" : "text-red-300"}>
                  {pct(trade.pnl)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#050812] p-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">
          Global Context
        </div>

        <div className="mt-2 grid grid-cols-4 gap-2">
          {globalContext.length ? (
            globalContext.slice(0, 4).map((item) => (
              <TinyBox
                key={item.symbol}
                label={GLOBAL_LABELS[item.symbol] ?? item.symbol}
                value={`${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%`}
                tone={item.changePct >= 0 ? "good" : "bad"}
              />
            ))
          ) : (
            <>
              <TinyBox label="DOW" value="WAIT" tone="neutral" />
              <TinyBox label="S&P" value="WAIT" tone="neutral" />
              <TinyBox label="DAX" value="WAIT" tone="neutral" />
              <TinyBox label="VIX" value="WAIT" tone="neutral" />
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#050812] p-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">
          PnL Pulse
        </div>
        <div
          className={
            totalPnl >= 0
              ? "mt-2 text-2xl font-black text-emerald-300"
              : "mt-2 text-2xl font-black text-red-300"
          }
        >
          {money(totalPnl)} ₺
        </div>
      </div>
    </footer>
  );
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
    <section
      className={`overflow-hidden rounded-2xl border border-white/10 bg-[#050812] p-3 shadow-[0_0_40px_rgba(0,0,0,0.25)] ${
        className ?? ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">
            {title}
          </h2>
        </div>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[9px] font-black text-cyan-300">
          {badge}
        </span>
      </div>
      {children}
    </section>
  );
}

function RibbonCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "warn" | "cyan" | "neutral";
}) {
  return (
    <div className={`min-w-0 rounded-2xl border px-3 py-2 ${toneClasses(tone)}`}>
      <div className="truncate text-[9px] uppercase tracking-[0.2em] opacity-60">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-black">{value}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "warn" | "cyan" | "neutral";
}) {
  return (
    <div className={`rounded-2xl border p-3 ${toneClasses(tone)}`}>
      <div className="text-[10px] uppercase tracking-[0.18em] opacity-60">{label}</div>
      <div className="mt-2 text-lg font-black">{value}</div>
    </div>
  );
}

function TinyBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "warn" | "cyan" | "neutral";
}) {
  return (
    <div className={`rounded-xl border px-2 py-2 ${toneClasses(tone)}`}>
      <div className="text-[9px] uppercase tracking-[0.16em] opacity-60">{label}</div>
      <div className="mt-1 text-sm font-black">{value}</div>
    </div>
  );
}

function CommandCard({
  title,
  value,
  subtitle,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  tone: "good" | "bad" | "warn" | "cyan" | "neutral";
}) {
  return (
    <div className={`min-h-0 rounded-xl border px-3 py-2 ${toneClasses(tone)}`}>
      <div className="text-[9px] uppercase tracking-[0.18em] opacity-60">{title}</div>
      <div className="mt-1 truncate text-lg font-black leading-none">{value}</div>
      <div className="mt-1 truncate text-[10px] leading-tight opacity-60">{subtitle}</div>
    </div>
  );
}

function MiniMatrix({
  title,
  items,
}: {
  title: string;
  items: Array<[string, string]>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#050812] p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
        {title}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-2">
            <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">
              {label}
            </div>
            <div className="mt-1 truncate text-xs font-black text-white">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "bad" | "warn" | "cyan";
}) {
  const color =
    tone === "good"
      ? "bg-emerald-400"
      : tone === "bad"
      ? "bg-red-400"
      : tone === "warn"
      ? "bg-amber-400"
      : "bg-cyan-400";

  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-[10px]">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300">%{Math.round(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.round(value))}%` }}
        />
      </div>
    </div>
  );
}

function SmallData({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1">
      <div className="text-[8px] text-zinc-500">{label}</div>
      <div className="text-[10px] font-bold text-zinc-200">{value}</div>
    </div>
  );
}


function normalizeGlobalContext(
  input: GlobalMarketItem[] | { data?: unknown[] } | undefined
): GlobalMarketItem[] {
  const rawItems = Array.isArray(input)
    ? input
    : Array.isArray(input?.data)
      ? input.data
      : [];

  const priority = ["FDJI", "FSPX", "FDAX", "VIX"];

  return rawItems
    .map((raw: any) => {
      const symbol = String(raw?.symbol ?? "").trim().toUpperCase();
      const price = Number(raw?.price ?? raw?.last_price ?? 0);
      const changePct = Number(raw?.changePct ?? raw?.change_pct ?? 0);

      if (!symbol) return null;

      return {
        symbol,
        price: Number.isFinite(price) ? price : 0,
        changePct: Number.isFinite(changePct) ? changePct : 0,
      };
    })
    .filter(Boolean)
    .sort(
      (a: any, b: any) =>
        priority.indexOf(a.symbol) - priority.indexOf(b.symbol)
    ) as GlobalMarketItem[];
}

function enrichSignals(signals: TradingSignal[]): EnrichedSignal[] {
  return signals
    .map((signal, index): EnrichedSignal => {
      const aiScore = signal.score ?? 60 + index * 5;

      const conviction: Conviction =
        aiScore >= 86
          ? "ELITE"
          : aiScore >= 74
          ? "STRONG"
          : aiScore >= 60
          ? "TACTICAL"
          : "WAIT";

      const riskLevel: RiskLevel =
        aiScore >= 82 ? "LOW" : aiScore >= 68 ? "MEDIUM" : "HIGH";

      const regime: Regime =
        aiScore >= 82
          ? "MOMENTUM"
          : aiScore >= 70
          ? "TREND"
          : aiScore >= 55
          ? "SELECTIVE"
          : "DEFENSIVE";

      return {
        ...signal,
        aiScore,
        riskLevel,
        pressure: Math.min(100, aiScore + index * 3),
        regime,
        conviction,
      };
    })
    .sort((a, b) => b.aiScore - a.aiScore);
}

function toneClasses(tone: "good" | "bad" | "warn" | "cyan" | "neutral") {
  const map = {
    good: "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300",
    bad: "border-red-400/20 bg-red-400/[0.08] text-red-300",
    warn: "border-amber-400/20 bg-amber-400/[0.08] text-amber-300",
    cyan: "border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-300",
    neutral: "border-white/10 bg-white/[0.035] text-zinc-300",
  };

  return map[tone];
}

function sideClass(side: string) {
  if (side === "LONG") return "text-xs font-black text-emerald-300";
  if (side === "SHORT") return "text-xs font-black text-red-300";
  return "text-xs font-black text-zinc-400";
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

function buildEquityPoints(trades: Trade[]) {
  if (!trades.length) return "0,195 900,195";

  let cumulative = 0;

  const values = trades.map((trade) => {
    cumulative += trade.pnl;
    return cumulative;
  });

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 860 + 20;
      const y = 350 - ((value - min) / range) * 310;
      return `${x},${y}`;
    })
    .join(" ");
}