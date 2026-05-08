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
        () => {
          fetchSignals()
        }
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
    } else {
      setSignals(data || [])
    }
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
              <th className="py-2">Price</th>
              <th className="py-2">Status</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>

          <tbody>
            {signals.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-6 text-center text-gray-500"
                >
                  Açık pozisyon yok
                </td>
              </tr>
            ) : (
              signals.map((s) => (
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
                    {Number(s.price).toFixed(2)}
                  </td>

                  <td className="py-3 text-yellow-400">
                    {s.status}
                  </td>

                  <td className="py-3 text-gray-400 text-sm">
                    {new Date(s.created_at).toLocaleString('tr-TR')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}