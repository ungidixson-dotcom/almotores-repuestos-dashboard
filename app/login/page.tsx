'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Credenciales incorrectas. Verifica tu correo y contraseña.')
    } else {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <p className="font-mono text-xs tracking-widest text-brand-gold uppercase mb-2">
            Almotores KIA · Repuestos
          </p>
          <h1 className="font-title text-3xl font-bold text-brand-text">
            Torre de Control
          </h1>
          <p className="text-brand-subtle text-sm mt-2">
            Ingresa con tu cuenta de equipo
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleLogin}
          className="bg-brand-surface border border-brand-border rounded-2xl p-8 flex flex-col gap-5"
        >
          <div className="flex flex-col gap-2">
            <label className="font-mono text-xs text-brand-subtle uppercase tracking-wider">
              Correo electrónico
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@almotores.com.co"
              className="bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text text-sm outline-none focus:border-brand-teal transition-colors"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-mono text-xs text-brand-subtle uppercase tracking-wider">
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text text-sm outline-none focus:border-brand-teal transition-colors"
            />
          </div>

          {error && (
            <p className="text-brand-red text-sm bg-red-950/30 border border-brand-red/30 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-brand-teal text-brand-bg font-semibold rounded-lg py-3 text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p className="text-center text-brand-muted text-xs mt-6 font-mono">
          acceso restringido · equipo almotores
        </p>
      </div>
    </div>
  )
}
