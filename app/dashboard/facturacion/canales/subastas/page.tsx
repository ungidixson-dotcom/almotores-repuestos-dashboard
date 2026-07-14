'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface LineaFactura {
  referencia:      number
  prefijo_num:     string
  nombre_cliente:  string
  nombre_vendedor: string
  cuenta:          number
  fecha:           string
  prefijo:         string
  articulo:        string
  descripcion:     string
  neto:            number
  costo:           number
  beneficio:       number
  canal:           string
  _fuente:         string
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
  pct_avance:  number
  pct_margen:  number
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
export default function SubastasPage() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes,  setMes]  = useState(hoy.getMonth() + 1)

  const [lineas,    setLineas]    = useState<LineaFactura[]>([])
  const [resumen,   setResumen]   = useState<ResumenVista[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [ultimaAct, setUltimaAct] = useState<Date | null>(null)
  const [buscar,         setBuscar]         = useState('')
  const [filtroAseg,     setFiltroAseg]     = useState('Todas')
  const [filtroAsesor,   setFiltroAsesor]   = useState('Todos')

  // ── Carga desde Supabase ──────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // 1) Líneas de detalle — mostrador + crédito canal Subastas
      const [{ data: dataMost, error: errMost }, { data: dataCred, error: errCred }] = await Promise.all([
        supabase
          .from('facturas_mostrador')
          .select('referencia, prefijo_num, nombre_cliente, nombre_vendedor, cuenta, fecha, prefijo, articulo, descripcion, neto, costo, beneficio, canal')
          .eq('canal', 'Subastas')
          .eq('anio', anio)
          .eq('mes', MESES_KEY[mes - 1])
          .limit(5000),
        supabase
          .from('facturas_credito')
          .select('referencia, numero_factura, nombre_cliente, nombre_vendedor, cuenta, fecha, prefijo, articulo, descripcion, neto, costo, beneficio, canal')
          .eq('anio', anio)
          .eq('mes', MESES_KEY[mes - 1])
          .limit(5000),
      ])

      // 2) Resumen de la vista general
      const { data: dataResumen } = await supabase
        .from('v_facturacion_general')
        .select('canal, sede, mes, anio, neto, costo, beneficio, presupuesto, pct_avance, pct_margen')
        .eq('canal', 'Subastas')
        .eq('anio', anio)

      const lineasMost = (dataMost ?? []).map((r: any) => ({ ...r, _fuente: 'mostrador' }))
      const lineasCred = (dataCred ?? []).map((r: any) => ({ 
        ...r, 
        prefijo_num: r.numero_factura ? String(r.numero_factura) : '',
        _fuente: 'credito' 
      }))
      setLineas([...lineasMost, ...lineasCred] as any)
      setResumen((dataResumen ?? []) as ResumenVista[])
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

  // ── Métricas del mes ──────────────────────────────────────────────────────
  const mesClave = MESES_KEY[mes - 1]
  const filasMes = resumen.filter(r => r.mes === mesClave)

  // Presupuesto siempre de la vista (no cambia por aseguradora)
  const totalPpto = filasMes.reduce((s, r) => s + Number(r.presupuesto), 0)

  // ── Tabla de facturas agrupadas por referencia ────────────────────────────
  const facturasMes = useMemo(() => {
    const mapa: Record<string, {
      referencia: number; prefijo_num: string; cliente: string
      asesor: string; cuenta: number; fecha: string; prefijo: string
      neto: number; costo: number; beneficio: number; items: number
    }> = {}

    lineas.forEach(l => {
      // Clave única: referencia + fuente para evitar colisión entre mostrador y crédito
      const key = `${l.referencia}_${l._fuente}`
      if (!mapa[key]) {
        mapa[key] = {
          referencia:  l.referencia,
          prefijo_num: l.prefijo_num,
          cliente:     l.nombre_cliente,
          asesor:      l.nombre_vendedor || 'Sin asesor',
          cuenta:      l.cuenta,
          fecha:       l.fecha,
          prefijo:     l.prefijo,
          neto: 0, costo: 0, beneficio: 0, items: 0,
        }
      }
      mapa[key].neto      += Number(l.neto)
      mapa[key].costo     += Number(l.costo)
      mapa[key].beneficio += Number(l.beneficio)
      mapa[key].items     += 1
    })

    return Object.values(mapa).sort((a, b) => b.neto - a.neto)
  }, [lineas])

  // ── Listas únicas para filtros ────────────────────────────────────────────
  const aseguradoras = useMemo(() => {
    const s = new Set(facturasMes.map(f => f.cliente))
    return ['Todas', ...Array.from(s).sort()]
  }, [facturasMes])

  const asesores = useMemo(() => {
    const s = new Set(facturasMes.map(f => f.asesor))
    return ['Todos', ...Array.from(s).sort()]
  }, [facturasMes])

  // ── Filtrado combinado ────────────────────────────────────────────────────
  const facturasFiltradas = useMemo(() => {
    return facturasMes.filter(f => {
      if (filtroAseg !== 'Todas' && f.cliente !== filtroAseg) return false
      if (filtroAsesor !== 'Todos' && f.asesor !== filtroAsesor) return false
      if (buscar.trim()) {
        const b = buscar.toLowerCase()
        return f.cliente.toLowerCase().includes(b) ||
          String(f.referencia).includes(b) ||
          String(f.cuenta).includes(b) ||
          f.prefijo.toLowerCase().includes(b)
      }
      return true
    })
  }, [facturasMes, filtroAseg, filtroAsesor, buscar])

  // ── Totales — calculados desde facturas filtradas ─────────────────────────
  const totalNeto  = facturasFiltradas.reduce((s, f) => s + f.neto,  0)
  const totalCosto = facturasFiltradas.reduce((s, f) => s + f.costo, 0)
  const totalUtil  = totalNeto - totalCosto
  const pctAvance  = totalPpto ? (totalNeto / totalPpto) * 100 : 0
  const pctUtil    = totalNeto ? (totalUtil / totalNeto) * 100 : 0
  const porDia     = dhTransc ? totalNeto / dhTransc : 0
  const restante   = totalPpto - totalNeto
  const necesario  = dhRest > 0 && restante > 0 ? restante / dhRest : 0
  const pronostico = totalNeto + porDia * dhRest
  const pctPronos  = totalPpto ? (pronostico / totalPpto) * 100 : 0
  const colorAvance = pctPronos >= 95 ? '#68D391' : pctPronos >= 85 ? '#F6AD55' : '#FC8181'

  // ── Por asesor — sobre facturas filtradas por aseguradora ─────────────────
  const porAsesor = useMemo(() => {
    const base = filtroAseg !== 'Todas'
      ? facturasMes.filter(f => f.cliente === filtroAseg)
      : facturasMes
    const mapa: Record<string, { neto: number; costo: number; facturas: number }> = {}
    base.forEach(f => {
      if (!mapa[f.asesor]) mapa[f.asesor] = { neto: 0, costo: 0, facturas: 0 }
      mapa[f.asesor].neto     += f.neto
      mapa[f.asesor].costo    += f.costo
      mapa[f.asesor].facturas += 1
    })
    return Object.entries(mapa)
      .map(([nombre, d]) => ({ nombre, ...d, util: d.neto - d.costo }))
      .sort((a, b) => b.neto - a.neto)
  }, [facturasMes, filtroAseg])

  // ── Por aseguradora — sobre facturas filtradas por asesor ─────────────────
  const porAseguradora = useMemo(() => {
    const base = filtroAsesor !== 'Todos'
      ? facturasMes.filter(f => f.asesor === filtroAsesor)
      : facturasMes
    const mapa: Record<string, { neto: number; costo: number; facturas: number }> = {}
    base.forEach(f => {
      if (!mapa[f.cliente]) mapa[f.cliente] = { neto: 0, costo: 0, facturas: 0 }
      mapa[f.cliente].neto     += f.neto
      mapa[f.cliente].costo    += f.costo
      mapa[f.cliente].facturas += 1
    })
    return Object.entries(mapa)
      .map(([nombre, d]) => ({ nombre, ...d, util: d.neto - d.costo }))
      .sort((a, b) => b.neto - a.neto)
  }, [facturasMes, filtroAsesor])

  // ── Evolución mensual ─────────────────────────────────────────────────────
  const evolucion = useMemo(() => {
    return MESES_KEY.map((m, i) => {
      const fila = resumen.find(r => r.mes === m)
      return {
        name: MESES_LABEL[i].slice(0, 3),
        Facturado:   Number(fila?.neto ?? 0),
        Presupuesto: Number(fila?.presupuesto ?? 0),
      }
    }).filter(r => r.Facturado > 0 || r.Presupuesto > 0)
  }, [resumen])

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

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-title text-brand-text">🔨 Subastas</h1>
          <p className="text-sm text-brand-subtle mt-0.5">
            Repuestos para vehículos siniestrados · {filtroAseg !== 'Todas' ? filtroAseg : 'todas las aseguradoras'} · {MESES_LABEL[mes - 1]} {anio}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filtroAseg} onChange={e => { setFiltroAseg(e.target.value); setFiltroAsesor('Todos') }}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            {aseguradoras.map(a => <option key={a} value={a}>{a === 'Todas' ? '🏢 Todas las aseguradoras' : a}</option>)}
          </select>
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
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-400 text-sm font-mono">
          {error}
        </div>
      )}

      {/* % Avance — panel principal */}
      <Panel className="border-brand-teal/30">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">
              Avance vs presupuesto — {MESES_LABEL[mes - 1]} {anio}
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

      {/* Gráficas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
              <Bar dataKey="Facturado"   fill="#FC8181" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        {/* Por aseguradora */}
        <Panel>
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
            Por aseguradora — {MESES_LABEL[mes - 1]} {anio}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Aseguradora', 'Fact.', 'Neto', 'Utilidad', '% Util'].map(h => (
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porAseguradora.map(a => (
                  <tr key={a.nombre}
                    className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors cursor-pointer
                      ${filtroAseg === a.nombre ? 'bg-brand-teal/5 border-l-2 border-l-brand-teal' : ''}`}
                    onClick={() => setFiltroAseg(filtroAseg === a.nombre ? 'Todas' : a.nombre)}>
                    <td className="py-2 pr-4 text-brand-text text-xs font-medium max-w-[160px] truncate">{a.nombre}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{a.facturas}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-brand-teal font-semibold">{fmtCOP(a.neto)}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-green-400">{fmtCOP(a.util)}</td>
                    <td className="py-2 font-mono text-xs text-brand-subtle">
                      {a.neto ? fmtPct((a.util / a.neto) * 100) : '0.0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-border">
                  <td className="pt-2 font-mono text-xs uppercase text-brand-text font-bold">Total</td>
                  <td className="pt-2 font-mono text-xs text-brand-subtle">{facturasMes.length}</td>
                  <td className="pt-2 font-mono text-xs text-brand-teal font-bold">{fmtCOP(totalNeto)}</td>
                  <td className="pt-2 font-mono text-xs text-green-400 font-bold">{fmtCOP(totalUtil)}</td>
                  <td className="pt-2 font-mono text-xs text-brand-subtle">{fmtPct(pctUtil)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

        {/* Por asesor */}
        <Panel>
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
            Por asesor — {MESES_LABEL[mes - 1]} {anio}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Asesor', 'Fact.', 'Neto', 'Utilidad', '% Util'].map(h => (
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porAsesor.map(a => (
                  <tr key={a.nombre}
                    className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors cursor-pointer
                      ${filtroAsesor === a.nombre ? 'bg-brand-teal/5 border-l-2 border-l-brand-teal' : ''}`}
                    onClick={() => setFiltroAsesor(filtroAsesor === a.nombre ? 'Todos' : a.nombre)}>
                    <td className="py-2 pr-4 text-brand-text text-xs font-medium max-w-[160px] truncate">{a.nombre}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{a.facturas}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-brand-teal font-semibold">{fmtCOP(a.neto)}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-green-400">{fmtCOP(a.util)}</td>
                    <td className="py-2 font-mono text-xs text-brand-subtle">
                      {a.neto ? fmtPct((a.util / a.neto) * 100) : '0.0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-border">
                  <td className="pt-2 font-mono text-xs uppercase text-brand-text font-bold">Total</td>
                  <td className="pt-2 font-mono text-xs text-brand-subtle">{facturasMes.length}</td>
                  <td className="pt-2 font-mono text-xs text-brand-teal font-bold">{fmtCOP(totalNeto)}</td>
                  <td className="pt-2 font-mono text-xs text-green-400 font-bold">{fmtCOP(totalUtil)}</td>
                  <td className="pt-2 font-mono text-xs text-brand-subtle">{fmtPct(pctUtil)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      </div>

      {/* Tabla detalle de facturas */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle">
            Detalle de facturas — {MESES_LABEL[mes - 1]} {anio}
          </h2>
            <div className="flex flex-wrap gap-2">
            <select value={filtroAsesor} onChange={e => setFiltroAsesor(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-xs text-brand-text font-mono focus:outline-none focus:border-brand-teal">
              {asesores.map(a => <option key={a} value={a}>{a === 'Todos' ? 'Todos los asesores' : a}</option>)}
            </select>
            <input type="text" placeholder="Buscar cliente, referencia..."
              value={buscar} onChange={e => setBuscar(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-xs text-brand-text font-mono focus:outline-none focus:border-brand-teal w-52" />
            {(filtroAsesor !== 'Todos' || buscar) && (
              <button onClick={() => { setFiltroAsesor('Todos'); setBuscar('') }}
                className="text-xs font-mono text-brand-subtle hover:text-brand-text px-2 py-1.5 border border-brand-border rounded-lg transition-colors">
                ✕ Limpiar
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Referencia', 'Factura', 'Cliente', 'Asesor', 'Fecha', 'Prefijo', 'Items', 'Costo', 'Neto', 'Utilidad', '% Util'].map(h => (
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facturasFiltradas.map(f => {
                const util = f.neto - f.costo
                const pctU = f.neto ? (util / f.neto) * 100 : 0
                const esDevolucion = f.neto < 0
                return (
                  <tr key={f.referencia}
                    className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors ${esDevolucion ? 'bg-red-500/5' : ''}`}>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.referencia}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.prefijo_num}</td>
                    <td className="py-3 pr-4 text-brand-text text-xs font-medium max-w-[160px] truncate">{f.cliente}</td>
                    <td className="py-3 pr-4 text-brand-subtle text-xs max-w-[130px] truncate">{f.asesor}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.fecha}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.prefijo}</td>
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
                <td className="pt-3 pr-4 font-mono text-xs uppercase text-brand-text" colSpan={6}>
                  Total — {facturasFiltradas.length} facturas
                </td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle text-center">
                  {facturasFiltradas.reduce((s, f) => s + f.items, 0)}
                </td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(facturasFiltradas.reduce((s, f) => s + f.costo, 0))}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-teal">{fmtCOP(facturasFiltradas.reduce((s, f) => s + f.neto, 0))}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-green-400">{fmtCOP(facturasFiltradas.reduce((s, f) => s + (f.neto - f.costo), 0))}</td>
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
