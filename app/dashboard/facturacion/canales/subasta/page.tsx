'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Subasta {
  id:                       number
  placa:                    string
  marca:                    string
  aseguradora_id:           number
  asesor_id:                number
  estado_subasta:           string
  fecha_subasta:            string
  valor_subastado:          number
  descuento_otorgado:       number
  tiempo_max_suministro_dias: number
  ciudad_destino:           string
  estado_autorizacion:      string
  fecha_autorizacion:       string
  estado_pedido:            string
  valor_autorizado:         number
  pct_autorizado:           number
  estado_facturacion_oc:    string
  fecha_factura:            string
  numero_factura:           string
  estado_radicacion_factura: string
  fecha_radicacion_factura: string
  mes_subasta:              string
  anio:                     number
}

interface Aseguradora { id: number; nombre_corto: string }
interface Asesor { id: number; nombre: string }

// ── Constantes ────────────────────────────────────────────────────────────────
const MESES_ORD = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const MESES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const YEARS = [2025, 2026]

const COLOR_AUTH   = '#68D391'
const COLOR_PARCIAL = '#F6AD55'
const COLOR_NO     = '#FC8181'
const COLOR_PEND   = '#63B3ED'
const COLOR_TEAL   = '#4FD1C5'

const COLORES_ASEG = ['#4FD1C5','#68D391','#F6AD55','#FC8181','#B794F4','#63B3ED','#F687B3','#FBD38D','#9AE6B4','#90CDF4','#FEB2B2','#E9D8FD']

const fmtCOP = (v: number) => {
  if (!v) return '$0'
  const abs = Math.abs(v), sign = v < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}$${(abs/1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(1)}M`
  return `${sign}$${abs.toLocaleString('es-CO',{maximumFractionDigits:0})}`
}
const fmtPct = (v: number) => `${(v*100).toFixed(1)}%`
const fmtPctN = (v: number) => `${v.toFixed(1)}%`

// ── Componentes base ──────────────────────────────────────────────────────────
function Panel({ children, className='' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-brand-border bg-brand-surface p-5 ${className}`}>{children}</div>
}

function KpiCard({ label, value, sub, sub2, accent='text-brand-teal', trend }: {
  label: string; value: string; sub?: string; sub2?: string; accent?: string; trend?: 'up'|'down'|'neutral'
}) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''
  const trendColor = trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : ''
  return (
    <Panel>
      <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">{label}</p>
      <p className={`text-xl font-bold font-title ${accent}`}>{value} {trendIcon && <span className={`text-sm ${trendColor}`}>{trendIcon}</span>}</p>
      {sub  && <p className="text-xs text-brand-subtle mt-1">{sub}</p>}
      {sub2 && <p className="text-xs text-brand-subtle mt-0.5">{sub2}</p>}
    </Panel>
  )
}

