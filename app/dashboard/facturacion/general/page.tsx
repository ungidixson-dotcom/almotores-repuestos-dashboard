'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid, Cell,
} from 'recharts'
import { supabase } from '@/lib/supabase'

// ── Tipos ────────────────────────────────────────────────────────────────────
interface FilaVista {
  canal:       string
  sede:        string
  mes:         string
  anio:        number
  neto:        number
  costo:       number
  beneficio:   number
  presupuesto: number
  pct_avance:  number
  pct_margen:  number
  lineas:      number
}

interface CanalData {
  canal:   string
  icon:    string
  color:   string
  neto:    number
  costo:   number
  util:    number
  pctUtil: number
  ppto:    number
  pct:     number
  porDia:  number
  neces:   number
  pron:    number
  pctPron: number
  estado:  'ok' | 'alerta' | 'riesgo'
}

// ── Constantes ───────────────────────────────────────────────────────────────
const MESES_KEY = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
]
const MESES_LABEL = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const SEDES_LIST = ['Todas','Norte','Pasoancho','Sede 39']

const CANALES_CONFIG = [
  { canal:'Taller',     icon:'🔧', color:'#4FD1C5' },
  { canal:'Colisión',   icon:'🚗', color:'#F6AD55' },
  { canal:'Accesorios', icon:'🎁', color:'#B794F4' },
  { canal:'Mostrador',  icon:'🛒', color:'#68D391' },
  { canal:'Mayoristas', icon:'📦', color:'#63B3ED' },
  { canal:'Subastas',   icon:'🔨', color:'#F687B3' },
]

const FESTIVOS = new Set([
  '2025-01-01','2025-01-06','2025-03-24','2025-04-17','2025-04-18','2025-05-01',
  '2025-06-02','2025-06-23','2025-06-30','2025-07-20','2025-08-07','2025-08-18',
  '2025-10-13','2025-11-03','2025-11-17','2025-12-08','2025-12-25',
  '2026-01-01','2026-01-05','2026-03-23','2026-04-02','2026-04-03','2026-05-01',
  '2026-05-18','2026-06-08','2026-06-29','2026-07-20','2026-08-07','2026-08-17',
  '2026-10-12','2026-11-02','2026-11-16','2026-12-08','2026-12-25',
])

// ── Utilidades ───────────────────────────────────────────────────────────────
const fmtCOP = (v: number): string => {
  const abs = Math.abs(v), sign = v < 0 ? '-' : ''
  return `${sign}$${abs.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
const fmtPct = (v: number) => `${v.toFixed(1)}%`

const esDiaHabil = (d: Date) =>
  d.getDay() !== 0 && !FESTIVOS.has(d.toISOString().slice(0, 10))

const diasHabilesEnMes = (a: number, m: number) => {
  const d = new Date(a, m - 1, 1); let c = 0
  while (d.getMonth() === m - 1) { if (esDiaHabil(d)) c++; d.setDate(d.getDate() + 1) }
  return c
}

const diasHabilesHasta = (a: number, m: number, dia: number) => {
  const d = new Date(a, m - 1, 1); let c = 0
  while (d.getDate() <= dia && d.getMonth() === m - 1) {
    if (esDiaHabil(d)) c++; d.setDate(d.getDate() + 1)
  }
  return c
}

// ── Componentes base ─────────────────────────────────────────────────────────
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-brand-border bg-brand-surface p-5 ${className}`}>
      {children}
    </div>
  )
}

function ProgressBar({ pct, color, h = 'h-2' }: { pct: number; color: string; h?: string }) {
  return (
    <div className={`w-full ${h} bg-brand-border rounded-full overflow-hidden`}>
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  )
}

function Badge({ tipo }: { tipo: 'ok' | 'alerta' | 'riesgo' }) {
  if (tipo === 'ok')     return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-mono">✓ Óptimo</span>
  if (tipo === 'alerta') return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-mono">⚠ Aceptable</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-mono">✗ Deficiente</span>
}

