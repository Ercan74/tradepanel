import type { Trade } from "./types"
import { pnlColor } from "./helpers"

export default function VisualIntelligenceLayer({ trades }: { trades: Trade[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
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
  const points = trades.map((t, i) => {
    total += t.pnl
    return `${80 + i * 140},${180 - total * 12}`
  })

  return (
    <Card title="Equity Curve" subtitle="Kümülatif PnL eğrisi">
      <svg viewBox="0 0 900 240" className="h-64 w-full">
        <polyline
          points={points.length ? points.join(" ") : "80,180 220,120 360,150 500,90"}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <line x1="40" y1="180" x2="860" y2="180" stroke="rgba(255,255,255,.12)" />
      </svg>
    </Card>
  )
}

function AISignalScore({ trades }: { trades: Trade[] }) {
  const avg = trades.length
    ? Math.round(trades.reduce((s, t) => s + t.confidence, 0) / trades.length)
    : 0

  return (
    <Card title="AI Signal Score" subtitle="Sinyal kalitesi">
      <div className="text-6xl font-bold text-cyan-300">%{avg}</div>
      <div className="mt-4 h-3 rounded-full bg-white/10">
        <div className="h-3 rounded-full bg-cyan-400" style={{ width: `${avg}%` }} />
      </div>
      <div className="mt-4 text-slate-400">
        {avg >= 80 ? "Strong setup quality" : avg >= 60 ? "Normal setup quality" : "Weak setup quality"}
      </div>
    </Card>
  )
}

function ScannerRanking({ trades }: { trades: Trade[] }) {
  return (
    <Card title="Scanner Ranking" subtitle="En yüksek confidence">
      <div className="space-y-3">
        {[...trades]
          .sort((a, b) => b.confidence - a.confidence)
          .map((t, i) => (
            <div key={t.symbol} className="flex justify-between rounded-2xl bg-black/30 p-4">
              <span>{i + 1}. <b>{t.symbol}</b></span>
              <span className="text-cyan-300">%{t.confidence}</span>
            </div>
          ))}
      </div>
    </Card>
  )
}

function Heatmap({ trades }: { trades: Trade[] }) {
  return (
    <Card title="Heatmap" subtitle="PnL / momentum yoğunluğu">
      <div className="grid grid-cols-4 gap-3">
        {trades.map((t) => (
          <div
            key={t.symbol}
            className={`rounded-2xl p-4 text-center ${
              t.pnl >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
            }`}
          >
            <div className="font-bold">{t.symbol}</div>
            <div>{t.pnl} ₺</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function TradeReplay({ trades }: { trades: Trade[] }) {
  return (
    <Card title="Trade Replay" subtitle="Son sinyal zaman akışı">
      <div className="space-y-3">
        {trades.map((t) => (
          <div key={t.symbol} className="rounded-2xl bg-black/30 p-4">
            <div className="flex justify-between">
              <b>{t.symbol}</b>
              <span className={pnlColor(t.pnl)}>{t.pnl} ₺</span>
            </div>
            <div className="mt-1 text-sm text-slate-400">
              {t.strategy} · {t.side} · {t.time}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function PositionDetail({ trade }: { trade?: Trade }) {
  if (!trade) return null

  return (
    <Card title="Position Detail Drawer" subtitle="Seçili pozisyon özeti">
      <div className="grid grid-cols-2 gap-4">
        <Box label="Symbol" value={trade.symbol} />
        <Box label="Side" value={trade.side} />
        <Box label="Strategy" value={trade.strategy} />
        <Box label="Entry" value={String(trade.entry)} />
        <Box label="Confidence" value={`%${trade.confidence}`} />
        <Box label="PnL" value={`${trade.pnl} ₺`} danger={trade.pnl < 0} />
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
    <section className="rounded-3xl border border-white/10 bg-[#0b1220] p-5">
      <div className="mb-5">
        <div className="text-2xl font-bold">{title}</div>
        <div className="text-slate-400">{subtitle}</div>
      </div>
      {children}
    </section>
  )
}

function Box({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/30 p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 font-bold ${danger ? "text-rose-400" : "text-white"}`}>{value}</div>
    </div>
  )
}