'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface LineaTaller {
  referencia:      number
  prefijo_num:     string
  nombre_cliente:  string
  nombre_vendedor: string
  cuenta:          number
  fecha_cierre:    string
  prefijo:         string
  taller:          string
  neto:            number
  costo:           number
  beneficio:       number
  sede:            string
  tipo_taller:     string
}

interface ResumenVista {
  canal:       string
  sede:        string
  mes:         string
  anio:        number
  neto:        number
  costo:       number
  beneficio:   number
  presupuesto: number
}

interface PresupuestoDetalle {
  sede:        string
  dependencia: string
  julio:       number
  [key: string]: any
}

// ── Constantes ────────────────────────────────────────────────────────────────
const MESES_KEY = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
]
const MESES_LABEL = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const SEDES = ['Todas', 'Norte', 'Pasoancho', 'Sede 39']
const TIPOS = ['Todos', 'Clientes', 'Garantías', 'Interno']

const MESES_COLS: Record<string, string> = {
  'enero':'enero','febrero':'febrero','marzo':'marzo','abril':'abril',
  'mayo':'mayo','junio':'junio','julio':'julio','agosto':'agosto',
  'septiembre':'septiembre','octubre':'octubre','noviembre':'noviembre','diciembre':'diciembre',
}

const FESTIVOS = new Set([
  '2025-01-01','2025-01-06','2025-03-24','2025-04-17','2025-04-18','2025-05-01',
  '2025-06-02','2025-06-23','2025-06-30','2025-07-20','2025-08-07','2025-08-18',
  '2025-10-13','2025-11-03','2025-11-17','2025-12-08','2025-12-25',
  '2026-01-01','2026-01-05','2026-03-23','2026-04-02','2026-04-03','2026-05-01',
  '2026-05-18','2026-06-08','2026-06-29','2026-07-20','2026-08-07','2026-08-17',
  '2026-10-12','2026-11-02','2026-11-16','2026-12-08','2026-12-25',
])

// ── Utilidades ────────────────────────────────────────────────────────────────
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