function KpiCard({ label, value, sub, sub2, accent = 'text-brand-teal', alert = false }: {
  label: string; value: string; sub?: string; sub2?: string; accent?: string; alert?: boolean
}) {
  return (
    <Panel className={alert ? 'border-red-500/40' : ''}>
      <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">{label}</p>
      <p className={`text-xl font-bold font-title ${accent}`}>{value}</p>
      {sub  && <p className="text-xs text-brand-subtle mt-1">{sub}</p>}
      {sub2 && <p className="text-xs text-brand-subtle mt-0.5">{sub2}</p>}
    </Panel>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-brand-surface border border-brand-border rounded-lg p-3 shadow-lg">
      <p className="text-xs font-mono text-brand-subtle mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs font-mono" style={{ color: p.color }}>
          {p.name}: {p.name.includes('%') ? fmtPct(p.value) : fmtCOP(p.value)}
        </p>
      ))}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function FacGeneralPage() {
  const hoy  = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes,  setMes]  = useState(hoy.getMonth() + 1)
  const [sedes, setSedes] = useState<Set<string>>(new Set(['Todas']))
  const [sinColision, setSinColision] = useState(false)

  // Lógica de toggle multiselección
  const toggleSede = (s: string) => {
    setSedes(prev => {
      const next = new Set(prev)
      if (s === 'Todas') return new Set(['Todas'])
      next.delete('Todas')
      if (next.has(s)) {
        next.delete(s)
        if (next.size === 0) return new Set(['Todas'])
      } else {
        next.add(s)
        // Si están todas las sedes individuales seleccionadas → colapsar a 'Todas'
        const indiv = ['Norte', 'Pasoancho', 'Sede 39']
        if (indiv.every(i => next.has(i))) return new Set(['Todas'])
      }
      return next
    })
  }
  const todasActivo = sedes.has('Todas')

  const [filas,     setFilas]     = useState<FilaVista[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [ultimaAct, setUltimaAct] = useState<Date | null>(null)

  // ── Carga desde Supabase ──────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, error: err } = await supabase
        .from('v_facturacion_general')
        .select('canal, sede, mes, anio, neto, costo, beneficio, presupuesto, pct_avance, pct_margen, lineas')
        .eq('anio', anio)
      if (err) throw err
      setFilas((data ?? []) as FilaVista[])
      setUltimaAct(new Date())
    } catch (e: any) {
      setError(`Error cargando datos: ${e?.message ?? 'intente de nuevo'}`)
    }
    setLoading(false)
  }, [anio])

  useEffect(() => { cargar() }, [cargar])

  // ── Días hábiles ──────────────────────────────────────────────────────────
  const totalDH  = useMemo(() => diasHabilesEnMes(anio, mes), [anio, mes])
  const dhTransc = useMemo(() => (
    anio === hoy.getFullYear() && mes === hoy.getMonth() + 1
      ? diasHabilesHasta(anio, mes, hoy.getDate())
      : totalDH
  ), [anio, mes, totalDH])
  const dhRest  = totalDH - dhTransc
  const pctDias = totalDH ? (dhTransc / totalDH) * 100 : 0

  // ── Filtrar por mes y sede ────────────────────────────────────────────────
  const filasFiltradas = useMemo(() => {
    const mesClave = MESES_KEY[mes - 1]
    return filas.filter(f => {
      if (f.mes !== mesClave) return false
      if (f.canal === 'Colisión' && sinColision) return false
      if (todasActivo) return true
      if (f.canal === 'Colisión') return false
      return sedes.has(f.sede)
    })
  }, [filas, mes, sedes, todasActivo, sinColision])

  // ── Datos por canal ───────────────────────────────────────────────────────
  const canalesData = useMemo((): CanalData[] => {
    return CANALES_CONFIG
      .filter(c => {
        if (c.canal === 'Colisión' && sinColision) return false
        return todasActivo || c.canal !== 'Colisión'
      })
      .map(c => {
        // Sumar todas las filas que corresponden a este canal (puede haber varias sedes)
        const filasCanal = filasFiltradas.filter(f => f.canal === c.canal)
        const neto  = filasCanal.reduce((s, f) => s + Number(f.neto), 0)
        const costo = filasCanal.reduce((s, f) => s + Number(f.costo), 0)
        const ppto  = filasCanal.reduce((s, f) => s + Number(f.presupuesto), 0)
        const util  = neto - costo

        const pctUtil = neto ? (util / neto) * 100 : 0
        const pct     = ppto ? (neto / ppto) * 100 : 0
        const porDia  = dhTransc ? neto / dhTransc : 0
        const restante = ppto - neto
        const neces   = dhRest > 0 && restante > 0 ? restante / dhRest : 0
        const pron    = neto + porDia * dhRest
        const pctPron = ppto ? (pron / ppto) * 100 : 0
        const estado: 'ok' | 'alerta' | 'riesgo' =
          pctPron >= 95 ? 'ok' : pctPron >= 85 ? 'alerta' : 'riesgo'

        return { ...c, neto, costo, util, pctUtil, ppto, pct, porDia, neces, pron, pctPron, estado }
      })
  }, [filasFiltradas, dhTransc, dhRest, todasActivo, sinColision])

  // ── Totales ───────────────────────────────────────────────────────────────
  const totalNeto    = canalesData.reduce((s, c) => s + c.neto, 0)
  const totalCosto   = canalesData.reduce((s, c) => s + c.costo, 0)
  const totalUtil    = totalNeto - totalCosto
  const totalPpto    = canalesData.reduce((s, c) => s + c.ppto, 0)
  const totalPct     = totalPpto ? (totalNeto / totalPpto) * 100 : 0
  const totalPctUtil = totalNeto ? (totalUtil / totalNeto) * 100 : 0
  const porDiaTotal  = dhTransc ? totalNeto / dhTransc : 0
  const restanteTotal = totalPpto - totalNeto
  const necesTotal   = dhRest > 0 && restanteTotal > 0 ? restanteTotal / dhRest : 0
  const pronTotal    = totalNeto + porDiaTotal * dhRest
  const pctPronTotal = totalPpto ? (pronTotal / totalPpto) * 100 : 0
  const estadoGeneral: 'ok' | 'alerta' | 'riesgo' =
    pctPronTotal >= 95 ? 'ok' : pctPronTotal >= 85 ? 'alerta' : 'riesgo'
  const colorGeneral =
    estadoGeneral === 'ok' ? '#68D391' : estadoGeneral === 'alerta' ? '#F6AD55' : '#FC8181'

  // ── Datos gráficas ────────────────────────────────────────────────────────
  const graficoCanales = canalesData.map(c => ({
    name: c.canal, Facturado: c.neto, Presupuesto: c.ppto, Utilidad: c.util,
  }))
  const graficoComparativo = canalesData.map(c => ({
    name: c.canal,
    '% Avance':     parseFloat(c.pct.toFixed(1)),
    '% Pronóstico': parseFloat(c.pctPron.toFixed(1)),
  }))

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-brand-subtle text-sm font-mono">Cargando datos...</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-title text-brand-text">Facturación General</h1>
          <p className="text-sm text-brand-subtle mt-0.5">
            Seguimiento vs presupuesto · pronóstico · utilidad · {MESES_LABEL[mes - 1]} {anio}
            {!todasActivo ? ` · ${Array.from(sedes).join(' + ')}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-brand-border overflow-hidden">
              {SEDES_LIST.map(s => {
                const activo = s === 'Todas' ? todasActivo : sedes.has(s)
                return (
                  <button key={s} onClick={() => toggleSede(s)}
                    className={`px-3 py-2 text-xs font-mono transition-colors relative ${
                      activo
                        ? 'bg-brand-teal text-black font-semibold'
                        : 'text-brand-subtle hover:text-brand-text hover:bg-brand-surface'
                    }`}>
                    {s}
                    {activo && s !== 'Todas' && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand-teal rounded-full border border-black"/>
                    )}
                  </button>
                )
              })}
            </div>
            {/* Divisor + botón Sin Colisión */}
            <div className="w-px h-6 bg-brand-border"/>
            <button onClick={() => setSinColision(v => !v)}
              className={`px-3 py-2 text-xs font-mono rounded-lg border transition-colors ${
                sinColision
                  ? 'bg-brand-red/20 border-brand-red/50 text-brand-red font-semibold'
                  : 'border-brand-border text-brand-subtle hover:text-brand-text'
              }`}>
              {sinColision ? '✕ Sin Colisión' : '∅ Sin Colisión'}
            </button>
          </div>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            {[2024, 2025, 2026].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={mes} onChange={e => setMes(Number(e.target.value))}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            {MESES_LABEL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <button onClick={cargar} disabled={loading}
            className="bg-brand-teal/20 hover:bg-brand-teal/30 border border-brand-teal/40 text-brand-teal rounded-lg px-4 py-2 text-sm font-mono transition-colors disabled:opacity-50">
            {loading ? '...' : '↻ Actualizar'}
          </button>
          {ultimaAct && (
            <span className="text-xs text-brand-subtle font-mono">
              Act: {ultimaAct.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-400 text-sm font-mono">
          {error}
        </div>
      )}

      {/* ── PANEL PRINCIPAL: % Avance vs Presupuesto (prioridad visual máxima) ── */}
      <Panel className="border-brand-teal/30">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">
              Avance vs presupuesto — {MESES_LABEL[mes - 1]} {anio}
              {!todasActivo ? ` · ${Array.from(sedes).join(' + ')}` : ''}
            </p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl font-bold font-title" style={{ color: colorGeneral }}>
                {fmtPct(totalPct)}
              </span>
              <span className="text-sm text-brand-subtle font-mono">
                {fmtCOP(totalNeto)} de {fmtCOP(totalPpto)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-mono text-brand-subtle">Pronóstico cierre</p>
              <p className="text-xl font-bold font-title"
                style={{ color: pctPronTotal >= 95 ? '#68D391' : pctPronTotal >= 85 ? '#F6AD55' : '#FC8181' }}>
                {fmtPct(pctPronTotal)}
              </p>
            </div>
            <Badge tipo={estadoGeneral} />
          </div>
        </div>
        {/* Barra avance con marcador de días hábiles */}
        <div className="relative mb-2">
          <ProgressBar pct={totalPct} color={colorGeneral} h="h-4" />
          <div className="absolute top-0 h-full flex items-center pointer-events-none"
            style={{ left: `${Math.min(100, pctDias)}%` }}>
            <div className="w-0.5 h-6 bg-white/50 -mt-1" />
          </div>
        </div>
        <div className="flex justify-between text-xs font-mono text-brand-subtle">
          <span>{fmtPct(totalPct)} facturado</span>
          <span className="opacity-50">↑ {fmtPct(pctDias)} días hábiles</span>
          <span>{fmtCOP(totalPpto)} presupuesto</span>
        </div>
      </Panel>

      {/* ── Días hábiles ── */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle">
              Días hábiles — {MESES_LABEL[mes - 1]} {anio}
            </p>
            <p className="text-lg font-bold font-title text-brand-text mt-0.5">
              {dhTransc} de {totalDH} transcurridos · {dhRest} restantes
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold font-title text-brand-teal">{pctDias.toFixed(0)}%</p>
            <p className="text-xs text-brand-subtle font-mono">del mes avanzado</p>
          </div>
        </div>
        <ProgressBar pct={pctDias} color="#4FD1C5" />
      </Panel>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Facturado total" value={fmtCOP(totalNeto)}
          sub={`de ${fmtCOP(totalPpto)}`} sub2={`${fmtPct(totalPct)} de avance`}
          accent="text-brand-teal" />
        <KpiCard label="Utilidad" value={fmtCOP(totalUtil)}
          sub={`Margen: ${fmtPct(totalPctUtil)}`} sub2={`Costo: ${fmtCOP(totalCosto)}`}
          accent="text-green-400" />
        <KpiCard label="Facturación / día" value={fmtCOP(porDiaTotal)}
          sub={necesTotal > 0 ? `Necesario: ${fmtCOP(necesTotal)}/día` : '✓ Presupuesto alcanzado'}
          sub2={porDiaTotal >= necesTotal && necesTotal > 0 ? '✓ Por encima del ritmo' : necesTotal === 0 ? '' : '✗ Por debajo del ritmo'}
          accent={porDiaTotal >= necesTotal ? 'text-green-400' : 'text-yellow-400'} />
        <KpiCard label="Pronóstico cierre" value={fmtCOP(pronTotal)}
          sub={`${fmtPct(pctPronTotal)} del presupuesto`}
          accent={pctPronTotal >= 95 ? 'text-green-400' : pctPronTotal >= 85 ? 'text-yellow-400' : 'text-red-400'}
          alert={estadoGeneral === 'riesgo'} />
      </div>

      {/* ── Círculos de progreso por canal ── */}
      <Panel>
        <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-6">
          Cumplimiento vs presupuesto por canal · {todasActivo ? 'Todas las sedes' : Array.from(sedes).join(' + ')}
        </h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-6">
          {canalesData.map(c => {
            const pct      = Math.min(100, Math.max(0, c.pct))
            const r        = 36
            const circum   = 2 * Math.PI * r
            const offset   = circum - (pct / 100) * circum
            const clr      = c.pct >= pctDias ? '#68D391' : c.pct >= pctDias * 0.8 ? '#F6AD55' : '#FC8181'
            return (
              <div key={c.canal} className="flex flex-col items-center gap-2">
                <div className="relative w-24 h-24">
                  <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
                    {/* Track */}
                    <circle cx="44" cy="44" r={r} fill="none" stroke="#2D3748" strokeWidth="8"/>
                    {/* Progress */}
                    <circle cx="44" cy="44" r={r} fill="none"
                      stroke={clr} strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={circum}
                      strokeDashoffset={offset}
                      style={{transition:'stroke-dashoffset 0.7s ease'}}
                    />
                    {/* Marcador días hábiles */}
                    <circle cx="44" cy="44" r={r} fill="none"
                      stroke="rgba(255,255,255,0.2)" strokeWidth="2"
                      strokeDasharray={`2 ${circum - 2}`}
                      strokeDashoffset={-(circum * pctDias / 100)}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xs font-mono text-brand-subtle">{c.icon}</span>
                    <span className="text-sm font-bold font-title" style={{color: clr}}>
                      {c.pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-brand-text">{c.canal}</p>
                  <p className="text-xs font-mono text-brand-subtle mt-0.5">{fmtCOP(c.neto)}</p>
                </div>
              </div>
            )
          })}
        </div>
        {/* Leyenda */}
        <div className="flex items-center gap-6 mt-6 pt-4 border-t border-brand-border">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-400"/><span className="text-xs font-mono text-brand-subtle">Óptimo</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-400"/><span className="text-xs font-mono text-brand-subtle">Aceptable</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-400"/><span className="text-xs font-mono text-brand-subtle">Deficiente</span></div>
          <div className="flex items-center gap-2 ml-auto"><div className="w-4 h-0.5 bg-white/20"/><span className="text-xs font-mono text-brand-subtle">↑ {fmtPct(pctDias)} días hábiles</span></div>
        </div>
      </Panel>

      {/* ── Tabla por canal ── */}
      <Panel>
        <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
          Detalle por canal · {todasActivo ? 'Todas las sedes' : Array.from(sedes).join(' + ')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Canal','Presupuesto','Neto','Costo','Utilidad','% Util','% Avance','$/Día','Necesario/día','Pronóstico','Estado'].map(h => (
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {canalesData.map(c => (
                <tr key={c.canal} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span>{c.icon}</span>
                      <span className="font-medium text-brand-text">{c.canal}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(c.ppto)}</td>
                  <td className="py-3 pr-4 font-mono text-xs font-semibold" style={{ color: c.color }}>{fmtCOP(c.neto)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(c.costo)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-green-400">{fmtCOP(c.util)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtPct(c.pctUtil)}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2 min-w-[110px]">
                      <div className="w-14 h-1.5 bg-brand-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, c.pct)}%`, background: c.color }} />
                      </div>
                      <span className="font-mono text-xs text-brand-subtle">{fmtPct(c.pct)}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(c.porDia)}</td>
                  <td className="py-3 pr-4 font-mono text-xs">
                    <span className={c.neces === 0 ? 'text-green-400' : 'text-brand-subtle'}>
                      {c.neces === 0 ? '✓ Cumplido' : fmtCOP(c.neces)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(c.pron)}</td>
                  <td className="py-3 pr-4"><Badge tipo={c.estado} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brand-border font-bold">
                <td className="pt-3 pr-4 font-mono text-xs uppercase text-brand-text">Total</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(totalPpto)}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-teal">{fmtCOP(totalNeto)}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(totalCosto)}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-green-400">{fmtCOP(totalUtil)}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtPct(totalPctUtil)}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtPct(totalPct)}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(porDiaTotal)}</td>
                <td className="pt-3 pr-4 font-mono text-xs">
                  <span className={necesTotal === 0 ? 'text-green-400' : 'text-brand-subtle'}>
                    {necesTotal === 0 ? '✓ Cumplido' : fmtCOP(necesTotal)}
                  </span>
                </td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(pronTotal)}</td>
                <td className="pt-3 pr-4"><Badge tipo={estadoGeneral} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      {/* ── Gráficas ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel>
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
            Facturado vs Presupuesto por canal
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={graficoCanales} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#718096', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#718096', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => fmtCOP(v)} width={110} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#718096' }} />
              <Bar dataKey="Presupuesto" fill="#2D3748" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Facturado"   fill="#4FD1C5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel>
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
            % Avance vs % Pronóstico por canal
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={graficoComparativo} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#718096', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#718096', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#718096' }} />
              <Bar dataKey="% Avance"     fill="#4FD1C5" radius={[4, 4, 0, 0]} />
              <Bar dataKey="% Pronóstico" fill="#F6AD55" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel>
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
            Utilidad por canal
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={graficoCanales} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#718096', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#718096', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => fmtCOP(v)} width={110} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Utilidad" radius={[4, 4, 0, 0]}>
                {graficoCanales.map((entry, i) => {
                  const cfg = CANALES_CONFIG.find(c => c.canal === entry.name)
                  return <Cell key={i} fill={cfg?.color ?? '#4FD1C5'} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel>
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
            Resumen por canal
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {canalesData.map(c => (
              <div key={c.canal} className={`rounded-lg border p-3 ${
                c.estado === 'riesgo' ? 'border-red-500/30' :
                c.estado === 'alerta' ? 'border-yellow-500/20' : 'border-brand-border'
              }`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-brand-text">{c.icon} {c.canal}</span>
                  <Badge tipo={c.estado} />
                </div>
                <ProgressBar pct={c.pct} color={c.color} />
                <div className="flex justify-between mt-1 text-xs font-mono text-brand-subtle">
                  <span>{fmtPct(c.pct)}</span>
                  <span>Pron: {fmtPct(c.pctPron)}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Datos desde Supabase · Sincronización automática diaria desde Google Sheets ·
        Días hábiles lunes–sábado sin festivos Colombia
      </p>
    </div>
  )
}
