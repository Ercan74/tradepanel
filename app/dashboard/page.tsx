'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Signal = {
  id: number
  created_at: string
  symbol: string
  side: string
  price: number
  entry_price?: number
  current_price?: number
  pnl?: number
  pnl_pct?: number
  tp1_price?: number | null
  tp2_price?: number | null
  sl_price?: number | null
  trailing_price?: number | null
  risk_pct?: number | null
  status: string
  closed_at?: string | null
  close_price?: number | null
  close_reason?: string | null
  last_price_at?: string | null
  lifecycle_status?: string | null
  tp1_hit?: boolean | null
}

export default function Dashboard() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [allSignals, setAllSignals] = useState<Signal[]>([])
  const [activeTab, setActiveTab] = useState<'OPEN' | 'CLOSED'>('OPEN')
  const [selected, setSelected] = useState<Signal | null>(null)
  const [history, setHistory] = useState<Signal[]>([])
  const [lastRefresh, setLastRefresh] = useState<string>('-')

  useEffect(() => {
    fetchSignals()

    const channel = supabase
      .channel('signals-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'signals' },
        () => fetchSignals()
      )
      .subscribe()

    const interval = setInterval(async () => {
      if (activeTab === 'OPEN') {
        await fetch('/api/price/simulate')
      }
      fetchSignals()
    }, 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [activeTab])

  async function fetchSignals() {
    const { data: tabData, error } = await supabase
      .from('signals')
      .select('*')
      .eq('status', activeTab)
      .order('created_at', { ascending: false })

    const { data: allData } = await supabase
      .from('signals')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    setSignals(tabData || [])
    setAllSignals(allData || [])
    setLastRefresh(new Date().toLocaleTimeString('tr-TR'))
  }

  async function openDetail(row: Signal) {
    setSelected(row)

    const { data } = await supabase
      .from('signals')
      .select('*')
      .eq('symbol', row.symbol)
      .order('created_at', { ascending: false })

    setHistory(data || [])
  }

  function calcPnl(row: Signal) {
    const entry = Number(row.entry_price ?? row.price ?? 0)
    const current = Number(row.close_price ?? row.current_price ?? row.price ?? 0)

    if (!entry || !current) return { pnl: 0, pnlPct: 0 }

    const pnl = row.side === 'LONG' ? current - entry : entry - current
    const pnlPct = (pnl / entry) * 100

    return { pnl, pnlPct }
  }

  function durationText(row: Signal) {
    const start = new Date(row.created_at).getTime()
    const end = row.closed_at ? new Date(row.closed_at).getTime() : Date.now()
    const diffMin = Math.max(0, Math.floor((end - start) / 60000))

    if (diffMin < 60) return `${diffMin} dk`

    const hours = Math.floor(diffMin / 60)
    const mins = diffMin % 60

    return `${hours}s ${mins}dk`
  }

  function formatPrice(value?: number | null) {
    const n = Number(value ?? 0)
    if (!n) return '-'
    return n.toFixed(2)
  }

  function formatPct(value: number) {
    return `${value.toFixed(2)}%`
  }

  function reasonClass(reason?: string | null) {
    if (reason === 'TP2_HIT') return 'text-emerald-400'
    if (reason === 'SL_HIT') return 'text-red-400'
    if (reason === 'TRAILING_STOP_HIT') return 'text-cyan-300'
    if (reason === 'REVERSAL') return 'text-yellow-300'
    if (reason === 'SYSTEM_RESET') return 'text-gray-400'
    return 'text-yellow-300'
  }

  const stats = useMemo(() => {
    const open = allSignals.filter((s) => s.status === 'OPEN')
    const closed = allSignals.filter((s) => s.status === 'CLOSED')

    const closedPnl = closed.reduce((sum, s) => sum + calcPnl(s).pnl, 0)
    const winners = closed.filter((s) => calcPnl(s).pnl > 0).length
    const winRate = closed.length ? (winners / closed.length) * 100 : 0

    const openPnl = open.reduce((sum, s) => sum + calcPnl(s).pnl, 0)

    const best = closed.reduce<Signal | null>((acc, s) => {
      if (!acc) return s
      return calcPnl(s).pnl > calcPnl(acc).pnl ? s : acc
    }, null)

    const worst = closed.reduce<Signal | null>((acc, s) => {
      if (!acc) return s
      return calcPnl(s).pnl < calcPnl(acc).pnl ? s : acc
    }, null)

    return {
      openCount: open.length,
      closedCount: closed.length,
      openPnl,
      closedPnl,
      winRate,
      best,
      worst,
      recentClosed: closed.slice(0, 6),
    }
  }, [allSignals])

  function StatCard({
    title,
    value,
    sub,
    tone,
  }: {
    title: string
    value: string
    sub: string
    tone: 'green' | 'red' | 'blue' | 'yellow'
  }) {
    const toneMap = {
      green: 'from-emerald-500/20 to-emerald-500/5 text-emerald-300',
      red: 'from-red-500/20 to-red-500/5 text-red-300',
      blue: 'from-blue-500/20 to-blue-500/5 text-blue-300',
      yellow: 'from-yellow-500/20 to-yellow-500/5 text-yellow-300',
    }

    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br p-5 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div className="text-sm text-slate-400">{title}</div>
        <div className={`mt-3 text-2xl font-black ${toneMap[tone]}`}>{value}</div>
        <div className="mt-2 text-xs text-slate-500">{sub}</div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <div className="flex">
        <aside className="hidden min-h-screen w-64 border-r border-white/10 bg-[#0b1628] p-5 xl:block">
          <div className="mb-10 flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/20 p-2 text-2xl">📊</div>
            <div>
              <div className="text-lg font-black">TradePanel</div>
              <div className="text-xs text-slate-500">Command Center</div>
            </div>
          </div>

          <nav className="space-y-2 text-sm">
            {['Dashboard', 'Açık Pozisyonlar', 'Kapalı İşlemler', 'PnL Raporu', 'Risk Yönetimi', 'Ayarlar'].map(
              (item, i) => (
                <div
                  key={item}
                  className={`rounded-xl px-4 py-3 font-semibold ${
                    i === 0
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {item}
                </div>
              )
            )}
          </nav>
        </aside>

        <section className="w-full p-6 lg:p-10">
          <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight lg:text-4xl">
                TradePanel Dashboard
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Pozisyon, PnL, TP/SL ve lifecycle takip merkezi
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              Son güncelleme: <b className="text-white">{lastRefresh}</b>
            </div>
          </header>

          <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Açık Pozisyon"
              value={String(stats.openCount)}
              sub="Aktif lifecycle pozisyonları"
              tone="blue"
            />
            <StatCard
              title="Açık PnL"
              value={stats.openPnl.toFixed(2)}
              sub="Simülasyon canlı PnL"
              tone={stats.openPnl >= 0 ? 'green' : 'red'}
            />
            <StatCard
              title="Kapalı PnL"
              value={stats.closedPnl.toFixed(2)}
              sub={`${stats.closedCount} kapanmış işlem`}
              tone={stats.closedPnl >= 0 ? 'green' : 'red'}
            />
            <StatCard
              title="Win Rate"
              value={formatPct(stats.winRate)}
              sub="Kapalı işlemler üzerinden"
              tone="yellow"
            />
          </section>

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_360px]">
            <section className="rounded-3xl border border-white/10 bg-[#111d2f] p-5 shadow-2xl shadow-black/30">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex gap-3">
                  <button
                    onClick={() => setActiveTab('OPEN')}
                    className={`rounded-xl px-5 py-3 font-bold ${
                      activeTab === 'OPEN'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    Açık Pozisyonlar
                  </button>

                  <button
                    onClick={() => setActiveTab('CLOSED')}
                    className={`rounded-xl px-5 py-3 font-bold ${
                      activeTab === 'CLOSED'
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    Kapalı Pozisyonlar
                  </button>
                </div>

                <div className="text-sm text-slate-400">
                  {activeTab === 'OPEN' ? 'Live Position Engine' : 'Trade History'}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1250px] text-left">
                  <thead>
                    {activeTab === 'OPEN' ? (
                      <tr className="border-b border-white/10 text-sm text-slate-400">
                        <th className="py-3">Symbol</th>
                        <th>Side</th>
                        <th>Entry</th>
                        <th>Current</th>
                        <th>PnL</th>
                        <th>PnL %</th>
                        <th>SL</th>
                        <th>TP1</th>
                        <th>TP2</th>
                        <th>Trailing</th>
                        <th>Life</th>
                        <th>Duration</th>
                        <th>Created</th>
                      </tr>
                    ) : (
                      <tr className="border-b border-white/10 text-sm text-slate-400">
                        <th className="py-3">Symbol</th>
                        <th>Side</th>
                        <th>Entry</th>
                        <th>Close</th>
                        <th>PnL</th>
                        <th>PnL %</th>
                        <th>Reason</th>
                        <th>Duration</th>
                        <th>Opened</th>
                        <th>Closed</th>
                      </tr>
                    )}
                  </thead>

                  <tbody>
                    {signals.length === 0 ? (
                      <tr>
                        <td
                          colSpan={activeTab === 'OPEN' ? 13 : 10}
                          className="py-10 text-center text-slate-500"
                        >
                          Kayıt yok
                        </td>
                      </tr>
                    ) : (
                      signals.map((s) => {
                        const entry = Number(s.entry_price ?? s.price ?? 0)
                        const current = Number(s.current_price ?? s.price ?? 0)
                        const close = Number(s.close_price ?? s.current_price ?? s.price ?? 0)
                        const { pnl, pnlPct } = calcPnl(s)

                        return activeTab === 'OPEN' ? (
                          <tr
                            key={s.id}
                            onClick={() => openDetail(s)}
                            className="cursor-pointer border-b border-white/10 text-sm hover:bg-white/5"
                          >
                            <td className="py-4 text-base font-black">{s.symbol}</td>
                            <td className={`font-black ${s.side === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {s.side}
                            </td>
                            <td>{entry.toFixed(2)}</td>
                            <td>{current.toFixed(2)}</td>
                            <td className={`font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pnl.toFixed(2)}
                            </td>
                            <td className={`font-black ${pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pnlPct.toFixed(2)}%
                            </td>
                            <td className="font-semibold text-red-300">{formatPrice(s.sl_price)}</td>
                            <td className="font-semibold text-emerald-300">{formatPrice(s.tp1_price)}</td>
                            <td className="font-semibold text-emerald-300">{formatPrice(s.tp2_price)}</td>
                            <td className="font-semibold text-cyan-300">{formatPrice(s.trailing_price)}</td>
                            <td>
                              <span className="rounded-lg bg-blue-500/15 px-2 py-1 text-xs font-bold text-blue-300">
                                {s.lifecycle_status ?? 'OPEN'}
                              </span>
                            </td>
                            <td className="text-slate-300">{durationText(s)}</td>
                            <td className="text-slate-400">
                              {new Date(s.created_at).toLocaleString('tr-TR')}
                            </td>
                          </tr>
                        ) : (
                          <tr
                            key={s.id}
                            onClick={() => openDetail(s)}
                            className="cursor-pointer border-b border-white/10 text-sm hover:bg-white/5"
                          >
                            <td className="py-4 text-base font-black">{s.symbol}</td>
                            <td className={`font-black ${s.side === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {s.side}
                            </td>
                            <td>{entry.toFixed(2)}</td>
                            <td>{close.toFixed(2)}</td>
                            <td className={`font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pnl.toFixed(2)}
                            </td>
                            <td className={`font-black ${pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pnlPct.toFixed(2)}%
                            </td>
                            <td className={`font-black ${reasonClass(s.close_reason)}`}>
                              {s.close_reason ?? '-'}
                            </td>
                            <td className="text-slate-300">{durationText(s)}</td>
                            <td className="text-slate-400">
                              {new Date(s.created_at).toLocaleString('tr-TR')}
                            </td>
                            <td className="text-slate-400">
                              {s.closed_at ? new Date(s.closed_at).toLocaleString('tr-TR') : '-'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-[#111d2f] p-5 shadow-2xl shadow-black/30">
                <h2 className="mb-4 text-lg font-black">Son Kapanan İşlemler</h2>

                <div className="space-y-3">
                  {stats.recentClosed.length === 0 ? (
                    <div className="text-sm text-slate-500">Henüz kapanan işlem yok</div>
                  ) : (
                    stats.recentClosed.map((s) => {
                      const { pnl, pnlPct } = calcPnl(s)

                      return (
                        <div
                          key={s.id}
                          onClick={() => openDetail(s)}
                          className="cursor-pointer rounded-2xl bg-white/5 p-4 hover:bg-white/10"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-black">{s.symbol}</div>
                            <div className={`text-sm font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pnl.toFixed(2)}
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                            <span className={reasonClass(s.close_reason)}>{s.close_reason ?? '-'}</span>
                            <span>{pnlPct.toFixed(2)}%</span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-[#111d2f] p-5 shadow-2xl shadow-black/30">
                <h2 className="mb-4 text-lg font-black">Performans Özeti</h2>

                <div className="space-y-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Best Trade</span>
                    <span className="font-black text-emerald-400">
                      {stats.best ? `${stats.best.symbol} ${calcPnl(stats.best).pnl.toFixed(2)}` : '-'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Worst Trade</span>
                    <span className="font-black text-red-400">
                      {stats.worst ? `${stats.worst.symbol} ${calcPnl(stats.worst).pnl.toFixed(2)}` : '-'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Closed Trades</span>
                    <span className="font-black">{stats.closedCount}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {selected && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="max-h-[85vh] w-full max-w-[900px] overflow-auto rounded-3xl border border-white/10 bg-[#111d2f] p-6 shadow-2xl shadow-black">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black">{selected.symbol} Detay</h2>
                    <p className="text-sm text-slate-400">Position lifecycle & reversal history</p>
                  </div>

                  <button
                    onClick={() => setSelected(null)}
                    className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/20"
                  >
                    Kapat
                  </button>
                </div>

                <div className="mb-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                  <Detail label="Side" value={selected.side} />
                  <Detail label="Status" value={selected.status} />
                  <Detail label="Entry" value={formatPrice(selected.entry_price ?? selected.price)} />
                  <Detail label="Current" value={formatPrice(selected.current_price ?? selected.price)} />
                  <Detail label="Close" value={formatPrice(selected.close_price)} />
                  <Detail label="SL" value={formatPrice(selected.sl_price)} />
                  <Detail label="TP1" value={formatPrice(selected.tp1_price)} />
                  <Detail label="TP2" value={formatPrice(selected.tp2_price)} />
                  <Detail label="Trailing" value={formatPrice(selected.trailing_price)} />
                  <Detail label="Lifecycle" value={selected.lifecycle_status ?? '-'} />
                  <Detail label="Reason" value={selected.close_reason ?? '-'} />
                  <Detail label="Duration" value={durationText(selected)} />
                </div>

                <h3 className="mb-3 text-lg font-black">Reversal / İşlem Geçmişi</h3>

                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="py-2">Time</th>
                      <th>Side</th>
                      <th>Entry</th>
                      <th>Close</th>
                      <th>Status</th>
                      <th>Reason</th>
                    </tr>
                  </thead>

                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-white/10">
                        <td className="py-3 text-slate-400">
                          {new Date(h.created_at).toLocaleString('tr-TR')}
                        </td>
                        <td className={h.side === 'LONG' ? 'text-emerald-400' : 'text-red-400'}>
                          {h.side}
                        </td>
                        <td>{formatPrice(h.entry_price ?? h.price)}</td>
                        <td>{formatPrice(h.close_price)}</td>
                        <td>{h.status}</td>
                        <td className={reasonClass(h.close_reason)}>{h.close_reason ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 font-black text-white">{value}</div>
    </div>
  )
}