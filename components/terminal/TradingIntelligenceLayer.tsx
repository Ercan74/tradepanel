"use client";

import type {
  BrokerBridgeStatus,
  PositionLifecycle,
  Trade,
  TradingSignal,
} from "./types";

type Props = {
  signals: TradingSignal[];
  trades: Trade[];
  positions: PositionLifecycle[];
  bridge: BrokerBridgeStatus;
  source: "SUPABASE" | "MOCK";
};

export default function TradingIntelligenceLayer({
  signals,
  trades,
  positions,
  bridge,
  source,
}: Props) {
  const bestSignal = signals[0];
  const openPositions = positions.filter((p) => p.status === "OPEN");

  return (
    <section className="grid grid-cols-1 2xl:grid-cols-12 gap-3">
      <Panel className="2xl:col-span-3" title="Realtime Alarm Stream" badge={source}>
        <div className="space-y-2">
          {signals.slice(0, 7).map((signal) => (
            <div
              key={signal.id}
              className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3"
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-zinc-100">{signal.symbol}</div>
                <div className={signal.side === "LONG" ? "text-emerald-400" : "text-red-400"}>
                  {signal.side}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                <Mini label="Price" value={money(signal.price)} />
                <Mini label="Score" value={`${signal.score ?? "-"} `} />
                <Mini label="Status" value={signal.status} />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="2xl:col-span-4" title="Position Lifecycle" badge="STATE">
        <div className="space-y-2">
          {openPositions.map((position) => (
            <div
              key={position.id}
              className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-zinc-100">
                    {position.symbol}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {position.strategy}
                  </div>
                </div>

                <div
                  className={
                    position.side === "LONG"
                      ? "text-emerald-400"
                      : "text-red-400"
                  }
                >
                  {position.side}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-[10px]">
                <Mini label="Entry" value={money(position.entry)} />
                <Mini label="Current" value={money(position.current)} />
                <Mini
                  label="PnL"
                  value={pct(position.pnlPct)}
                  tone={position.pnlPct >= 0 ? "good" : "bad"}
                />
                <Mini label="AI" value={`${position.aiScore}`} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <LevelBar
                  label="Stop"
                  value={position.stop}
                  current={position.current}
                  tone="bad"
                />
                <LevelBar
                  label="TP"
                  value={position.takeProfit}
                  current={position.current}
                  tone="good"
                />
              </div>

              {position.reversalReady && (
                <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  Reversal watch active
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="2xl:col-span-3" title="AI Signal Ranking Engine" badge="AI">
        <div className="space-y-2">
          {signals.slice(0, 8).map((signal, index) => (
            <div
              key={signal.id}
              className="grid grid-cols-[24px_1fr_52px] items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs"
            >
              <div className="text-zinc-500">#{index + 1}</div>
              <div>
                <div className="font-semibold text-zinc-100">{signal.symbol}</div>
                <div className="text-[10px] text-zinc-500">
                  RSI {signal.rsi ?? "-"} · ATR {signal.atr ?? "-"}
                </div>
              </div>
              <div className="text-right font-bold text-cyan-300">
                {signal.score ?? "-"}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="2xl:col-span-2" title="Broker Bridge" badge={bridge.mode}>
        <div className="space-y-3">
          <StatusBox label="Health" value={bridge.health} />
          <StatusBox label="Mode" value={bridge.mode} />
          <StatusBox label="Last Action" value={bridge.lastAction} />

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
            Live broker execution is disabled until real broker API contract is
            confirmed.
          </div>
        </div>
      </Panel>

      <Panel className="2xl:col-span-5" title="Trade Replay System" badge="REPLAY">
        <div className="space-y-2">
          {trades.slice(0, 8).map((trade, index) => (
            <div
              key={trade.id}
              className="grid grid-cols-[32px_1fr_80px_70px] items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs"
            >
              <div className="text-zinc-500">T{index + 1}</div>
              <div>
                <div className="font-semibold text-zinc-100">{trade.symbol}</div>
                <div className="text-[10px] text-zinc-500">
                  {trade.createdAt.slice(11, 16)} · {trade.strategy}
                </div>
              </div>
              <div
                className={
                  trade.side === "LONG" ? "text-emerald-400" : "text-red-400"
                }
              >
                {trade.side}
              </div>
              <div
                className={
                  trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                }
              >
                {pct(trade.pnl)}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="2xl:col-span-7" title="Interactive Strategy Lab" badge="LAB">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <StrategyCard
            name="EMA100 Mean Reversion"
            status="ACTIVE"
            score={bestSignal?.score ?? 0}
            detail="distATR extreme + RSI normalization + MACD turn"
          />

          <StrategyCard
            name="EMA100 Continuation"
            status="WATCH"
            score={74}
            detail="EMA reclaim + slope acceleration + MACD momentum"
          />

          <StrategyCard
            name="Reversal Engine"
            status="PAPER"
            score={68}
            detail="opposite confirmed signal closes current side and flips"
          />
        </div>

        <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">
            Next Strategy Target
          </div>
          <div className="mt-2 text-sm text-zinc-300">
            Use Supabase signal history to evaluate strategy attribution,
            average return by signal type, TP/SL hit ratio, and reversal quality.
          </div>
        </div>
      </Panel>
    </section>
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
    <div className={`rounded-2xl border border-zinc-800 bg-[#070b12] p-4 ${className ?? ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.24em] text-cyan-300">
            {title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Trading intelligence architecture
          </p>
        </div>

        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold text-cyan-300">
          {badge}
        </span>
      </div>

      {children}
    </div>
  );
}

function Mini({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
      ? "text-red-400"
      : "text-zinc-200";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
      <div className="text-[9px] uppercase text-zinc-500">{label}</div>
      <div className={`mt-1 font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function StatusBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-bold text-zinc-100">{value}</div>
    </div>
  );
}

function LevelBar({
  label,
  value,
  current,
  tone,
}: {
  label: string;
  value: number;
  current: number;
  tone: "good" | "bad";
}) {
  const distance = Math.min(100, Math.abs(((current - value) / current) * 100) * 10);

  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px]">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300">{money(value)}</span>
      </div>

      <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
        <div
          className={`h-full rounded-full ${
            tone === "good" ? "bg-emerald-400" : "bg-red-400"
          }`}
          style={{ width: `${distance}%` }}
        />
      </div>
    </div>
  );
}

function StrategyCard({
  name,
  status,
  score,
  detail,
}: {
  name: string;
  status: string;
  score: number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-zinc-100">{name}</div>
        <div className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300">
          {status}
        </div>
      </div>

      <div className="mt-3 text-2xl font-black text-cyan-300">{score}</div>
      <div className="mt-2 text-xs text-zinc-500">{detail}</div>
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