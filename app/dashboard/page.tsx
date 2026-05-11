'use client'

import { useEffect, useState } from 'react'
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
  status: string
  closed_at?: string | null
  close_price?: number | null
  close_reason?: string | null
  last_price_at?: string | null
}

export default function Dashboard() {
  const [signals, setSignals] = useState<Signal[]>([])
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
        {
          event: '*',
          schema: 'public',
          table: 'signals',
        },
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
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('status', activeTab)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    setSignals(data || [])
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
    const current = Number(row.current_price ?? row.price ?? 0)

    if (!entry || !current) return { pnl: 0, pnlPct: 0 }

    const pnl = row.side === 'LONG' ? current - entry : entry - current
    const pnlPct = (pnl / entry) * 100

    return { pnl, pnlPct }
  }

  function durationText(row: Signal) {
    const start = new Date(row.created_at).getTime()
    const end = row.closed_at ? new Date(row.closed_at).getTime() : Date.now()
    const diffMin = Math.floor((end - start) / 60000)

    if (diffMin < 60) return `${diffMin} dk`
    const hours = Math.floor(diffMin / 60)
    const mins = diffMin % 60
    return `${hours}s ${mins}dk`
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">📊 TradePanel Dashboard</h1>
        <div className="text-sm text-gray-400">Son güncelleme: {lastRefresh}</div>
      </div>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setActiveTab('OPEN')}
          className={`px-5 py-2 rounded-lg font-bold ${
            activeTab === 'OPEN' ? 'bg-green-600' : 'bg-gray-700'
          }`}
        >
          Açık Pozisyonlar
        </button>

        <button
          onClick={() => setActiveTab('CLOSED')}
          className={`px-5 py-2 rounded-lg font-bold ${
            activeTab === 'CLOSED' ? 'bg-red-600' : 'bg-gray-700'
          }`}
        >
          Kapalı Pozisyonlar
        </button>
      </div>

      <div className="bg-gray-800 p-6 rounded-xl">
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="py-2">Symbol</th>
              <th className="py-2">Side</th>
              <th className="py-2">Entry</th>
              <th className="py-2">Current</th>
              <th className="py-2">PnL</th>
              <th className="py-2">PnL %</th>
              <th className="py-2">Duration</th>
              <th className="py-2">Status</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>

          <tbody>
            {signals.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-500">
                  Kayıt yok
                </td>
              </tr>
            ) : (
              signals.map((s) => {
                const entry = Number(s.entry_price ?? s.price ?? 0)
                const current = Number(s.current_price ?? s.price ?? 0)
                const { pnl, pnlPct } = calcPnl(s)

                return (
                  <tr
                    key={s.id}
                    onClick={() => openDetail(s)}
                    className="border-b border-gray-700 hover:bg-gray-700 cursor-pointer"
                  >
                    <td className="py-3 font-semibold">{s.symbol}</td>

                    <td
                      className={`py-3 font-bold ${
                        s.side === 'LONG' ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {s.side}
                    </td>

                    <td className="py-3">{entry.toFixed(2)}</td>
                    <td className="py-3">{current.toFixed(2)}</td>

                    <td
                      className={`py-3 font-bold ${
                        pnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {pnl.toFixed(2)}
                    </td>

                    <td
                      className={`py-3 font-bold ${
                        pnlPct >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {pnlPct.toFixed(2)}%
                    </td>

                    <td className="py-3 text-gray-300">{durationText(s)}</td>

                    <td className="py-3 text-yellow-400">{s.status}</td>

                    <td className="py-3 text-gray-400 text-sm">
                      {new Date(s.created_at).toLocaleString('tr-TR')}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
          <div className="bg-gray-800 rounded-xl p-6 w-[700px] max-h-[80vh] overflow-auto">
            <div className="flex justify-between mb-4">
              <h2 className="text-2xl font-bold">{selected.symbol} Detay</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400">
                Kapat
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>Yön: <b>{selected.side}</b></div>
              <div>Durum: <b>{selected.status}</b></div>
              <div>Entry: <b>{Number(selected.entry_price ?? selected.price).toFixed(2)}</b></div>
              <div>Current: <b>{Number(selected.current_price ?? selected.price).toFixed(2)}</b></div>
              <div>Duration: <b>{durationText(selected)}</b></div>
              <div>Close Reason: <b>{selected.close_reason ?? '-'}</b></div>
            </div>

            <h3 className="text-lg font-bold mb-3">Reversal / İşlem Geçmişi</h3>

            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="py-2">Time</th>
                  <th>Side</th>
                  <th>Entry</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>

              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-gray-700">
                    <td className="py-2">
                      {new Date(h.created_at).toLocaleString('tr-TR')}
                    </td>
                    <td className={h.side === 'LONG' ? 'text-green-400' : 'text-red-400'}>
                      {h.side}
                    </td>
                    <td>{Number(h.entry_price ?? h.price).toFixed(2)}</td>
                    <td>{h.status}</td>
                    <td>{h.close_reason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  )
}