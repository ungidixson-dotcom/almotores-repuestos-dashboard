// Componentes UI compartidos — mismo lenguaje visual que app/dashboard/page.tsx (v21)
import React from 'react'

export const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
export const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`
export const fmtM = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${(n / 1e3).toFixed(0)}K`

export function KpiCard({
  icon, label, value, accent, small, hint,
}: { icon: React.ReactNode; label: string; value: string | number; accent: string; small?: boolean; hint?: string }) {
  const bc: Record<string, string> = { teal: '#4FD1C5', gold: '#E8A33D', blue: '#60A5FA', red: '#E5484D', muted: '#5B6472' }
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 relative overflow-hidden">
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: bc[accent] || '#4FD1C5' }} />
      <div className="flex items-center gap-2 text-brand-subtle mb-2">{icon}<span className="text-xs">{label}</span></div>
      <div className={`font-title font-bold text-brand-text ${small ? 'text-lg' : 'text-2xl'}`}>{value}</div>
      {hint && <p className="text-brand-muted text-xs mt-1 font-mono">{hint}</p>}
    </div>
  )
}

export function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
      <h3 className="font-title text-base font-semibold text-brand-text">{title}</h3>
      {sub && <p className="text-xs text-brand-subtle mb-4">{sub}</p>}
      {children}
    </div>
  )
}

export function StatBadge({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  const cls: Record<string, string> = { teal: 'text-brand-teal', gold: 'text-brand-gold', red: 'text-brand-red' }
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 flex justify-between items-center">
      <div className="flex items-center gap-2 text-brand-subtle text-sm">{icon}{label}</div>
      <span className={`font-mono font-bold text-xl ${cls[color] || ''}`}>{value}</span>
    </div>
  )
}

export function EnConstruccion({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="p-6">
      <h1 className="font-title text-2xl font-bold text-brand-text mb-1">{titulo}</h1>
      <p className="text-brand-subtle text-sm mb-6">{detalle}</p>
      <div className="bg-brand-surface border border-dashed border-brand-border rounded-xl p-12 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-brand-gold/10 border border-brand-gold/30 flex items-center justify-center mb-4">
          <span className="text-brand-gold text-xl">⚠</span>
        </div>
        <p className="font-title text-brand-text font-semibold mb-1">Módulo en construcción</p>
        <p className="text-brand-subtle text-sm max-w-md">
          Este informe está pendiente de conexión de datos. Se irá activando a medida que se sincronicen las fuentes correspondientes.
        </p>
      </div>
    </div>
  )
}