// ── Componentes base ──────────────────────────────────────────────────────────
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-brand-border bg-brand-surface p-5 ${className}`}>
      {children}
    </div>
  )
}

function KpiCard({ label, value, sub, sub2, accent = 'text-brand-teal' }: {
  label: string; value: string; sub?: string; sub2?: string; accent?: string
}) {
  return (
    <Panel>
      <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">{label}</p>
      <p className={`text-xl font-bold font-title ${accent}`}>{value}</p>
      {sub  && <p className="text-xs text-brand-subtle mt-1">{sub}</p>}
      {sub2 && <p className="text-xs text-brand-subtle mt-0.5">{sub2}</p>}
    </Panel>
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

// ── Página principal ──────────────────────────────────────────────────────────
export default function TallerPage() {
  const hoy = new Date()
  const [anio, setAnio]   = useState(hoy.getFullYear())
  const [mes,  setMes]    = useState(hoy.getMonth() + 1)
  const [sede, setSede]   = useState('Todas')
  const [tipo, setTipo]   = useState('Todos')
  const [buscar, setBuscar] = useState('')

  const [lineas,    setLineas]    = useState<LineaTaller[]>([])
  const [resumen,   setResumen]   = useState<ResumenVista[]>([])
  const [pptoDetalle, setPptoDetalle] = useState<PresupuestoDetalle[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [ultimaAct, setUltimaAct] = useState<Date | null>(null)

  // ── Carga ─────────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [{ data: dataLineas }, { data: dataResumen }, { data: dataPpto }] = await Promise.all([
        supabase
          .from('v_taller_facturas')
          .select('referencia, prefijo_num, nombre_cliente, nombre_vendedor, cuenta, fecha_cierre, prefijo, taller, neto, costo, beneficio, sede, tipo_taller, lineas')
          .eq('canal', 'Taller')
          .eq('anio', anio)
          .eq('mes', MESES_KEY[mes - 1])
          .limit(5000),
        supabase
          .from('v_facturacion_general')
          .select('canal, sede, mes, anio, neto, costo, beneficio, presupuesto')
          .eq('canal', 'Taller')
          .eq('anio', anio),
        supabase
          .from('presupuesto')
          .select('sede, dependencia, enero, febrero, marzo, abril, mayo, junio, julio, agosto, septiembre, octubre, noviembre, diciembre')
          .eq('canal', 'Taller')
          .eq('anio', anio),
      ])

      setLineas((dataLineas ?? []) as LineaTaller[])
      setResumen((dataResumen ?? []) as ResumenVista[])
      setPptoDetalle((dataPpto ?? []) as PresupuestoDetalle[])
      setUltimaAct(new Date())
    } catch (e: any) {
      setError(`Error cargando datos: ${e?.message ?? 'intente de nuevo'}`)
    }
    setLoading(false)
  }, [anio, mes])

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

  // ── Presupuesto por tipo y sede ───────────────────────────────────────────
  const mesCol = MESES_KEY[mes - 1]
  const getPpto = (sedeFiltro: string, tipoFiltro: string): number => {
    return pptoDetalle
      .filter(p => {
        const matchSede = sedeFiltro === 'Todas' || p.sede === sedeFiltro
        const matchTipo = tipoFiltro === 'Todos' ||
          (tipoFiltro === 'Clientes'  && p.dependencia?.includes('Clientes')) ||
          (tipoFiltro === 'Garantías' && p.dependencia?.includes('Garantia')) ||
          (tipoFiltro === 'Interno'   && p.dependencia?.includes('Interno'))
        return matchSede && matchTipo
      })
      .reduce((s, p) => s + Number(p[mesCol] ?? 0), 0)
  }

  // ── Filtrado de líneas ────────────────────────────────────────────────────
  const lineasFiltradas = useMemo(() => {
    return lineas.filter(l => {
      if (sede !== 'Todas' && l.sede !== sede) return false
      if (tipo !== 'Todos' && l.tipo_taller !== tipo) return false
      return true
    })
  }, [lineas, sede, tipo])

  // ── Facturas — ya vienen agrupadas por referencia desde la vista ─────────
  const facturas = useMemo(() => {
    return lineasFiltradas
      .map(l => ({
        referencia:  l.referencia,
        prefijo_num: l.prefijo_num || '',
        cliente:     l.nombre_cliente || '',
        asesor:      l.nombre_vendedor || 'Sin asesor',
        taller:      l.taller,
        fecha:       l.fecha_cierre,
        prefijo:     l.prefijo,
        tipo:        l.tipo_taller || '',
        neto:        Number(l.neto),
        costo:       Number(l.costo),
        beneficio:   Number(l.beneficio),
        items:       (l as any).lineas || 1,
      }))
      .sort((a, b) => b.neto - a.neto)
  }, [lineasFiltradas])

  // ── Búsqueda en tabla ─────────────────────────────────────────────────────
  const facturasBuscar = useMemo(() => {
    if (!buscar.trim()) return facturas
    const b = buscar.toLowerCase()
    return facturas.filter(f =>
      f.cliente.toLowerCase().includes(b) ||
      String(f.referencia).includes(b) ||
      f.asesor.toLowerCase().includes(b) ||
      f.taller.includes(b)
    )
  }, [facturas, buscar])

  // ── Totales ───────────────────────────────────────────────────────────────
  const totalNeto  = facturas.reduce((s, f) => s + f.neto,  0)
  const totalCosto = facturas.reduce((s, f) => s + f.costo, 0)
  const totalUtil  = totalNeto - totalCosto
  const totalPpto  = getPpto(sede, tipo)
  const pctAvance  = totalPpto ? (totalNeto / totalPpto) * 100 : 0
  const pctUtil    = totalNeto ? (totalUtil / totalNeto) * 100 : 0
  const porDia     = dhTransc ? totalNeto / dhTransc : 0
  const restante   = totalPpto - totalNeto
  const necesario  = dhRest > 0 && restante > 0 ? restante / dhRest : 0
  const pronostico = totalNeto + porDia * dhRest
  const pctPronos  = totalPpto ? (pronostico / totalPpto) * 100 : 0
  const colorAvance = pctPronos >= 95 ? '#68D391' : pctPronos >= 85 ? '#F6AD55' : '#FC8181'

  // ── Tickets promedio ──────────────────────────────────────────────────────
  const ordenesUnicas   = new Set(lineasFiltradas.map(l => l.referencia)).size
  const vehiculosUnicos = new Set(lineasFiltradas.map(l => l.cuenta)).size
  const ticketPorOrden    = ordenesUnicas   > 0 ? totalNeto / ordenesUnicas   : 0
  const ticketPorVehiculo = vehiculosUnicos > 0 ? totalNeto / vehiculosUnicos : 0

  // ── Desglose por tipo ─────────────────────────────────────────────────────
  const porTipo = useMemo(() => {
    return ['Clientes', 'Garantías', 'Interno'].map(t => {
      const lineasT = lineas.filter(l => {
        const matchSede = sede === 'Todas' || l.sede === sede
        return matchSede && l.tipo_taller === t
      })
      const neto  = lineasT.reduce((s, l) => s + Number(l.neto), 0)
      const costo = lineasT.reduce((s, l) => s + Number(l.costo), 0)
      const ppto  = getPpto(sede, t)
      return {
        tipo: t,
        neto, costo,
        util: neto - costo,
        ppto,
        pct: ppto ? (neto / ppto) * 100 : 0,
      }
    })
  }, [lineas, sede, pptoDetalle, mesCol])

  // ── Por sede ──────────────────────────────────────────────────────────────
  const porSede = useMemo(() => {
    return ['Norte', 'Pasoancho', 'Sede 39'].map(s => {
      const lineasS = lineas.filter(l => l.sede === s && (tipo === 'Todos' || l.tipo_taller === tipo))
      const neto  = lineasS.reduce((s, l) => s + Number(l.neto), 0)
      const costo = lineasS.reduce((s, l) => s + Number(l.costo), 0)
      const ppto  = getPpto(s, tipo)
      return {
        sede: s,
        neto, costo,
        util: neto - costo,
        ppto,
        pct: ppto ? (neto / ppto) * 100 : 0,
      }
    })
  }, [lineas, tipo, pptoDetalle, mesCol])

  // ── Por asesor ────────────────────────────────────────────────────────────
  const porAsesor = useMemo(() => {
    const mapa: Record<string, { neto: number; costo: number; facturas: number }> = {}
    facturas.forEach(f => {
      if (!mapa[f.asesor]) mapa[f.asesor] = { neto: 0, costo: 0, facturas: 0 }
      mapa[f.asesor].neto     += f.neto
      mapa[f.asesor].costo    += f.costo
      mapa[f.asesor].facturas += 1
    })
    return Object.entries(mapa)
      .map(([nombre, d]) => ({ nombre, ...d, util: d.neto - d.costo }))
      .sort((a, b) => b.neto - a.neto)
  }, [facturas])

  // ── Evolución mensual ─────────────────────────────────────────────────────
  const evolucion = useMemo(() => {
    return MESES_KEY.map((m, i) => {
      const fila = resumen.find(r => r.mes === m && (sede === 'Todas' || r.sede === sede))
      const filasTodas = resumen.filter(r => r.mes === m && (sede === 'Todas' || r.sede === sede))
      const neto  = filasTodas.reduce((s, r) => s + Number(r.neto), 0)
      const ppto  = filasTodas.reduce((s, r) => s + Number(r.presupuesto), 0)
      return {
        name: MESES_LABEL[i].slice(0, 3),
        Facturado:   neto,
        Presupuesto: ppto,
      }
    }).filter(r => r.Facturado > 0 || r.Presupuesto > 0)
  }, [resumen, sede])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-brand-subtle text-sm font-mono">Cargando datos...</p>
      </div>
    </div>
  )

  const COLORES_SEDE: Record<string, string> = {
    'Norte': '#4FD1C5', 'Pasoancho': '#68D391', 'Sede 39': '#F6AD55'
  }
  const COLORES_TIPO: Record<string, string> = {
    'Clientes': '#4FD1C5', 'Garantías': '#F6AD55', 'Interno': '#63B3ED'
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-title text-brand-text">🔧 Taller</h1>
          <p className="text-sm text-brand-subtle mt-0.5">
            Repuestos · {sede !== 'Todas' ? sede : 'todas las sedes'} · {tipo !== 'Todos' ? tipo : 'todos los tipos'} · {MESES_LABEL[mes - 1]} {anio}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filtro sede */}
          <div className="flex rounded-lg border border-brand-border overflow-hidden">
            {SEDES.map(s => (
              <button key={s} onClick={() => setSede(s)}
                className={`px-3 py-2 text-xs font-mono transition-colors ${
                  sede === s ? 'bg-brand-teal text-black' : 'text-brand-subtle hover:text-brand-text'
                }`}>{s}</button>
            ))}
          </div>
          {/* Filtro tipo */}
          <div className="flex rounded-lg border border-brand-border overflow-hidden">
            {TIPOS.map(t => (
              <button key={t} onClick={() => setTipo(t)}
                className={`px-3 py-2 text-xs font-mono transition-colors ${
                  tipo === t ? 'bg-brand-teal text-black' : 'text-brand-subtle hover:text-brand-text'
                }`}>{t}</button>
            ))}
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
            className="bg-brand-teal/20 hover:bg-brand-teal/30 border border-brand-teal/40 text-brand-teal rounded-lg px-4 py-2 text-sm font-mono transition-colors">
            ↻ Actualizar
          </button>
          {ultimaAct && (
            <span className="text-xs text-brand-subtle font-mono">
              Act: {ultimaAct.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-400 text-sm font-mono">{error}</div>
      )}

      {/* % Avance — panel principal */}
      <Panel className="border-brand-teal/30">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">
              Avance vs presupuesto — {MESES_LABEL[mes - 1]} {anio}
              {sede !== 'Todas' ? ` · ${sede}` : ''}
              {tipo !== 'Todos' ? ` · ${tipo}` : ''}
            </p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl font-bold font-title" style={{ color: colorAvance }}>
                {fmtPct(pctAvance)}
              </span>
              <span className="text-sm text-brand-subtle font-mono">
                {fmtCOP(totalNeto)} de {fmtCOP(totalPpto)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-mono text-brand-subtle">Pronóstico cierre</p>
            <p className="text-xl font-bold font-title" style={{ color: colorAvance }}>
              {fmtPct(pctPronos)}
            </p>
          </div>
        </div>
        <div className="relative mb-2">
          <ProgressBar pct={pctAvance} color={colorAvance} h="h-4" />
          <div className="absolute top-0 h-full flex items-center pointer-events-none"
            style={{ left: `${Math.min(100, pctDias)}%` }}>
            <div className="w-0.5 h-6 bg-white/50 -mt-1" />
          </div>
        </div>
        <div className="flex justify-between text-xs font-mono text-brand-subtle">
          <span>{fmtPct(pctAvance)} facturado</span>
          <span className="opacity-50">↑ {fmtPct(pctDias)} días hábiles</span>
          <span>{fmtCOP(totalPpto)} presupuesto</span>
        </div>
      </Panel>

      {/* Días hábiles */}
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

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Facturado" value={fmtCOP(totalNeto)}
          sub={`de ${fmtCOP(totalPpto)}`} sub2={`${fmtPct(pctAvance)} de avance`}
          accent="text-brand-teal" />
        <KpiCard label="Utilidad" value={fmtCOP(totalUtil)}
          sub={`Margen: ${fmtPct(pctUtil)}`} sub2={`Costo: ${fmtCOP(totalCosto)}`}
          accent="text-green-400" />
        <KpiCard label="Facturación / día" value={fmtCOP(porDia)}
          sub={necesario > 0 ? `Necesario: ${fmtCOP(necesario)}/día` : '✓ Presupuesto alcanzado'}
          sub2={porDia >= necesario && necesario > 0 ? '✓ Por encima del ritmo' : necesario === 0 ? '' : '✗ Por debajo del ritmo'}
          accent={porDia >= necesario ? 'text-green-400' : 'text-yellow-400'} />
        <KpiCard label="Pronóstico cierre" value={fmtCOP(pronostico)}
          sub={`${fmtPct(pctPronos)} del presupuesto`}
          accent={pctPronos >= 95 ? 'text-green-400' : pctPronos >= 85 ? 'text-yellow-400' : 'text-red-400'} />
      </div>

      {/* ── Tickets promedio ── */}
      <div className="grid grid-cols-2 gap-4">
        <Panel className="border-brand-teal/30">
          <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">
            🔧 Ticket promedio por orden facturada
          </p>
          <p className="text-2xl font-bold font-title text-brand-teal">{fmtCOP(ticketPorOrden)}</p>
          <p className="text-xs text-brand-subtle mt-1">
            {fmtCOP(totalNeto)} ÷ {ordenesUnicas.toLocaleString('es-CO')} órdenes
          </p>
        </Panel>
        <Panel className="border-brand-gold/30">
          <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">
            🚗 Ticket promedio por vehículo
          </p>
          <p className="text-2xl font-bold font-title text-brand-gold">{fmtCOP(ticketPorVehiculo)}</p>
          <p className="text-xs text-brand-subtle mt-1">
            {fmtCOP(totalNeto)} ÷ {vehiculosUnicos.toLocaleString('es-CO')} vehículos únicos
          </p>
        </Panel>
      </div>

      {/* Cards resumen por sede */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['Norte', 'Pasoancho', 'Sede 39'].map(s => {
          const lineasS = lineas.filter(l => l.sede === s && (tipo === 'Todos' || l.tipo_taller === tipo))
          const netoS   = lineasS.reduce((sum, l) => sum + Number(l.neto), 0)
          const costoS  = lineasS.reduce((sum, l) => sum + Number(l.costo), 0)
          const utilS   = netoS - costoS
          const pctU    = netoS ? (utilS / netoS) * 100 : 0
          const factsS  = lineasS.length
          const isActiva = sede === s
          return (
            <button key={s} onClick={() => setSede(sede === s ? 'Todas' : s)}
              className={`rounded-xl border p-5 text-left transition-all ${
                isActiva
                  ? 'border-brand-teal bg-brand-teal/10'
                  : 'border-brand-border bg-brand-surface hover:border-brand-teal/50'
              }`}>
              <div className="flex justify-between items-start mb-2">
                <p className="text-sm font-semibold text-brand-text">Taller {s}</p>
                {isActiva && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-brand-teal text-black font-mono">Activo</span>
                )}
              </div>
              <p className="text-xs font-mono text-brand-subtle mb-2">{factsS} facturas</p>
              <p className={`text-2xl font-bold font-title ${netoS >= 0 ? 'text-brand-teal' : 'text-red-400'}`}>
                {fmtCOP(netoS)}
              </p>
              <p className={`text-xs font-mono mt-1 ${utilS >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                Utilidad: {fmtCOP(utilS)} ({fmtPct(pctU)})
              </p>
            </button>
          )
        })}
      </div>

      {/* Desglose por tipo y por sede */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Por tipo: Clientes / Garantías / Interno */}
        <Panel>
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
            Por tipo de facturación — {MESES_LABEL[mes - 1]} {anio}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Tipo', 'Neto', 'Costo', 'Utilidad', '% Util', 'Presupuesto', '% Avance'].map(h => (
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porTipo.map(t => (
                <tr key={t.tipo}
                  className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors cursor-pointer
                    ${tipo === t.tipo ? 'bg-brand-teal/5 border-l-2 border-l-brand-teal' : ''}`}
                  onClick={() => setTipo(tipo === t.tipo ? 'Todos' : t.tipo)}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: COLORES_TIPO[t.tipo] }} />
                      <span className="text-brand-text text-xs font-medium">{t.tipo}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs" style={{ color: COLORES_TIPO[t.tipo] }}>{fmtCOP(t.neto)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(t.costo)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-green-400">{fmtCOP(t.util)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{t.neto ? fmtPct((t.util / t.neto) * 100) : '0%'}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(t.ppto)}</td>
                  <td className="py-3 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-brand-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, t.pct)}%`, background: COLORES_TIPO[t.tipo] }} />
                      </div>
                      <span className="text-brand-subtle">{fmtPct(t.pct)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brand-border font-bold">
                <td className="pt-3 pr-4 font-mono text-xs uppercase text-brand-text">Total</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-teal">{fmtCOP(totalNeto)}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(totalCosto)}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-green-400">{fmtCOP(totalUtil)}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtPct(pctUtil)}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(totalPpto)}</td>
                <td className="pt-3 font-mono text-xs text-brand-subtle">{fmtPct(pctAvance)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>

        {/* Por sede */}
        <Panel>
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
            Por sede — {MESES_LABEL[mes - 1]} {anio}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Sede', 'Neto', 'Costo', 'Utilidad', '% Util', 'Presupuesto', '% Avance'].map(h => (
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porSede.map(s => (
                <tr key={s.sede}
                  className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors cursor-pointer
                    ${sede === s.sede ? 'bg-brand-teal/5 border-l-2 border-l-brand-teal' : ''}`}
                  onClick={() => setSede(sede === s.sede ? 'Todas' : s.sede)}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: COLORES_SEDE[s.sede] }} />
                      <span className="text-brand-text text-xs font-medium">{s.sede}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs" style={{ color: COLORES_SEDE[s.sede] }}>{fmtCOP(s.neto)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(s.costo)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-green-400">{fmtCOP(s.util)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{s.neto ? fmtPct((s.util / s.neto) * 100) : '0%'}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(s.ppto)}</td>
                  <td className="py-3 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-brand-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.pct)}%`, background: COLORES_SEDE[s.sede] }} />
                      </div>
                      <span className="text-brand-subtle">{fmtPct(s.pct)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* Evolución mensual */}
        <Panel>
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
            Evolución mensual {anio}
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={evolucion} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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

        {/* Por asesor */}
        <Panel>
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
            Por asesor — {MESES_LABEL[mes - 1]} {anio}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Asesor', 'Fact.', 'Neto', 'Costo', 'Utilidad', '% Util'].map(h => (
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porAsesor.map(a => (
                <tr key={a.nombre} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                  <td className="py-2 pr-4 text-brand-text text-xs font-medium max-w-[180px] truncate">{a.nombre}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{a.facturas}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-brand-teal font-semibold">{fmtCOP(a.neto)}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(a.costo)}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-green-400">{fmtCOP(a.util)}</td>
                  <td className="py-2 font-mono text-xs text-brand-subtle">
                    {a.neto ? fmtPct((a.util / a.neto) * 100) : '0%'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brand-border">
                <td className="pt-2 font-mono text-xs uppercase text-brand-text font-bold">Total</td>
                <td className="pt-2 font-mono text-xs text-brand-subtle">{facturas.length}</td>
                <td className="pt-2 font-mono text-xs text-brand-teal font-bold">{fmtCOP(totalNeto)}</td>
                <td className="pt-2 font-mono text-xs text-brand-subtle">{fmtCOP(totalCosto)}</td>
                <td className="pt-2 font-mono text-xs text-green-400 font-bold">{fmtCOP(totalUtil)}</td>
                <td className="pt-2 font-mono text-xs text-brand-subtle">{fmtPct(pctUtil)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>
      </div>

      {/* Tabla detalle facturas */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle">
            Detalle de facturas — {MESES_LABEL[mes - 1]} {anio}
            {sede !== 'Todas' ? ` · ${sede}` : ''}
            {tipo !== 'Todos' ? ` · ${tipo}` : ''}
          </h2>
          <input type="text" placeholder="Buscar cliente, referencia, asesor..."
            value={buscar} onChange={e => setBuscar(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-xs text-brand-text font-mono focus:outline-none focus:border-brand-teal w-72" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Referencia', 'Taller', 'Cliente', 'Asesor', 'Tipo', 'Fecha', 'Items', 'Costo', 'Neto', 'Utilidad', '% Util'].map(h => (
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facturasBuscar.map(f => {
                const util = f.neto - f.costo
                const pctU = f.neto ? (util / f.neto) * 100 : 0
                const esDevolucion = f.neto < 0
                return (
                  <tr key={f.referencia}
                    className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors ${esDevolucion ? 'bg-red-500/5' : ''}`}>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.referencia}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.taller}</td>
                    <td className="py-3 pr-4 text-brand-text text-xs font-medium max-w-[150px] truncate">{f.cliente}</td>
                    <td className="py-3 pr-4 text-brand-subtle text-xs max-w-[130px] truncate">{f.asesor}</td>
                    <td className="py-3 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                        style={{ background: `${COLORES_TIPO[f.tipo]}20`, color: COLORES_TIPO[f.tipo] }}>
                        {f.tipo || '—'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.fecha}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle text-center">{f.items}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(f.costo)}</td>
                    <td className={`py-3 pr-4 font-mono text-xs font-semibold ${esDevolucion ? 'text-red-400' : 'text-brand-teal'}`}>
                      {fmtCOP(f.neto)}{esDevolucion && <span className="ml-1 text-red-400/70">(dev)</span>}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-green-400">{fmtCOP(util)}</td>
                    <td className="py-3 font-mono text-xs text-brand-subtle">{fmtPct(pctU)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brand-border font-bold">
                <td className="pt-3 font-mono text-xs uppercase text-brand-text" colSpan={6}>
                  Total — {facturasBuscar.length} facturas
                </td>
                <td className="pt-3 font-mono text-xs text-brand-subtle text-center">
                  {facturasBuscar.reduce((s, f) => s + f.items, 0)}
                </td>
                <td className="pt-3 font-mono text-xs text-brand-subtle">{fmtCOP(facturasBuscar.reduce((s, f) => s + f.costo, 0))}</td>
                <td className="pt-3 font-mono text-xs text-brand-teal">{fmtCOP(facturasBuscar.reduce((s, f) => s + f.neto, 0))}</td>
                <td className="pt-3 font-mono text-xs text-green-400">{fmtCOP(facturasBuscar.reduce((s, f) => s + (f.neto - f.costo), 0))}</td>
                <td className="pt-3 font-mono text-xs text-brand-subtle">{fmtPct(pctUtil)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Datos desde Supabase · Sincronización automática diaria desde Google Sheets
      </p>
    </div>
  )
}
