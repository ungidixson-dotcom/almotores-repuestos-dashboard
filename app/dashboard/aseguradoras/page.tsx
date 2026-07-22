'use client'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, AreaChart, Area, Legend,
} from 'recharts'
import { RefreshCw, Shield, TrendingUp, CheckCircle, FileCheck, FileClock } from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────────────────────
interface RowAseguradora {
  anio: number
  mes_subasta: string
  aseguradora_id: number
  aseguradora: string | null
  marca: string | null
  total: number
  subastadas: number
  autorizadas: number
  no_autorizadas: number
  facturadas: number
  radicadas: number
  valor_subastado: number
  valor_autorizado: number
}

interface MesDisponible { anio: number; mes: string; orden: number }

// ── Utilidades ───────────────────────────────────────────────────────────────
const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
const fmtM = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${(n / 1e3).toFixed(0)}K`
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`

const COLORES = [
  '#4FD1C5','#E8A33D','#60A5FA','#E5484D',
  '#A78BFA','#34D399','#F87171','#FBBF24','#6EE7B7','#818CF8',
  '#FB923C','#38BDF8','#F472B6',
]

const ORDEN_MES: Record<string, number> = {
  enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
  julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12,
}

// ── Fetch ────────────────────────────────────────────────────────────────────
async function fetchDatos() {
  const [{ data: rows }, { data: meses }] = await Promise.all([
    supabase.from('v_subastas_por_aseguradora').select(
      'anio,mes_subasta,aseguradora_id,aseguradora,marca,total,subastadas,autorizadas,no_autorizadas,facturadas,radicadas,valor_subastado,valor_autorizado'
    ),
    supabase.from('v_meses_disponibles').select('anio,mes,orden').order('anio').order('orden'),
  ])
  return {
    rows:  (rows  as RowAseguradora[]) || [],
    meses: (meses as MesDisponible[])  || [],
  }
}

