'use client'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend, RadarChart,
  PolarGrid, PolarAngleAxis, Radar,
} from 'recharts'
import { RefreshCw, User, TrendingUp, CheckCircle, FileCheck, FileClock, Percent } from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────────────────────
interface RowAsesor {
  anio: number
  mes_subasta: string
  asesor_id: number
  asesor: string | null
  marca: string | null
  total: number
  subastadas: number
  autorizadas: number
  no_autorizadas: number
  facturadas: number
  radicadas: number
  valor_subastado: number
  valor_autorizado: number
  descuento_prom: number
}

interface MesDisponible { anio: number; mes: string; orden: number }

// ── Utilidades ───────────────────────────────────────────────────────────────
const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
const fmtM = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${(n / 1e3).toFixed(0)}K`
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`

const COLORES_ASESORES = ['#4FD1C5', '#E8A33D', '#60A5FA', '#A78BFA']

// ── Fetch ────────────────────────────────────────────────────────────────────
async function fetchDatos() {
  const [{ data: rows }, { data: meses }] = await Promise.all([
    supabase.from('v_subastas_por_asesor').select(
      'anio,mes_subasta,asesor_id,asesor,marca,total,subastadas,autorizadas,no_autorizadas,facturadas,radicadas,valor_subastado,valor_autorizado,descuento_prom'
    ),
    supabase.from('v_meses_disponibles').select('anio,mes,orden').order('anio').order('orden'),
  ])
  return {
    rows:  (rows  as RowAsesor[])    || [],
    meses: (meses as MesDisponible[]) || [],
  }
}