function BadgeEstado({ estado }: { estado: string }) {
  const cfg: Record<string,string> = {
    'Autorizada Completa': 'bg-green-500/10 text-green-400 border-green-500/30',
    'Autorizada parcial':  'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    'NO Autorizada':       'bg-red-500/10 text-red-400 border-red-500/30',
    'Facturado':           'bg-teal-500/10 text-teal-400 border-teal-500/30',
    'Radicada':            'bg-blue-500/10 text-blue-400 border-blue-500/30',
    'Pendiente':           'bg-gray-500/10 text-gray-400 border-gray-500/30',
  }
  const cls = cfg[estado] || 'bg-gray-500/10 text-gray-400 border-gray-500/30'
  return <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${cls}`}>{estado || '—'}</span>
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active||!payload?.length) return null
  return (
    <div className="bg-brand-surface border border-brand-border rounded-lg p-3 shadow-xl min-w-[160px]">
      <p className="text-xs font-mono text-brand-subtle mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs font-mono" style={{color: p.color}}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? fmtCOP(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function TorreControlSubastasPage() {
  const [anio, setAnio]               = useState(2026)
  const [filtroAseg, setFiltroAseg]   = useState(0)       // 0 = todas
  const [filtroAsesor, setFiltroAsesor] = useState(0)     // 0 = todos
  const [filtroMes, setFiltroMes]     = useState('todos')
  const [tabActiva, setTabActiva]     = useState<'resumen'|'aseguradoras'|'asesores'|'pipeline'|'detalle'>('resumen')
  const [buscar, setBuscar]           = useState('')

  const [subastas,     setSubastas]     = useState<Subasta[]>([])
  const [aseguradoras, setAseguradoras] = useState<Aseguradora[]>([])
  const [asesores,     setAsesores]     = useState<Asesor[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [ultimaAct,    setUltimaAct]    = useState<Date|null>(null)

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [{ data: dSub }, { data: dAseg }, { data: dAs }] = await Promise.all([
        supabase.from('subastas').select('*').eq('anio', anio).limit(10000),
        supabase.from('aseguradoras').select('id, nombre_corto'),
        supabase.from('asesores').select('id, nombre'),
      ])
      setSubastas((dSub ?? []) as Subasta[])
      setAseguradoras((dAseg ?? []) as Aseguradora[])
      setAsesores((dAs ?? []) as Asesor[])
      setUltimaAct(new Date())
    } catch(e: any) { setError(`Error: ${e?.message}`) }
    setLoading(false)
  }, [anio])

  useEffect(() => { cargar() }, [cargar])

  const nombreAseg  = (id: number) => aseguradoras.find(a => a.id === id)?.nombre_corto || `Aseg ${id}`
  const nombreAsesor = (id: number) => asesores.find(a => a.id === id)?.nombre || `Asesor ${id}`

  // ── Filtrado base ─────────────────────────────────────────────────────────
  const base = useMemo(() => {
    return subastas.filter(s => {
      if (filtroAseg   && s.aseguradora_id !== filtroAseg)   return false
      if (filtroAsesor && s.asesor_id !== filtroAsesor)       return false
      if (filtroMes !== 'todos' && s.mes_subasta !== filtroMes) return false
      return true
    })
  }, [subastas, filtroAseg, filtroAsesor, filtroMes])

  // ── KPIs globales ─────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total        = base.length
    const subastadas   = base.filter(s => s.estado_subasta === 'Subastada').length
    const authComp     = base.filter(s => s.estado_autorizacion === 'Autorizada Completa').length
    const authParcial  = base.filter(s => s.estado_autorizacion === 'Autorizada parcial').length
    const noAuth       = base.filter(s => s.estado_autorizacion === 'NO Autorizada').length
    const pendAuth     = base.filter(s => !s.estado_autorizacion).length
    const facturadas   = base.filter(s => s.estado_facturacion_oc === 'Facturado').length
    const radicadas    = base.filter(s => s.estado_radicacion_factura === 'Radicada').length
    const valSubastado = base.reduce((s, x) => s + (Number(x.valor_subastado)||0), 0)
    const valAutorizado = base.reduce((s, x) => s + (Number(x.valor_autorizado)||0), 0)
    const tasaAuth     = subastadas > 0 ? (authComp + authParcial) / subastadas : 0
    const tasaFact     = (authComp + authParcial) > 0 ? facturadas / (authComp + authParcial) : 0
    const convTotal    = subastadas > 0 ? facturadas / subastadas : 0
    const descProm     = base.filter(s=>s.descuento_otorgado>0).reduce((s,x)=>s+(x.descuento_otorgado||0),0) /
                         (base.filter(s=>s.descuento_otorgado>0).length || 1)
    return {
      total, subastadas, authComp, authParcial, noAuth, pendAuth,
      facturadas, radicadas, valSubastado, valAutorizado,
      tasaAuth, tasaFact, convTotal, descProm,
    }
  }, [base])

  // ── Evolución mensual ─────────────────────────────────────────────────────
  const evolucion = useMemo(() => {
    return MESES_ORD.map((m, i) => {
      const mes = subastas.filter(s => s.mes_subasta === m &&
        (!filtroAseg   || s.aseguradora_id === filtroAseg) &&
        (!filtroAsesor || s.asesor_id      === filtroAsesor))
      const authorizadas = mes.filter(s => ['Autorizada Completa','Autorizada parcial'].includes(s.estado_autorizacion))
      const fact = mes.filter(s => s.estado_facturacion_oc === 'Facturado')
      if (mes.length === 0) return null
      return {
        name:        MESES_LABEL[i],
        Subastadas:  mes.length,
        Autorizadas: authorizadas.length,
        Facturadas:  fact.length,
        ValSubastado: mes.reduce((s,x)=>s+(Number(x.valor_subastado)||0),0),
        ValAutorizado: authorizadas.reduce((s,x)=>s+(Number(x.valor_autorizado)||0),0),
        TasaAuth:    mes.length ? (authorizadas.length / mes.length) * 100 : 0,
      }
    }).filter(Boolean) as any[]
  }, [subastas, filtroAseg, filtroAsesor])

  // ── Por aseguradora ───────────────────────────────────────────────────────
  const porAseg = useMemo(() => {
    const mapa: Record<number, any> = {}
    base.forEach(s => {
      if (!mapa[s.aseguradora_id]) mapa[s.aseguradora_id] = {
        id: s.aseguradora_id, nombre: nombreAseg(s.aseguradora_id),
        total:0, auth:0, noAuth:0, pend:0, fact:0, rad:0,
        valSub:0, valAuth:0
      }
      const r = mapa[s.aseguradora_id]
      r.total++
      r.valSub  += Number(s.valor_subastado)||0
      r.valAuth += Number(s.valor_autorizado)||0
      if (['Autorizada Completa','Autorizada parcial'].includes(s.estado_autorizacion)) r.auth++
      else if (s.estado_autorizacion === 'NO Autorizada') r.noAuth++
      else r.pend++
      if (s.estado_facturacion_oc === 'Facturado') r.fact++
      if (s.estado_radicacion_factura === 'Radicada') r.rad++
    })
    return Object.values(mapa)
      .map(r => ({
        ...r,
        tasaAuth: r.total ? r.auth / r.total : 0,
        tasaFact: r.auth  ? r.fact / r.auth  : 0,
        convTotal: r.total ? r.fact / r.total : 0,
        pctValAuth: r.valSub ? r.valAuth / r.valSub : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [base, aseguradoras])

  // ── Por asesor ────────────────────────────────────────────────────────────
  const porAsesor = useMemo(() => {
    const mapa: Record<number, any> = {}
    base.forEach(s => {
      if (!mapa[s.asesor_id]) mapa[s.asesor_id] = {
        id: s.asesor_id, nombre: nombreAsesor(s.asesor_id),
        total:0, auth:0, noAuth:0, fact:0, rad:0,
        valSub:0, valAuth:0, descProm:0, _descCount:0
      }
      const r = mapa[s.asesor_id]
      r.total++
      r.valSub  += Number(s.valor_subastado)||0
      r.valAuth += Number(s.valor_autorizado)||0
      if (['Autorizada Completa','Autorizada parcial'].includes(s.estado_autorizacion)) r.auth++
      else if (s.estado_autorizacion === 'NO Autorizada') r.noAuth++
      if (s.estado_facturacion_oc === 'Facturado') r.fact++
      if (s.estado_radicacion_factura === 'Radicada') r.rad++
      if (s.descuento_otorgado > 0) { r.descProm += s.descuento_otorgado; r._descCount++ }
    })
    return Object.values(mapa)
      .map(r => ({
        ...r,
        tasaAuth:  r.total ? r.auth  / r.total : 0,
        tasaFact:  r.auth  ? r.fact  / r.auth  : 0,
        convTotal: r.total ? r.fact  / r.total : 0,
        descProm:  r._descCount ? r.descProm / r._descCount : 0,
        pctPart:   base.length ? r.total / base.length : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [base, asesores])

  // ── Pipeline (estado actual) ───────────────────────────────────────────────
  const pipeline = useMemo(() => {
    const subastadas = subastas.filter(s => s.estado_subasta === 'Subastada' && s.anio === anio)
    return {
      pendAuth:  subastadas.filter(s => !s.estado_autorizacion).length,
      enPedido:  subastadas.filter(s => s.estado_pedido === 'Reservado').length,
      porFacturar: subastadas.filter(s =>
        ['Autorizada Completa','Autorizada parcial'].includes(s.estado_autorizacion) &&
        s.estado_facturacion_oc !== 'Facturado'
      ).length,
      porRadicar: subastadas.filter(s =>
        s.estado_facturacion_oc === 'Facturado' &&
        s.estado_radicacion_factura !== 'Radicada'
      ).length,
      completadas: subastadas.filter(s => s.estado_radicacion_factura === 'Radicada').length,
    }
  }, [subastas, anio])

  // ── Proyección ────────────────────────────────────────────────────────────
  const proyeccion = useMemo(() => {
    const mesesConData = evolucion.filter(m => m.Subastadas > 0)
    const n = mesesConData.length
    if (n < 2) return null
    const promSubMes  = mesesConData.reduce((s,m)=>s+m.Subastadas,0)  / n
    const promAuthMes = mesesConData.reduce((s,m)=>s+m.Autorizadas,0) / n
    const promFactMes = mesesConData.reduce((s,m)=>s+m.Facturadas,0)  / n
    const mesesRest   = 12 - n
    const tasaAuthProm = promSubMes > 0 ? promAuthMes / promSubMes : 0
    const tasaFactProm = promAuthMes > 0 ? promFactMes / promAuthMes : 0
    return {
      subProyectadas:  Math.round(promSubMes * mesesRest),
      authProyectadas: Math.round(promAuthMes * mesesRest),
      factProyectadas: Math.round(promFactMes * mesesRest),
      tasaAuthProm:    tasaAuthProm * 100,
      tasaFactProm:    tasaFactProm * 100,
      mesesRest,
    }
  }, [evolucion])

  // ── Detalle con búsqueda ──────────────────────────────────────────────────
  const detalle = useMemo(() => {
    let lista = [...base].sort((a,b) => (b.fecha_subasta||'').localeCompare(a.fecha_subasta||''))
    if (buscar.trim()) {
      const b = buscar.toLowerCase()
      lista = lista.filter(s =>
        (s.placa||'').toLowerCase().includes(b) ||
        nombreAseg(s.aseguradora_id).toLowerCase().includes(b) ||
        nombreAsesor(s.asesor_id).toLowerCase().includes(b) ||
        (s.numero_factura||'').toLowerCase().includes(b) ||
        (s.ciudad_destino||'').toLowerCase().includes(b)
      )
    }
    return lista.slice(0, 500)
  }, [base, buscar, aseguradoras, asesores])

  // ── Pie data ──────────────────────────────────────────────────────────────
  const pieData = [
    { name: 'Auth. Completa', value: kpi.authComp,    color: COLOR_AUTH },
    { name: 'Auth. Parcial',  value: kpi.authParcial, color: COLOR_PARCIAL },
    { name: 'NO Autorizada',  value: kpi.noAuth,      color: COLOR_NO },
    { name: 'Pendiente',      value: kpi.pendAuth,    color: COLOR_PEND },
  ].filter(d => d.value > 0)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
        <p className="text-brand-subtle text-sm font-mono">Cargando torre de control...</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-brand-subtle uppercase tracking-wider">Torre de Control</span>
            <span className="text-xs text-brand-subtle">·</span>
            <span className="text-xs font-mono text-brand-teal">Subastas {anio}</span>
          </div>
          <h1 className="text-2xl font-bold font-title text-brand-text">📊 Seguimiento de Subastas</h1>
          <p className="text-sm text-brand-subtle mt-0.5">
            {kpi.total.toLocaleString()} registros · conversión {fmtPct(kpi.convTotal)} · {fmtCOP(kpi.valSubastado)} subastado
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filtros */}
          <select value={anio} onChange={e=>setAnio(Number(e.target.value))}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filtroMes} onChange={e=>setFiltroMes(e.target.value)}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            <option value="todos">Todos los meses</option>
            {MESES_ORD.map((m,i)=><option key={m} value={m}>{MESES_LABEL[i]}</option>)}
          </select>
          <select value={filtroAseg} onChange={e=>setFiltroAseg(Number(e.target.value))}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            <option value={0}>Todas las aseguradoras</option>
            {aseguradoras.map(a=><option key={a.id} value={a.id}>{a.nombre_corto}</option>)}
          </select>
          <select value={filtroAsesor} onChange={e=>setFiltroAsesor(Number(e.target.value))}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            <option value={0}>Todos los asesores</option>
            {asesores.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <button onClick={cargar}
            className="bg-brand-teal/20 hover:bg-brand-teal/30 border border-brand-teal/40 text-brand-teal rounded-lg px-4 py-2 text-sm font-mono transition-colors">
            ↻ Actualizar
          </button>
          {ultimaAct && <span className="text-xs text-brand-subtle font-mono">Act: {ultimaAct.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</span>}
        </div>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-400 text-sm font-mono">{error}</div>}

      {/* ── KPIs principales ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total subastas"   value={kpi.total.toLocaleString()}
          sub={`${kpi.subastadas.toLocaleString()} subastadas`} accent="text-brand-teal"/>
        <KpiCard label="Tasa autorización" value={fmtPct(kpi.tasaAuth)}
          sub={`${(kpi.authComp+kpi.authParcial).toLocaleString()} autorizadas`}
          sub2={`${kpi.noAuth.toLocaleString()} no autorizadas`}
          accent={kpi.tasaAuth > 0.2 ? 'text-green-400' : 'text-yellow-400'}/>
        <KpiCard label="Tasa facturación"  value={fmtPct(kpi.tasaFact)}
          sub={`${kpi.facturadas.toLocaleString()} facturadas`}
          sub2={`${kpi.radicadas.toLocaleString()} radicadas`}
          accent="text-brand-teal"/>
        <KpiCard label="Conversión total"  value={fmtPct(kpi.convTotal)}
          sub={`Subasta → Factura`}
          sub2={`Descuento prom: ${kpi.descProm.toFixed(1)}%`}
          accent={kpi.convTotal > 0.1 ? 'text-green-400' : 'text-yellow-400'}/>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Valor subastado"  value={fmtCOP(kpi.valSubastado)}
          sub={`${kpi.total} subastas`} accent="text-brand-teal"/>
        <KpiCard label="Valor autorizado" value={fmtCOP(kpi.valAutorizado)}
          sub={`${kpi.valSubastado > 0 ? ((kpi.valAutorizado/kpi.valSubastado)*100).toFixed(1) : 0}% del subastado`}
          accent="text-green-400"/>
        <KpiCard label="Por facturar"     value={pipeline.porFacturar.toLocaleString()}
          sub="Autorizadas sin factura" accent="text-yellow-400"/>
        <KpiCard label="Por radicar"      value={pipeline.porRadicar.toLocaleString()}
          sub="Facturadas sin radicar" accent="text-yellow-400"/>
      </div>

      {/* ── Pipeline visual ── */}
      <Panel>
        <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-5">Pipeline de conversión {anio}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: 'Subastadas',    value: kpi.subastadas,             color: '#4FD1C5' },
            { label: 'Autorizadas',   value: kpi.authComp+kpi.authParcial, color: '#68D391' },
            { label: 'En pedido',     value: pipeline.enPedido,          color: '#F6AD55' },
            { label: 'Facturadas',    value: kpi.facturadas,             color: '#63B3ED' },
            { label: 'Radicadas',     value: kpi.radicadas,              color: '#B794F4' },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="text-center">
                <div className="rounded-lg border p-3 min-w-[100px]" style={{ borderColor: `${step.color}40`, background: `${step.color}10` }}>
                  <p className="text-xl font-bold font-title" style={{ color: step.color }}>{step.value.toLocaleString()}</p>
                  <p className="text-xs font-mono text-brand-subtle mt-0.5">{step.label}</p>
                  {i > 0 && (
                    <p className="text-xs font-mono mt-1" style={{ color: step.color }}>
                      {arr[i-1].value > 0 ? `${((step.value/arr[i-1].value)*100).toFixed(0)}%` : '—'}
                    </p>
                  )}
                </div>
              </div>
              {i < arr.length - 1 && (
                <span className="text-brand-subtle font-mono text-lg">→</span>
              )}
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Tabs de análisis ── */}
      <div className="flex gap-1 border-b border-brand-border">
        {([
          { id: 'resumen',       label: '📈 Evolución' },
          { id: 'aseguradoras',  label: '🏢 Aseguradoras' },
          { id: 'asesores',      label: '👤 Asesores' },
          { id: 'pipeline',      label: '🔄 Pipeline' },
          { id: 'detalle',       label: '📋 Detalle' },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setTabActiva(tab.id)}
            className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 -mb-px ${
              tabActiva === tab.id
                ? 'border-brand-teal text-brand-teal'
                : 'border-transparent text-brand-subtle hover:text-brand-text'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Evolución ── */}
      {tabActiva === 'resumen' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Volumen mensual */}
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Volumen mensual {anio}</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={evolucion} margin={{top:5,right:10,left:10,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:'#718096',fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                  <Bar dataKey="Subastadas"  fill="#2D3748"   radius={[4,4,0,0]}/>
                  <Bar dataKey="Autorizadas" fill="#68D391"   radius={[4,4,0,0]}/>
                  <Bar dataKey="Facturadas"  fill="#4FD1C5"   radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            {/* Tasa de autorización mensual */}
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Tasa de autorización mensual (%)</h2>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={evolucion} margin={{top:5,right:10,left:10,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:'#718096',fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={40} tickFormatter={v=>`${v.toFixed(0)}%`}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                  <Line type="monotone" dataKey="TasaAuth" name="% Auth" stroke={COLOR_AUTH} strokeWidth={2} dot={{fill:COLOR_AUTH,r:4}}/>
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            {/* Distribución autorización */}
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Distribución por estado de autorización</h2>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                      dataKey="value" paddingAngle={2}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                    </Pie>
                    <Tooltip formatter={(v:any) => [`${v} subastas`, '']}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{background:d.color}}/>
                        <span className="text-xs font-mono text-brand-subtle">{d.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono text-brand-text">{d.value.toLocaleString()}</span>
                        <span className="text-xs font-mono text-brand-subtle ml-1">
                          ({kpi.total > 0 ? ((d.value/kpi.total)*100).toFixed(1) : 0}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            {/* Proyección */}
            {proyeccion && (
              <Panel className="border-brand-teal/30">
                <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
                  📡 Proyección fin de año {anio}
                </h2>
                <div className="space-y-4">
                  <p className="text-xs font-mono text-brand-subtle">
                    Basado en promedio de {evolucion.length} meses · {proyeccion.mesesRest} meses restantes
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Subastas proyectadas', value: proyeccion.subProyectadas, color: '#4FD1C5' },
                      { label: 'Autorizaciones proy.', value: proyeccion.authProyectadas, color: '#68D391' },
                      { label: 'Facturas proyectadas', value: proyeccion.factProyectadas, color: '#63B3ED' },
                    ].map(p => (
                      <div key={p.label} className="rounded-lg border border-brand-border p-3 text-center">
                        <p className="text-lg font-bold font-title" style={{color:p.color}}>{p.value.toLocaleString()}</p>
                        <p className="text-xs font-mono text-brand-subtle mt-1">{p.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="rounded-lg bg-brand-bg border border-brand-border p-3">
                      <p className="text-xs font-mono text-brand-subtle">Tasa auth. promedio</p>
                      <p className="text-lg font-bold text-green-400">{proyeccion.tasaAuthProm.toFixed(1)}%</p>
                    </div>
                    <div className="rounded-lg bg-brand-bg border border-brand-border p-3">
                      <p className="text-xs font-mono text-brand-subtle">Tasa facturación prom.</p>
                      <p className="text-lg font-bold text-blue-400">{proyeccion.tasaFactProm.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Aseguradoras ── */}
      {tabActiva === 'aseguradoras' && (
        <div className="space-y-6">
          {/* Cards top aseguradoras */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {porAseg.slice(0,4).map((a, i) => (
              <button key={a.id} onClick={() => setFiltroAseg(filtroAseg === a.id ? 0 : a.id)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  filtroAseg === a.id ? 'border-brand-teal bg-brand-teal/10' : 'border-brand-border bg-brand-surface hover:border-brand-teal/50'
                }`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{background: COLORES_ASEG[i]}}/>
                  <p className="text-xs font-semibold text-brand-text truncate">{a.nombre}</p>
                </div>
                <p className="text-xl font-bold font-title" style={{color: COLORES_ASEG[i]}}>{a.total}</p>
                <p className="text-xs font-mono text-brand-subtle mt-1">subastas</p>
                <div className="mt-2 space-y-0.5">
                  <p className="text-xs font-mono text-green-400">Auth: {fmtPct(a.tasaAuth)}</p>
                  <p className="text-xs font-mono text-blue-400">Conv: {fmtPct(a.convTotal)}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Tabla completa */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Análisis por aseguradora</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border">
                    {['Aseguradora','Total','Auth.','No Auth.','Pend.','% Auth','Fact.','% Conv','V. Subastado','V. Autorizado','% V. Auth'].map(h=>(
                      <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porAseg.map((a, i) => (
                    <tr key={a.id}
                      className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors cursor-pointer ${
                        filtroAseg === a.id ? 'bg-brand-teal/5 border-l-2 border-l-brand-teal' : ''
                      }`}
                      onClick={() => setFiltroAseg(filtroAseg === a.id ? 0 : a.id)}>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{background: COLORES_ASEG[i%12]}}/>
                          <span className="text-brand-text text-xs font-medium">{a.nombre}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-text font-semibold">{a.total}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-green-400">{a.auth}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-red-400">{a.noAuth}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{a.pend}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-brand-border rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${Math.min(100,a.tasaAuth*100)}%`,background:COLOR_AUTH}}/>
                          </div>
                          <span className="font-mono text-xs text-green-400">{fmtPct(a.tasaAuth)}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-teal">{a.fact}</td>
                      <td className="py-3 pr-4 font-mono text-xs" style={{color: a.convTotal > 0.1 ? '#68D391' : '#FC8181'}}>
                        {fmtPct(a.convTotal)}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(a.valSub)}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(a.valAuth)}</td>
                      <td className="py-3 font-mono text-xs text-brand-subtle">{fmtPct(a.pctValAuth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Gráfica participación */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Participación por aseguradora</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={porAseg} layout="vertical" margin={{top:5,right:30,left:80,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" horizontal={false}/>
                <XAxis type="number" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="nombre" tick={{fill:'#718096',fontSize:11}} axisLine={false} tickLine={false} width={75}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                <Bar dataKey="total"  name="Total"       fill="#2D3748" radius={[0,4,4,0]}/>
                <Bar dataKey="auth"   name="Autorizadas" fill="#68D391" radius={[0,4,4,0]}/>
                <Bar dataKey="fact"   name="Facturadas"  fill="#4FD1C5" radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* ── TAB: Asesores ── */}
      {tabActiva === 'asesores' && (
        <div className="space-y-6">
          {/* Cards asesores */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {porAsesor.map((a, i) => (
              <button key={a.id} onClick={() => setFiltroAsesor(filtroAsesor === a.id ? 0 : a.id)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  filtroAsesor === a.id ? 'border-brand-teal bg-brand-teal/10' : 'border-brand-border bg-brand-surface hover:border-brand-teal/50'
                }`}>
                <p className="text-xs font-semibold text-brand-text mb-2 truncate">{a.nombre}</p>
                <p className="text-xl font-bold font-title text-brand-teal">{a.total}</p>
                <p className="text-xs font-mono text-brand-subtle">subastas · {fmtPct(a.pctPart)} part.</p>
                <div className="mt-2 space-y-0.5">
                  <p className="text-xs font-mono text-green-400">Auth: {fmtPct(a.tasaAuth)}</p>
                  <p className="text-xs font-mono text-blue-400">Conv: {fmtPct(a.convTotal)}</p>
                  <p className="text-xs font-mono text-yellow-400">Desc: {a.descProm.toFixed(1)}%</p>
                </div>
              </button>
            ))}
          </div>

          {/* Tabla comparativa */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Comparativo por asesor</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border">
                    {['Asesor','Total','% Part.','Auth.','No Auth.','% Auth','Fact.','Rad.','% Conv','V. Subastado','V. Autorizado','Desc. Prom'].map(h=>(
                      <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porAsesor.map(a => (
                    <tr key={a.id}
                      className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors cursor-pointer ${
                        filtroAsesor === a.id ? 'bg-brand-teal/5 border-l-2 border-l-brand-teal' : ''
                      }`}
                      onClick={() => setFiltroAsesor(filtroAsesor === a.id ? 0 : a.id)}>
                      <td className="py-3 pr-4 text-brand-text text-xs font-medium">{a.nombre}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-text font-semibold">{a.total}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtPctN(a.pctPart*100)}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-green-400">{a.auth}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-red-400">{a.noAuth}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-brand-border rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${Math.min(100,a.tasaAuth*100)}%`,background:COLOR_AUTH}}/>
                          </div>
                          <span className="font-mono text-xs text-green-400">{fmtPct(a.tasaAuth)}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-teal">{a.fact}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-purple-400">{a.rad}</td>
                      <td className="py-3 pr-4 font-mono text-xs" style={{color: a.convTotal > 0.1 ? '#68D391' : '#FC8181'}}>
                        {fmtPct(a.convTotal)}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(a.valSub)}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(a.valAuth)}</td>
                      <td className="py-3 font-mono text-xs text-yellow-400">{a.descProm.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Gráfica comparativa */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Comparativa de asesores</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porAsesor} margin={{top:5,right:10,left:10,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                <XAxis dataKey="nombre" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false}
                  tickFormatter={v => v.split(' ')[0]}/>
                <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                <Bar dataKey="total"  name="Total"       fill="#2D3748" radius={[4,4,0,0]}/>
                <Bar dataKey="auth"   name="Autorizadas" fill="#68D391" radius={[4,4,0,0]}/>
                <Bar dataKey="fact"   name="Facturadas"  fill="#4FD1C5" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* ── TAB: Pipeline ── */}
      {tabActiva === 'pipeline' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Pendientes de autorización', value: pipeline.pendAuth,    color: COLOR_PEND,   desc: 'Subastas sin respuesta de la aseguradora' },
              { label: 'En pedido / Reservado',      value: pipeline.enPedido,    color: COLOR_PARCIAL,desc: 'Pedidos creados pendientes de facturar' },
              { label: 'Por facturar',               value: pipeline.porFacturar, color: COLOR_PARCIAL,desc: 'Autorizadas sin factura generada' },
              { label: 'Por radicar',                value: pipeline.porRadicar,  color: '#B794F4',    desc: 'Facturadas sin radicar a la aseguradora' },
              { label: 'Completadas',                value: pipeline.completadas, color: COLOR_AUTH,   desc: 'Proceso completo: subastada → radicada' },
            ].map(s => (
              <Panel key={s.label}>
                <p className="text-xs font-mono text-brand-subtle mb-2">{s.label}</p>
                <p className="text-3xl font-bold font-title" style={{color: s.color}}>{s.value.toLocaleString()}</p>
                <p className="text-xs font-mono text-brand-subtle mt-2">{s.desc}</p>
                <div className="mt-3 h-1.5 bg-brand-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${kpi.subastadas > 0 ? (s.value/kpi.subastadas)*100 : 0}%`,
                    background: s.color
                  }}/>
                </div>
                <p className="text-xs font-mono text-brand-subtle mt-1">
                  {kpi.subastadas > 0 ? ((s.value/kpi.subastadas)*100).toFixed(1) : 0}% del total subastado
                </p>
              </Panel>
            ))}
          </div>

          {/* Estados de radicación */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Estado de radicación de facturas</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['Radicada','Pendiente',''].map(est => {
                const count = base.filter(s => s.estado_facturacion_oc === 'Facturado' &&
                  (est === '' ? !s.estado_radicacion_factura : s.estado_radicacion_factura === est)).length
                const label = est === '' ? 'Sin estado' : est
                return (
                  <div key={label} className="rounded-lg border border-brand-border p-4 text-center">
                    <p className="text-2xl font-bold font-title text-brand-teal">{count}</p>
                    <p className="text-xs font-mono text-brand-subtle mt-1">{label}</p>
                  </div>
                )
              })}
              <div className="rounded-lg border border-brand-border p-4 text-center">
                <p className="text-2xl font-bold font-title text-brand-teal">{kpi.facturadas}</p>
                <p className="text-xs font-mono text-brand-subtle mt-1">Total facturadas</p>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* ── TAB: Detalle ── */}
      {tabActiva === 'detalle' && (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle">
              Detalle de subastas — {base.length.toLocaleString()} registros
            </h2>
            <input type="text" placeholder="Buscar placa, aseguradora, ciudad, factura..."
              value={buscar} onChange={e=>setBuscar(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-xs text-brand-text font-mono focus:outline-none focus:border-brand-teal w-80"/>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Placa','Marca','Aseguradora','Asesor','Fecha','V. Subastado','Estado Auth.','V. Autorizado','Estado Fact.','Factura','Estado Rad.'].map(h=>(
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detalle.map(s => (
                  <tr key={s.id} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                    <td className="py-2 pr-4 font-mono text-xs text-brand-teal font-semibold">{s.placa}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{s.marca}</td>
                    <td className="py-2 pr-4 text-xs text-brand-text max-w-[120px] truncate">{nombreAseg(s.aseguradora_id)}</td>
                    <td className="py-2 pr-4 text-xs text-brand-subtle max-w-[100px] truncate">{nombreAsesor(s.asesor_id)?.split(' ')[0]}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{s.fecha_subasta}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(Number(s.valor_subastado))}</td>
                    <td className="py-2 pr-4"><BadgeEstado estado={s.estado_autorizacion}/></td>
                    <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{s.valor_autorizado ? fmtCOP(Number(s.valor_autorizado)) : '—'}</td>
                    <td className="py-2 pr-4"><BadgeEstado estado={s.estado_facturacion_oc}/></td>
                    <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{s.numero_factura || '—'}</td>
                    <td className="py-2"><BadgeEstado estado={s.estado_radicacion_factura}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {base.length > 500 && (
              <p className="text-xs font-mono text-brand-subtle text-center mt-3">
                Mostrando 500 de {base.length.toLocaleString()} registros · usa los filtros para acotar
              </p>
            )}
          </div>
        </Panel>
      )}

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Datos desde Supabase · Registro Subastas Aseguradoras {anio}
      </p>
    </div>
  )
}
