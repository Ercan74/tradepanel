'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

export default function Home() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    router.push('/dashboard')
  }

  async function handleSignup() {
    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    alert('Kayıt başarılı. Şimdi giriş yapabilirsin.')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="bg-gray-900 p-8 rounded-xl w-80 flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-center">TradePanel</h1>

        <input
          className="p-2 bg-gray-800 rounded"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="p-2 bg-gray-800 rounded"
          placeholder="Şifre"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="bg-blue-500 p-2 rounded"
        >
          {loading ? 'Yükleniyor...' : 'Giriş Yap'}
        </button>

        <button
          onClick={handleSignup}
          disabled={loading}
          className="bg-green-500 p-2 rounded"
        >
          Kayıt Ol
        </button>
      </div>
    </main>
  )
}