import type { Trade } from "./types"
import { pnlColor } from "./helpers"

export default function VisualIntelligenceLayer({
  trades,
}: {
  trades: Trade[]
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
      <EquityCurve trades={trades} />

      <div className="grid gap-5">
        <AISignalScore trades={trades} />
        <ScannerRanking trades={trades} />
      </div>

      <Heatmap trades={trades} />
      <TradeReplay trades={trades} />
      <PositionDetail trade={trades[0]} />
    </div>
  )
}

function EquityCurve({ trades }: { trades: Trade[] }) {
  let total = 0

  const points = trades.map((trade, index) => {
    total += trade.pnl
    const x = 70 + index * 150
    const y = 180 - total * 15
    return `${x},${y}`
  })

  const fallback = "70,180 220,130 370,155 520,95 670,120 820,75"

  return (
    <Card title="Equity Curve" subtitle="Kümülatif PnL eğrisi">
      <svg viewBox="0 0 900 260" className="h-64 w-full">
        <defs>
          <linearGradient id="equityLine" x1="0" x2="1">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="55%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>

        <line
          x1="40"
          y1="180"
          x2="860"
          y2="180"
          stroke="rgba(255,255,255,.12)"
        />

        <polyline
          points={points.length ? points.join(" ") : fallback}
          fill="none"
          stroke="url(#equityLine)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Card>
  )
}

function AISignalScore({ trades }: { trades: Trade[] }) {
  const avgConfidence = trades.length
    ? Math.round(
        trades.reduce((sum, trade) => sum + trade.confidence, 0) /
          trades.length
      )
    : 0

  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0)

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(avgConfidence + (totalPnl >= 0 ? 6 : -6))
    )
  )

  const label =
    score >= 80 ? "STRONG" : score >= 60 ? "NORMAL" : "WEAK"

  return (
    <Card title="AI Signal Score" subtitle="Sinyal kalitesi ve trade bias">
      <div className="text-6xl font-bold text-cyan-300">%{score}</div>

      <div className="mt-4 h-3 rounded-full bg-white/10">
        <div
          className="h-3 rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,.65)]"
          style={{ width: `${score}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Box label="Quality" value={label} />
        <Box
          label="Bias"
          value={totalPnl >= 0 ? "POSITIVE" : "NEGATIVE"}
          danger={totalPnl < 0}
        />
      </div>
    </Card>
  )
}

function ScannerRanking({ trades }: { trades: Trade[] }) {
  const ranked = [...trades]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6)

  return (
    <Card title="Scanner Ranking" subtitle="En yüksek confidence skorları">
      <div className="space-y-3">
        {ranked.map((trade, index) => (
          <div
            key={`${trade.symbol}-${index}`}
            className="flex items-center justify-between rounded-2xl bg-black/30 p-4"
          >
            <div>
              <div className="font-bold">
                {index + 1}. {trade.symbol}
              </div>
              <div className="text-sm text-slate-400">{trade.strategy}</div>
            </div>

            <div className="text-right">
              <div className="font-bold text-cyan-300">
                %{trade.confidence}
              </div>
              <div className="text-xs text-slate-500">{trade.side}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Heatmap({ trades }: { trades: Trade[] }) {
  return (
    <Card title="Heatmap" subtitle="PnL / momentum renk yoğunluğu">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {trades.map((trade, index) => (
          <div
            key={`${trade.symbol}-${index}`}
            className={`rounded-2xl p-4 text-center ${
              trade.pnl >= 0
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300"
            }`}
          >
            <div className="font-bold">{trade.symbol}</div>
            <div className="mt-1 text-sm">{trade.pnl} ₺</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function TradeReplay({ trades }: { trades: Trade[] }) {
  return (
    <Card title="Trade Replay" subtitle="Son sinyal ve pozisyon zaman akışı">
      <div className="space-y-3">
        {trades.map((trade, index) => (
          <div
            key={`${trade.symbol}-${index}`}
            className="rounded-2xl bg-black/30 p-4"
          >
            <div className="flex items-center justify-between">
              <b>{trade.symbol}</b>
              <span className={pnlColor(trade.pnl)}>{trade.pnl} ₺</span>
            </div>

            <div className="mt-1 text-sm text-slate-400">
              {trade.strategy} · {trade.side} · {trade.time}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function PositionDetail({ trade }: { trade?: Trade }) {
  if (!trade) {
    return (
      <Card title="Position Detail Drawer" subtitle="Seçili pozisyon özeti">
        <div className="text-slate-500">Açık pozisyon yok.</div>
      </Card>
    )
  }

  return (
    <Card title="Position Detail Drawer" subtitle="Seçili pozisyon özeti">
      <div className="grid grid-cols-2 gap-4">
        <Box label="Symbol" value={trade.symbol} />
        <Box label="Side" value={trade.side} />
        <Box label="Strategy" value={trade.strategy} />
        <Box label="Entry" value={String(trade.entry)} />
        <Box label="Confidence" value={`%${trade.confidence}`} />
        <Box
          label="PnL"
          value={`${trade.pnl} ₺`}
          danger={trade.pnl < 0}
        />
      </div>
    </Card>
  )
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#0b1220] p-5 shadow-2xl">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <div className="text-2xl font-bold">{title}</div>
          <div className="text-slate-400">{subtitle}</div>
        </div>

        <div className="rounded-full bg-cyan-500/20 px-3 py-1 text-sm text-cyan-300">
          LIVE
        </div>
      </div>

      {children}
    </section>
  )
}

function Box({
  label,
  value,
  danger,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div className="rounded-2xl bg-black/30 p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div
        className={`mt-2 font-bold ${
          danger ? "text-rose-400" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  )
}