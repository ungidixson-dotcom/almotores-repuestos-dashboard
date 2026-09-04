'use client'
import type { MesDisponible } from '../types'
import {
  fmtM, fmtCOP, fmtNum, fmtPct, fmtDelta, calcDelta,
  VITRINA_BG, SEMAFORO_BADGE, MESES,
  semaforoVentas, semaforoTicket,
} from '../utils'

// ── KpiCard ───────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  subColor?: string
  delta?: string
  deltaPositivo?: boolean | null
}

export function KpiCard({ label, value, sub, subColor, delta, deltaPositivo }: KpiCardProps) {
  const deltaColor = deltaPositivo == null ? 'text-brand-muted'
                   : deltaPositivo         ? 'text-brand-teal'
                   :                         'text-brand-red'
  return (
    <div className="bg-brand-surface border border-brand-border rounded-lg p-4">
      <p className="text-xs text-brand-muted uppercase tracking-widest mb-2">{label}</p>
      <p className="font-mono text-xl font-medium text-brand-text leading-none mb-1">{value}</p>
      {sub   && <p className={`text-xs mt-1 ${subColor ?? 'text-brand-muted'}`}>{sub}</p>}
      {delta && <p className={`text-xs mt-1 font-medium ${deltaColor}`}>{delta}</p>}
    </div>
  )
}

// ── VitrinaBadge ─────────────────────────────────────────────────────────────

export function VitrinaBadge({ vitrina }: { vitrina: string }) {
  const cls = VITRINA_BG[vitrina] ?? 'bg-brand-muted/10 text-brand-muted'
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {vitrina}
    </span>
  )
}

// ── DeltaBadge ────────────────────────────────────────────────────────────────

interface DeltaBadgeProps {
  actual: number | null
  anterior: number | null
  formato?: 'cop' | 'num' | 'pct'
}

export function DeltaBadge({ actual, anterior, formato = 'cop' }: DeltaBadgeProps) {
  const d = calcDelta(actual, anterior)
  if (!d) return <span className="text-brand-muted text-xs">—</span>
  const cls = d.positivo ? 'bg-teal-500/10 text-teal-300' : 'bg-red-500/10 text-red-400'
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {fmtDelta(d, formato)}
    </span>
  )
}

// ── SemaforoBadge ─────────────────────────────────────────────────────────────

export function SemaforoBadge({ pct }: { pct: number | null }) {
  const s = semaforoVentas(pct)
  const cls = SEMAFORO_BADGE[s]
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {fmtPct(pct)} meta
    </span>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────────────────

export function ProgressBar({ pct, color }: { pct: number | null; color?: string }) {
  const w    = Math.min(pct ?? 0, 100)
  const fill = color ?? (w >= 80 ? 'bg-brand-teal' : w >= 45 ? 'bg-brand-gold' : 'bg-brand-red')
  return (
    <div className="w-full bg-brand-border rounded-full h-1 mt-2 overflow-hidden">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${w}%` }} />
    </div>
  )
}

// ── MesSelector ───────────────────────────────────────────────────────────────

interface MesSelectorProps {
  anio: number
  mes: number
  meses: MesDisponible[]
  onChange: (anio: number, mes: number) => void
}

export function MesSelector({ anio, mes, meses, onChange }: MesSelectorProps) {
  // Generar todos los meses de los años disponibles en los datos
  const anios = [...new Set(meses.map(m => m.anio))].sort((a, b) => b - a)

  return (
    <div className="flex items-center gap-2">
      <select
        value={anio}
        onChange={e => onChange(Number(e.target.value), mes)}
        className="bg-brand-surface border border-brand-border text-brand-text text-sm rounded px-2 py-1 focus:outline-none focus:border-brand-subtle"
      >
        {anios.map(a => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      <select
        value={mes}
        onChange={e => onChange(anio, Number(e.target.value))}
        className="bg-brand-surface border border-brand-border text-brand-text text-sm rounded px-2 py-1 focus:outline-none focus:border-brand-subtle"
      >
        {MESES.map((nombre, i) => (
          <option key={i + 1} value={i + 1}>{nombre}</option>
        ))}
      </select>
    </div>
  )
}

// ── Tabla base ────────────────────────────────────────────────────────────────

interface TablaTh { label: string; right?: boolean }

export function TablaHeader({ cols }: { cols: TablaTh[] }) {
  return (
    <thead>
      <tr className="border-b border-brand-border">
        {cols.map((c, i) => (
          <th
            key={i}
            className={`px-3 py-2 text-xs font-medium text-brand-muted uppercase tracking-widest bg-brand-surface
              ${c.right ? 'text-right' : 'text-left'}`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  )
}

// ── Rank badge ────────────────────────────────────────────────────────────────

export function RankBadge({ rank }: { rank: number }) {
  const cls = rank === 1 ? 'bg-amber-500 text-amber-900'
            : rank === 2 ? 'bg-slate-400 text-slate-900'
            : rank === 3 ? 'bg-amber-700 text-amber-100'
            :               'bg-brand-border text-brand-muted'
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${cls}`}>
      {rank}
    </span>
  )
}
