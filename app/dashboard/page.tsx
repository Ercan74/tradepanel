'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Dashboard() {
  const [signals, setSignals] = useState<any[]>([])

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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchSignals() {
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    setSignals(data || [])
  }

  function calcPnl(row: any) {
    const entry = Number(row.entry_price ?? row.price ?? 0)
    const current = Number(row.current_price ?? row.price ?? 0)

    if (!entry || !current) return { pnl: 0, pnlPct: 0 }

    const pnl =
      row.side === 'LONG'
        ? current - entry
        : entry - current

    const pnlPct = (pnl / entry) * 100

    return { pnl, pnlPct }
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-10">
      <h1 className="text-3xl font-bold mb-6">
        📊 TradePanel Dashboard
      </h1>

      <div className="bg-gray-800 p-6 rounded-xl">
        <h2 className="text-xl mb-4">Açık Pozisyonlar</h2>

        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="py-2">Symbol</th>
              <th className="py-2">Side</th>
              <th className="py-2">Entry</th>
              <th className="py-2">Current</th>
              <th className="py-2">PnL</th>
              <th className="py-2">PnL %</th>
              <th className="py-2">Status</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>

          <tbody>
            {signals.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="py-6 text-center text-gray-500"
                >
                  Açık pozisyon yok
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
                    className="border-b border-gray-700"
                  >
                    <td className="py-3 font-semibold">
                      {s.symbol}
                    </td>

                    <td
                      className={`py-3 font-bold ${
                        s.side === 'LONG'
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}
                    >
                      {s.side}
                    </td>

                    <td className="py-3">
                      {entry.toFixed(2)}
                    </td>

                    <td className="py-3">
                      {current.toFixed(2)}
                    </td>

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

                    <td className="py-3 text-yellow-400">
                      {s.status}
                    </td>

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
    </main>
  )
}