// ── Componente ───────────────────────────────────────────────────────────────
export default function AseguradorasPage() {
  const router = useRouter()

  const [rows,  setRows]  = useState<RowAseguradora[]>([])
  const [meses, setMeses] = useState<MesDisponible[]>([])

  const [loading,             setLoading]             = useState(true)
  const [ultimaAct,           setUltimaAct]           = useState<Date | null>(null)
  const [countdown,           setCountdown]           = useState(1800)

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
    r.aseguradora !== null
  ), [rows, filtroAnio, filtroMes, filtroMarca])

  // ── Agregado por aseguradora ─────────────────────────────────────────────
  const porAseguradora = useMemo(() => {
    const map: Record<string, {
      nombre: string; total: number; autorizadas: number
      no_autorizadas: number; facturadas: number; radicadas: number
      valor_autorizado: number; valor_subastado: number
    }> = {}
    sf.forEach(r => {
      const k = r.aseguradora || 'Sin nombre'
      if (!map[k]) map[k] = { nombre: k, total: 0, autorizadas: 0, no_autorizadas: 0, facturadas: 0, radicadas: 0, valor_autorizado: 0, valor_subastado: 0 }
      map[k].total            += r.total || 0
      map[k].autorizadas      += r.autorizadas || 0
      map[k].no_autorizadas   += r.no_autorizadas || 0
      map[k].facturadas       += r.facturadas || 0
      map[k].radicadas        += r.radicadas || 0
      map[k].valor_autorizado += r.valor_autorizado || 0
      map[k].valor_subastado  += r.valor_subastado || 0
    })
    return Object.values(map).map(a => {
      const resueltas = a.autorizadas + a.no_autorizadas
      return {
        ...a,
        tasa_auth:     resueltas    > 0 ? (a.autorizadas / resueltas)    * 100 : 0,
        tasa_fact:     a.autorizadas > 0 ? (a.facturadas  / a.autorizadas) * 100 : 0,
        tasa_radicar:  a.facturadas  > 0 ? (a.radicadas   / a.facturadas)  * 100 : 0,
      }
    }).sort((a, b) => b.valor_autorizado - a.valor_autorizado)
  }, [sf])

  // ── KPIs globales ────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total         = porAseguradora.reduce((a, r) => a + r.total, 0)
    const autorizadas   = porAseguradora.reduce((a, r) => a + r.autorizadas, 0)
    const no_aut        = porAseguradora.reduce((a, r) => a + r.no_autorizadas, 0)
    const facturadas    = porAseguradora.reduce((a, r) => a + r.facturadas, 0)
    const radicadas     = porAseguradora.reduce((a, r) => a + r.radicadas, 0)
    const valor_aut     = porAseguradora.reduce((a, r) => a + r.valor_autorizado, 0)
    const valor_sub     = porAseguradora.reduce((a, r) => a + r.valor_subastado, 0)
    const resueltas     = autorizadas + no_aut
    return {
      total, autorizadas, no_aut, facturadas, radicadas, valor_aut, valor_sub,
      tasa_auth:   resueltas   > 0 ? (autorizadas / resueltas)   * 100 : 0,
      tasa_fact:   autorizadas > 0 ? (facturadas  / autorizadas) * 100 : 0,
      tasa_radicar:facturadas  > 0 ? (radicadas   / facturadas)  * 100 : 0,
    }
  }, [porAseguradora])

  // ── Evolución mensual (top 5 aseguradoras por valor) ────────────────────
  const top5 = useMemo(() => porAseguradora.slice(0, 5).map(a => a.nombre), [porAseguradora])

  const evolucionMensual = useMemo(() => {
    const mesesOrdenados = mesesDelAnio.length > 0 ? mesesDelAnio : Object.keys(ORDEN_MES)
    return mesesOrdenados.map(mes => {
      const entry: Record<string, string | number> = {
        mes: mes.charAt(0).toUpperCase() + mes.slice(1),
      }
      top5.forEach(nombre => {
        const total = rows
          .filter(r => r.anio === filtroAnio && r.mes_subasta === mes && r.aseguradora === nombre &&
            (filtroMarca === 'todas' || r.marca === filtroMarca))
          .reduce((a, r) => a + (r.valor_autorizado || 0), 0)
        entry[nombre] = total || 0
      })
      return entry
    })
  }, [rows, filtroAnio, filtroMarca, mesesDelAnio, top5])

  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center flex-col gap-3">
      <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin"/>
      <p className="text-brand-subtle font-mono text-xs">Cargando aseguradoras...</p>
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
            Almotores KIA · Aseguradoras
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
          <h1 className="font-title text-2xl font-bold text-brand-text">Aseguradoras</h1>
          <p className="text-brand-subtle text-sm mt-1">
            Rendimiento por aseguradora · {filtroAnio}{filtroMes !== 'todos' ? ` · ${filtroMes}` : ''}
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

        {/* KPIs GLOBALES */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
          <KpiCard icon={<TrendingUp size={15}/>}  label="Total subastas"   value={kpis.total.toLocaleString('es-CO')}     accent="subtle"/>
          <KpiCard icon={<CheckCircle size={15}/>} label="Autorizadas"      value={kpis.autorizadas.toLocaleString('es-CO')} accent="teal"/>
          <KpiCard icon={<Shield size={15}/>}      label="Tasa autorización" value={fmtPct(kpis.tasa_auth)}                accent="teal" hint="aut / (aut + no aut)"/>
          <KpiCard icon={<FileCheck size={15}/>}   label="Facturadas"       value={kpis.facturadas.toLocaleString('es-CO')} accent="gold"/>
          <KpiCard icon={<FileClock size={15}/>}   label="Radicadas"        value={kpis.radicadas.toLocaleString('es-CO')}  accent="blue"/>
          <KpiCard icon={<TrendingUp size={15}/>}  label="Tasa facturación" value={fmtPct(kpis.tasa_fact)}                accent="gold" hint="fact / autorizadas"/>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <KpiCard icon={<TrendingUp size={15}/>}  label="Valor subastado"  value={fmtCOP(kpis.valor_sub)}  accent="subtle" small/>
          <KpiCard icon={<CheckCircle size={15}/>} label="Valor autorizado" value={fmtCOP(kpis.valor_aut)}  accent="teal"   small/>
        </div>

        {/* GRÁFICAS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

          {/* Barras: valor autorizado por aseguradora */}
          <Panel title="Valor autorizado por aseguradora" sub="Ordenado de mayor a menor">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={porAseguradora} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" horizontal={false}/>
                <XAxis type="number" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtM(v)}/>
                <YAxis type="category" dataKey="nombre" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={false} tickLine={false} width={90}/>
                <Tooltip
                  contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [fmtCOP(v), 'Valor autorizado']}
                />
                <Bar dataKey="valor_autorizado" radius={[0, 4, 4, 0]} name="Valor autorizado">
                  {porAseguradora.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          {/* Barras: volumen de subastas */}
          <Panel title="Volumen de subastas" sub="Total · Autorizadas · No autorizadas">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={porAseguradora} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" horizontal={false}/>
                <XAxis type="number" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="nombre" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={false} tickLine={false} width={90}/>
                <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}/>
                <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8' }}/>
                <Bar dataKey="autorizadas"    name="Autorizadas"     fill="#4FD1C5" radius={[0, 3, 3, 0]} stackId="a"/>
                <Bar dataKey="no_autorizadas" name="No autorizadas"  fill="#E5484D" radius={[0, 3, 3, 0]} stackId="a"/>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* EVOLUCIÓN MENSUAL TOP 5 */}
        <div className="mb-4">
          <Panel title="Evolución mensual · Top 5 aseguradoras" sub={`Valor autorizado por mes — ${filtroAnio}`}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={evolucionMensual} margin={{ left: 0, right: 16, top: 12, bottom: 0 }}>
                <defs>
                  {top5.map((_, i) => (
                    <linearGradient key={i} id={`grad_aseg_${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORES[i % COLORES.length]} stopOpacity={0.3}/>
                      <stop offset="100%" stopColor={COLORES[i % COLORES.length]} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A36" vertical={false}/>
                <XAxis dataKey="mes" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={40}/>
                <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v ? fmtM(v) : ''}/>
                <Tooltip
                  contentStyle={{ background: '#0F1419', border: '1px solid #2A3340', borderRadius: 10, fontSize: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                  formatter={(v: number) => [fmtCOP(v), '']}
                  labelStyle={{ color: '#8AA4C8', marginBottom: 4 }}/>
                <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8', paddingTop: 8 }}/>
                {top5.map((nombre, i) => (
                  <Area key={nombre} type="monotone" dataKey={nombre}
                    stroke={COLORES[i % COLORES.length]} strokeWidth={2.5}
                    fill={`url(#grad_aseg_${i})`}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#0F1419', fill: COLORES[i % COLORES.length] }}
                    connectNulls/>
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* TABLA DETALLE */}
        <Panel title="Detalle por aseguradora" sub="Todas las métricas del periodo filtrado">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Aseguradora','Total','Autorizadas','No aut.','Tasa aut.','Facturadas','Radicadas','Tasa fact.','Valor autorizado'].map(h => (
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porAseguradora.map((a, i) => (
                  <tr key={a.nombre} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORES[i % COLORES.length] }}/>
                        <span className="text-brand-text font-medium">{a.nombre}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-mono text-brand-subtle">{a.total.toLocaleString('es-CO')}</td>
                    <td className="py-3 pr-4 font-mono text-brand-teal font-semibold">{a.autorizadas.toLocaleString('es-CO')}</td>
                    <td className="py-3 pr-4 font-mono text-brand-red">{a.no_autorizadas.toLocaleString('es-CO')}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-brand-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-brand-teal" style={{ width: `${Math.min(a.tasa_auth, 100)}%` }}/>
                        </div>
                        <span className="font-mono text-xs text-brand-subtle">{fmtPct(a.tasa_auth)}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-mono text-brand-gold">{a.facturadas.toLocaleString('es-CO')}</td>
                    <td className="py-3 pr-4 font-mono text-blue-400">{a.radicadas.toLocaleString('es-CO')}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-brand-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(a.tasa_fact, 100)}%`, background: a.tasa_fact >= 50 ? '#4FD1C5' : '#E8A33D' }}/>
                        </div>
                        <span className="font-mono text-xs text-brand-subtle">{fmtPct(a.tasa_fact)}</span>
                      </div>
                    </td>
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
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle font-semibold">{fmtPct(kpis.tasa_auth)}</td>
                  <td className="py-3 pr-4 font-mono text-brand-gold font-semibold">{kpis.facturadas.toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-blue-400 font-semibold">{kpis.radicadas.toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle font-semibold">{fmtPct(kpis.tasa_fact)}</td>
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