// ── Componente ───────────────────────────────────────────────────────────────
export default function AsesoresPage() {
  const router = useRouter()

  const [rows,  setRows]  = useState<RowAsesor[]>([])
  const [meses, setMeses] = useState<MesDisponible[]>([])

  const [loading,   setLoading]   = useState(true)
  const [ultimaAct, setUltimaAct] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(1800)

  const [filtroAnio,  setFiltroAnio]  = useState(2026)
  const [filtroMes,   setFiltroMes]   = useState('todos')
  const [filtroMarca, setFiltroMarca] = useState('todas')

  const cargarDatos = useCallback(async (verificarAuth = false) => {
    if (verificarAuth) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
    }
    const datos = await fetchDatos()
    setRows(datos.rows)
    setMeses(datos.meses)
    setUltimaAct(new Date())
    setLoading(false)
  }, [router])

  useEffect(() => { cargarDatos(true) }, [cargarDatos])

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { cargarDatos(false); return 1800 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [cargarDatos])

  // ── Opciones de filtro ───────────────────────────────────────────────────
  const aniosDisponibles = useMemo(() =>
    Array.from(new Set(meses.map(m => m.anio))).sort((a, b) => b - a),
  [meses])

  const mesesDelAnio = useMemo(() =>
    meses.filter(m => m.anio === filtroAnio).sort((a, b) => a.orden - b.orden).map(m => m.mes),
  [meses, filtroAnio])

  const marcas = useMemo(() => {
    const ms = rows.filter(r => r.anio === filtroAnio).map(r => r.marca).filter((m): m is string => !!m && m.trim() !== '')
    return Array.from(new Set(ms)).sort()
  }, [rows, filtroAnio])

  useEffect(() => { setFiltroMes('todos'); setFiltroMarca('todas') }, [filtroAnio])

  // ── Rows filtrados ───────────────────────────────────────────────────────
  const sf = useMemo(() => rows.filter(r =>
    r.anio === filtroAnio &&
    (filtroMes   === 'todos' || r.mes_subasta === filtroMes)   &&
    (filtroMarca === 'todas' || r.marca       === filtroMarca) &&
    r.asesor !== null
  ), [rows, filtroAnio, filtroMes, filtroMarca])

  // ── Agregado por asesor ──────────────────────────────────────────────────
  const porAsesor = useMemo(() => {
    const map: Record<string, {
      id: number; nombre: string; total: number; autorizadas: number
      no_autorizadas: number; pendientes: number; facturadas: number; radicadas: number
      valor_autorizado: number; valor_subastado: number
      desc_sum: number; desc_count: number
    }> = {}
    sf.forEach(r => {
      const k = r.asesor || 'Sin nombre'
      if (!map[k]) map[k] = { id: r.asesor_id, nombre: k, total: 0, autorizadas: 0, no_autorizadas: 0, pendientes: 0, facturadas: 0, radicadas: 0, valor_autorizado: 0, valor_subastado: 0, desc_sum: 0, desc_count: 0 }
      map[k].total            += r.total || 0
      map[k].autorizadas      += r.autorizadas || 0
      map[k].no_autorizadas   += r.no_autorizadas || 0
      map[k].facturadas       += r.facturadas || 0
      map[k].radicadas        += r.radicadas || 0
      map[k].valor_autorizado += r.valor_autorizado || 0
      map[k].valor_subastado  += r.valor_subastado || 0
      // pendientes = total - autorizadas - no_autorizadas - no_aplicadas (subastadas sin respuesta)
      const resueltas_fila = (r.autorizadas || 0) + (r.no_autorizadas || 0)
      const subastadas_fila = r.subastadas || 0
      map[k].pendientes += Math.max(0, subastadas_fila - resueltas_fila)
      if (r.descuento_prom > 0) { map[k].desc_sum += r.descuento_prom; map[k].desc_count++ }
    })
    return Object.values(map).map(a => {
      const resueltas = a.autorizadas + a.no_autorizadas
      return {
        ...a,
        tasa_auth:    resueltas    > 0 ? (a.autorizadas / resueltas)    * 100 : 0,
        efectividad:  a.total      > 0 ? (a.autorizadas / a.total)      * 100 : 0,
        tasa_fact:    a.autorizadas > 0 ? (a.facturadas  / a.autorizadas) * 100 : 0,
        tasa_radicar: a.facturadas  > 0 ? (a.radicadas   / a.facturadas)  * 100 : 0,
        desc_prom:    a.desc_count   > 0 ? a.desc_sum / a.desc_count : 0,
      }
    }).sort((a, b) => b.valor_autorizado - a.valor_autorizado)
  }, [sf])

  // ── KPIs globales ────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total       = porAsesor.reduce((a, r) => a + r.total, 0)
    const autorizadas = porAsesor.reduce((a, r) => a + r.autorizadas, 0)
    const no_aut      = porAsesor.reduce((a, r) => a + r.no_autorizadas, 0)
    const facturadas  = porAsesor.reduce((a, r) => a + r.facturadas, 0)
    const radicadas   = porAsesor.reduce((a, r) => a + r.radicadas, 0)
    const valor_aut   = porAsesor.reduce((a, r) => a + r.valor_autorizado, 0)
    const resueltas   = autorizadas + no_aut
    const desc_proms  = porAsesor.filter(a => a.desc_prom > 0).map(a => a.desc_prom)
    return {
      total, autorizadas, no_aut, facturadas, radicadas, valor_aut,
      tasa_auth:   resueltas   > 0 ? (autorizadas / resueltas)   * 100 : 0,
      tasa_fact:   autorizadas > 0 ? (facturadas  / autorizadas) * 100 : 0,
      desc_prom:   desc_proms.length > 0 ? desc_proms.reduce((a, b) => a + b, 0) / desc_proms.length : 0,
    }
  }, [porAsesor])

  // ── Evolución mensual por asesor ─────────────────────────────────────────
  const evolucionMensual = useMemo(() => {
    const asesoresNombres = porAsesor.map(a => a.nombre)
    return mesesDelAnio.map(mes => {
      const entry: Record<string, string | number> = {
        mes: mes.charAt(0).toUpperCase() + mes.slice(1),
      }
      asesoresNombres.forEach(nombre => {
        const total = rows
          .filter(r => r.anio === filtroAnio && r.mes_subasta === mes && r.asesor === nombre &&
            (filtroMarca === 'todas' || r.marca === filtroMarca))
          .reduce((a, r) => a + (r.valor_autorizado || 0), 0)
        entry[nombre] = total || 0
      })
      return entry
    })
  }, [rows, filtroAnio, filtroMarca, mesesDelAnio, porAsesor])

  // ── Radar de eficiencia ─────────────────────────────────────────────────
  const radarData = useMemo(() => [
    { metric: 'Tasa aut.',    ...Object.fromEntries(porAsesor.map(a => [a.nombre, a.tasa_auth])) },
    { metric: 'Efectividad',  ...Object.fromEntries(porAsesor.map(a => [a.nombre, a.efectividad])) },
    { metric: 'Tasa fact.',   ...Object.fromEntries(porAsesor.map(a => [a.nombre, a.tasa_fact])) },
    { metric: 'Tasa radicar', ...Object.fromEntries(porAsesor.map(a => [a.nombre, a.tasa_radicar])) },
  ], [porAsesor])

  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center flex-col gap-3">
      <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin"/>
      <p className="text-brand-subtle font-mono text-xs">Cargando asesores...</p>
    </div>
  )

  const hayFiltros = filtroMes !== 'todos' || filtroMarca !== 'todas'

  return (
    <div className="min-h-screen bg-brand-bg">

      {/* TOP BAR */}
      <div className="border-b border-brand-border bg-brand-surface/50 px-6 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-brand-teal animate-pulse"/>
          <span className="font-mono text-xs text-brand-subtle uppercase tracking-widest">
            Almotores KIA · Asesores
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => { cargarDatos(false); setCountdown(1800) }}
            className="flex items-center gap-1.5 text-xs font-mono text-brand-subtle hover:text-brand-teal transition-colors border border-brand-border rounded-lg px-2.5 py-1"
          >
            <RefreshCw size={12}/> Actualizar
          </button>
          <div className="flex items-center gap-1.5 text-xs font-mono text-brand-muted">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-teal animate-pulse"/>
            {`Auto en ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}`}
          </div>
          {ultimaAct && (
            <span className="text-brand-muted font-mono text-xs hidden md:block">
              {ultimaAct.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <div className="p-6">

        {/* TÍTULO */}
        <div className="mb-6">
          <h1 className="font-title text-2xl font-bold text-brand-text">Asesores</h1>
          <p className="text-brand-subtle text-sm mt-1">
            Rendimiento individual · {filtroAnio}{filtroMes !== 'todos' ? ` · ${filtroMes}` : ''}
          </p>
        </div>

        {/* FILTROS */}
        <div className="flex flex-wrap gap-2 mb-6 p-4 bg-brand-surface border border-brand-border rounded-xl">
          <span className="font-mono text-xs text-brand-muted self-center mr-2 uppercase tracking-wider">Filtrar por</span>

          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Año</span>
            <select value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}
              className="bg-brand-bg border border-brand-teal/50 rounded-lg px-3 py-1.5 text-brand-teal text-sm font-mono font-semibold outline-none focus:border-brand-teal">
              {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Mes</span>
            <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
              <option value="todos">Todos</option>
              {mesesDelAnio.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Marca</span>
            <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
              <option value="todas">Todas</option>
              {marcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          {hayFiltros && (
            <button onClick={() => { setFiltroMes('todos'); setFiltroMarca('todas') }}
              className="ml-auto text-xs font-mono text-brand-muted hover:text-brand-red transition-colors border border-brand-border rounded-lg px-3 py-1.5">
              × Limpiar filtros
            </button>
          )}
        </div>

        {/* TARJETAS POR ASESOR */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {porAsesor.map((a, i) => (
            <div key={a.nombre} className="bg-brand-surface border border-brand-border rounded-xl p-5 relative overflow-hidden">
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: COLORES_ASESORES[i % 4] }}/>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${COLORES_ASESORES[i % 4]}20`, border: `1px solid ${COLORES_ASESORES[i % 4]}40` }}>
                  <User size={14} style={{ color: COLORES_ASESORES[i % 4] }}/>
                </div>
                <div>
                  <p className="font-title font-semibold text-brand-text text-sm leading-tight">{a.nombre.split(' ')[0]}</p>
                  <p className="font-mono text-[10px] text-brand-muted">{a.nombre.split(' ').slice(1).join(' ')}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="font-mono text-[10px] text-brand-muted mb-0.5">Subastas</p>
                  <p className="font-title font-bold text-xl text-brand-text">{a.total.toLocaleString('es-CO')}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-brand-muted mb-0.5">Autorizadas</p>
                  <p className="font-title font-bold text-xl" style={{ color: COLORES_ASESORES[i % 4] }}>{a.autorizadas.toLocaleString('es-CO')}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-brand-muted mb-0.5">Tasa aut. <span className="text-brand-muted">(resueltas)</span></p>
                  <p className="font-mono font-semibold text-brand-teal">{fmtPct(a.tasa_auth)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-brand-muted mb-0.5">Pendientes resp.</p>
                  <p className="font-mono font-semibold text-brand-subtle">{a.pendientes.toLocaleString('es-CO')}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-brand-muted mb-0.5">Desc. prom.</p>
                  <p className="font-mono text-brand-subtle">{fmtPct(a.desc_prom)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-brand-muted mb-0.5">Valor aut.</p>
                  <p className="font-mono text-xs text-brand-subtle">{fmtM(a.valor_autorizado)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* KPIs GLOBALES */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <KpiCard icon={<TrendingUp size={15}/>}  label="Total subastas"    value={kpis.total.toLocaleString('es-CO')}      accent="subtle"/>
          <KpiCard icon={<CheckCircle size={15}/>} label="Autorizadas"       value={kpis.autorizadas.toLocaleString('es-CO')} accent="teal"/>
          <KpiCard icon={<TrendingUp size={15}/>}  label="Tasa autorización" value={fmtPct(kpis.tasa_auth)}                  accent="teal"  hint="aut / (aut + no aut)"/>
          <KpiCard icon={<FileCheck size={15}/>}   label="Facturadas"        value={kpis.facturadas.toLocaleString('es-CO')}  accent="gold"/>
          <KpiCard icon={<FileClock size={15}/>}   label="Radicadas"         value={kpis.radicadas.toLocaleString('es-CO')}   accent="blue"/>
          <KpiCard icon={<Percent size={15}/>}     label="Descuento prom."   value={fmtPct(kpis.desc_prom)}                  accent="subtle" hint="promedio de asesores"/>
        </div>

        {/* GRÁFICAS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

          {/* Barras: valor autorizado por asesor */}
          <Panel title="Valor autorizado por asesor" sub="Subastas ganadas en el periodo">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={porAsesor} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                <XAxis dataKey="nombre" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={{ stroke: '#2A3340' }} tickLine={false}
                  tickFormatter={(v: string) => v.split(' ')[0]}/>
                <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtM(v)}/>
                <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [fmtCOP(v), 'Valor autorizado']}/>
                <Bar dataKey="valor_autorizado" radius={[6, 6, 0, 0]}>
                  {porAsesor.map((_, i) => <Cell key={i} fill={COLORES_ASESORES[i % 4]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          {/* Radar: eficiencia comparativa */}
          <Panel title="Eficiencia comparativa" sub="Tasa autorización · Efectividad · Tasa facturación · Tasa radicación">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                <PolarGrid stroke="#2A3340"/>
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#8AA4C8', fontSize: 11 }}/>
                {porAsesor.map((a, i) => (
                  <Radar key={a.nombre} name={a.nombre.split(' ')[0]} dataKey={a.nombre}
                    stroke={COLORES_ASESORES[i % 4]} fill={COLORES_ASESORES[i % 4]} fillOpacity={0.1}/>
                ))}
                <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8' }}/>
                <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, '']}/>
              </RadarChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* EVOLUCIÓN MENSUAL */}
        <div className="mb-4">
          <Panel title="Evolución mensual por asesor" sub={`Valor autorizado acumulado — ${filtroAnio}`}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={evolucionMensual} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                <XAxis dataKey="mes" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={{ stroke: '#2A3340' }} tickLine={false}
                  interval={0} angle={-30} textAnchor="end" height={40}/>
                <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v ? fmtM(v) : ''}/>
                <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [fmtCOP(v), '']}/>
                <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8' }}/>
                {porAsesor.map((a, i) => (
                  <Line key={a.nombre} type="monotone" dataKey={a.nombre} stroke={COLORES_ASESORES[i % 4]}
                    strokeWidth={2.5} dot={false} connectNulls name={a.nombre.split(' ')[0]}/>
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* TABLA DETALLE */}
        <Panel title="Detalle por asesor" sub="Todas las métricas del periodo filtrado">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Asesor','Total','Autorizadas','No aut.','Pend. resp.','Tasa aut. (resueltas)','Efectividad','Facturadas','Radicadas','Desc. prom.','Valor autorizado'].map(h => (
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porAsesor.map((a, i) => (
                  <tr key={a.nombre} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORES_ASESORES[i % 4] }}/>
                        <span className="text-brand-text font-medium">{a.nombre}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-mono text-brand-subtle">{a.total.toLocaleString('es-CO')}</td>
                    <td className="py-3 pr-4 font-mono text-brand-teal font-semibold">{a.autorizadas.toLocaleString('es-CO')}</td>
                    <td className="py-3 pr-4 font-mono text-brand-red">{a.no_autorizadas.toLocaleString('es-CO')}</td>
                    <td className="py-3 pr-4 font-mono text-brand-subtle">{a.pendientes.toLocaleString('es-CO')}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-brand-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-brand-teal" style={{ width: `${Math.min(a.tasa_auth, 100)}%` }}/>
                        </div>
                        <span className="font-mono text-xs text-brand-subtle">{fmtPct(a.tasa_auth)}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-brand-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(a.efectividad, 100)}%`, background: COLORES_ASESORES[i % 4] }}/>
                        </div>
                        <span className="font-mono text-xs text-brand-subtle">{fmtPct(a.efectividad)}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-mono text-brand-gold">{a.facturadas.toLocaleString('es-CO')}</td>
                    <td className="py-3 pr-4 font-mono text-blue-400">{a.radicadas.toLocaleString('es-CO')}</td>
                    <td className="py-3 pr-4 font-mono text-brand-subtle">{fmtPct(a.desc_prom)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(a.valor_autorizado)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-border">
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle font-semibold">TOTAL</td>
                  <td className="py-3 pr-4 font-mono text-brand-subtle font-semibold">{kpis.total.toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-brand-teal font-semibold">{kpis.autorizadas.toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-brand-red font-semibold">{kpis.no_aut.toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-brand-subtle font-semibold">—</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle font-semibold">{fmtPct(kpis.tasa_auth)}</td>
                  <td className="py-3 pr-4"/>
                  <td className="py-3 pr-4 font-mono text-brand-gold font-semibold">{kpis.facturadas.toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-blue-400 font-semibold">{kpis.radicadas.toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-brand-subtle font-semibold">{fmtPct(kpis.desc_prom)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle font-semibold">{fmtCOP(kpis.valor_aut)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

      </div>
    </div>
  )
}

// ── Sub-componentes ──────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, accent, small, hint }: {
  icon: React.ReactNode; label: string; value: string | number
  accent: string; small?: boolean; hint?: string
}) {
  const bc: Record<string, string> = { teal: '#4FD1C5', gold: '#E8A33D', blue: '#60A5FA', red: '#E5484D', subtle: '#5B6472' }
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 relative overflow-hidden">
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: bc[accent] || '#4FD1C5' }}/>
      <div className="flex items-center gap-2 text-brand-subtle mb-2">{icon}<span className="text-xs">{label}</span></div>
      <div className={`font-title font-bold text-brand-text ${small ? 'text-lg' : 'text-2xl'}`}>{value}</div>
      {hint && <p className="text-brand-muted text-xs mt-1 font-mono">{hint}</p>}
    </div>
  )
}

function Panel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
      <h3 className="font-title text-base font-semibold text-brand-text">{title}</h3>
      <p className="text-xs text-brand-subtle mb-4">{sub}</p>
      {children}
    </div>
  )
}
