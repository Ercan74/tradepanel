'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Dashboard() {
  const [signals, setSignals] = useState<any[]>([])

  useEffect(() => {
    fetchSignals()
  }, [])

  async function fetchSignals() {
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
    } else {
      setSignals(data)
    }
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-10">
      <h1 className="text-3xl font-bold mb-6">📊 TradePanel Dashboard</h1>

      <div className="bg-gray-800 p-6 rounded-xl">
        <h2 className="text-xl mb-4">Açık Pozisyonlar</h2>

        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th>Symbol</th>
              <th>Side</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {signals.map((s) => (
              <tr key={s.id} className="border-b border-gray-700">
                <td>{s.symbol}</td>
                <td>{s.side}</td>
                <td>{s.price}</td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}