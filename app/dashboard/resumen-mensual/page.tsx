'use client'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
  ComposedChart, Area,
} from 'recharts'
import { RefreshCw, TrendingUp, CheckCircle, FileCheck, FileClock, BarChart2 } from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────────────────────
interface RowMes {
  anio: number
  mes_subasta: string
  marca: string | null
  total: number
  subastadas: number
  auth_completa: number
  auth_parcial: number
  no_autorizadas: number
  pend_auth: number
  en_pedido: number
  facturadas: number
  radicadas: number
  valor_subastado: number
  valor_autorizado: number
  descuento_prom: number
}

// ── Constantes ────────────────────────────────────────────────────────────────
const ORDEN_MES: Record<string, number> = {
  enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
  julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12,
}
const NOMBRE_MES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const TODOS_MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

const COLORES_MARCA: Record<string, string> = {
  'Kia':     '#4FD1C5',
  'Vw':      '#60A5FA',
  'Renault': '#E8A33D',
  'Jac':     '#A78BFA',
  'Sin Marca': '#5B6472',
}
const COLOR_DEFAULT = '#34D399'

// ── Utilidades ────────────────────────────────────────────────────────────────
const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
const fmtM = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${(n / 1e3).toFixed(0)}K`
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchDatos(): Promise<RowMes[]> {
  const { data } = await supabase
    .from('v_subastas_por_mes')
    .select('anio,mes_subasta,marca,total,subastadas,auth_completa,auth_parcial,no_autorizadas,pend_auth,en_pedido,facturadas,radicadas,valor_subastado,valor_autorizado,descuento_prom')
  return (data as RowMes[]) || []
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function ResumenMensualPage() {
  const router = useRouter()

  const [rows,     setRows]     = useState<RowMes[]>([])
  const [loading,  setLoading]  = useState(true)
  const [ultimaAct,setUltimaAct]= useState<Date | null>(null)
  const [countdown,setCountdown]= useState(1800)

  const [filtroAnio,       setFiltroAnio]        = useState(2026)
  const [filtroAnioComp,   setFiltroAnioComp]    = useState<number | null>(2025)
  const [filtroMarca,      setFiltroMarca]        = useState('todas')
  const [vistaDesglose,    setVistaDesglose]      = useState<'marca' | 'estado'>('estado')

  const cargarDatos = useCallback(async (verificarAuth = false) => {
    if (verificarAuth) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
    }
    const datos = await fetchDatos()
    setRows(datos)
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

  // ── Opciones ─────────────────────────────────────────────────────────────
  const aniosDisponibles = useMemo(() =>
    Array.from(new Set(rows.map(r => r.anio).filter(Boolean))).sort((a, b) => b - a),
  [rows])

  const marcas = useMemo(() => {
    const ms = rows.filter(r => r.anio === filtroAnio && r.marca && r.marca !== 'Sin Marca')
      .map(r => r.marca as string)
    return Array.from(new Set(ms)).sort()
  }, [rows, filtroAnio])

  // ── Agregado mensual principal ────────────────────────────────────────────
  const resumenPorMes = useMemo(() => {
    return TODOS_MESES.map(mes => {
      const filas = rows.filter(r =>
        r.anio === filtroAnio &&
        r.mes_subasta === mes &&
        (filtroMarca === 'todas' || r.marca === filtroMarca)
      )
      const total         = filas.reduce((a, r) => a + (r.total || 0), 0)
      const auth_completa = filas.reduce((a, r) => a + (r.auth_completa || 0), 0)
      const auth_parcial  = filas.reduce((a, r) => a + (r.auth_parcial || 0), 0)
      const no_aut        = filas.reduce((a, r) => a + (r.no_autorizadas || 0), 0)
      const pend          = filas.reduce((a, r) => a + (r.pend_auth || 0), 0)
      const facturadas    = filas.reduce((a, r) => a + (r.facturadas || 0), 0)
      const radicadas     = filas.reduce((a, r) => a + (r.radicadas || 0), 0)
      const valor_aut     = filas.reduce((a, r) => a + (r.valor_autorizado || 0), 0)
      const valor_sub     = filas.reduce((a, r) => a + (r.valor_subastado || 0), 0)
      const autorizadas   = auth_completa + auth_parcial
      const resueltas     = autorizadas + no_aut
      return {
        mes,
        mesCorto: NOMBRE_MES[ORDEN_MES[mes]],
        orden: ORDEN_MES[mes],
        total, auth_completa, auth_parcial, autorizadas,
        no_aut, pend, facturadas, radicadas,
        valor_aut, valor_sub,
        tasa_auth:    resueltas  > 0 ? (autorizadas / resueltas)   * 100 : null,
        tasa_fact:    autorizadas > 0 ? (facturadas  / autorizadas) * 100 : null,
        tieneDatos:   total > 0,
      }
    }).filter(m => m.tieneDatos)
  }, [rows, filtroAnio, filtroMarca])

  // ── Comparativo año anterior ─────────────────────────────────────────────
  const resumenComp = useMemo(() => {
    if (!filtroAnioComp) return {}
    const map: Record<string, number> = {}
    TODOS_MESES.forEach(mes => {
      const filas = rows.filter(r =>
        r.anio === filtroAnioComp &&
        r.mes_subasta === mes &&
        (filtroMarca === 'todas' || r.marca === filtroMarca)
      )
      const v = filas.reduce((a, r) => a + (r.valor_autorizado || 0), 0)
      if (v > 0) map[mes] = v
    })
    return map
  }, [rows, filtroAnioComp, filtroMarca])

  // ── Serie para gráfica principal (valor + comparativo) ───────────────────
  const serieValor = useMemo(() =>
    resumenPorMes.map(m => ({
      ...m,
      valorComp: resumenComp[m.mes] || null,
    })),
  [resumenPorMes, resumenComp])

  // ── Desglose por marca por mes ───────────────────────────────────────────
  const seriePorMarca = useMemo(() => {
    const marcasActivas = filtroMarca === 'todas' ? marcas : [filtroMarca]
    return TODOS_MESES
      .filter(mes => rows.some(r => r.anio === filtroAnio && r.mes_subasta === mes))
      .map(mes => {
        const entry: Record<string, string | number> = { mesCorto: NOMBRE_MES[ORDEN_MES[mes]] }
        marcasActivas.forEach(marca => {
          const filas = rows.filter(r => r.anio === filtroAnio && r.mes_subasta === mes && r.marca === marca)
          entry[marca] = filas.reduce((a, r) => a + (r.valor_autorizado || 0), 0) || 0
        })
        return entry
      })
  }, [rows, filtroAnio, filtroMarca, marcas])

  // ── KPIs acumulados del año ──────────────────────────────────────────────
  const kpisAnio = useMemo(() => {
    const total       = resumenPorMes.reduce((a, m) => a + m.total, 0)
    const autorizadas = resumenPorMes.reduce((a, m) => a + m.autorizadas, 0)
    const no_aut      = resumenPorMes.reduce((a, m) => a + m.no_aut, 0)
    const facturadas  = resumenPorMes.reduce((a, m) => a + m.facturadas, 0)
    const radicadas   = resumenPorMes.reduce((a, m) => a + m.radicadas, 0)
    const valor_aut   = resumenPorMes.reduce((a, m) => a + m.valor_aut, 0)
    const resueltas   = autorizadas + no_aut
    // Mejor y peor mes por valor autorizado
    const conValor    = resumenPorMes.filter(m => m.valor_aut > 0)
    const mejorMes    = conValor.length ? conValor.reduce((a, b) => b.valor_aut > a.valor_aut ? b : a) : null
    const peorMes     = conValor.length ? conValor.reduce((a, b) => b.valor_aut < a.valor_aut ? b : a) : null
    return {
      total, autorizadas, no_aut, facturadas, radicadas, valor_aut,
      tasa_auth:  resueltas   > 0 ? (autorizadas / resueltas)   * 100 : 0,
      tasa_fact:  autorizadas > 0 ? (facturadas  / autorizadas) * 100 : 0,
      mejorMes, peorMes,
      mesesConDatos: resumenPorMes.length,
      promValorMes: resumenPorMes.length > 0 ? valor_aut / resumenPorMes.length : 0,
    }
  }, [resumenPorMes])

  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center flex-col gap-3">
      <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin"/>
      <p className="text-brand-subtle font-mono text-xs">Cargando resumen mensual...</p>
    </div>
  )

  const marcasActivas = filtroMarca === 'todas' ? marcas : [filtroMarca]

  return (
    <div className="min-h-screen bg-brand-bg">

      {/* TOP BAR */}
      <div className="border-b border-brand-border bg-brand-surface/50 px-6 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-brand-teal animate-pulse"/>
          <span className="font-mono text-xs text-brand-subtle uppercase tracking-widest">
            Almotores KIA · Resumen Mensual
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
          <h1 className="font-title text-2xl font-bold text-brand-text">Resumen Mensual</h1>
          <p className="text-brand-subtle text-sm mt-1">
            Evolución mes a mes · {kpisAnio.mesesConDatos} meses con datos en {filtroAnio}
          </p>
        </div>

        {/* FILTROS */}
        <div className="flex flex-wrap gap-2 mb-6 p-4 bg-brand-surface border border-brand-border rounded-xl">
          <span className="font-mono text-xs text-brand-muted self-center mr-2 uppercase tracking-wider">Ver</span>

          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Año principal</span>
            <select value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}
              className="bg-brand-bg border border-brand-teal/50 rounded-lg px-3 py-1.5 text-brand-teal text-sm font-mono font-semibold outline-none focus:border-brand-teal">
              {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Comparar con</span>
            <select
              value={filtroAnioComp ?? ''}
              onChange={e => setFiltroAnioComp(e.target.value ? Number(e.target.value) : null)}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal"
            >
              <option value="">Sin comparativo</option>
              {aniosDisponibles.filter(a => a !== filtroAnio).map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
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

          <div className="ml-auto flex items-center gap-1 border border-brand-border rounded-lg overflow-hidden">
            <button
              onClick={() => setVistaDesglose('estado')}
              className={`px-3 py-1.5 text-xs font-mono transition-colors ${vistaDesglose === 'estado' ? 'bg-brand-teal/10 text-brand-teal' : 'text-brand-subtle hover:text-brand-text'}`}
            >
              Por estado
            </button>
            <button
              onClick={() => setVistaDesglose('marca')}
              className={`px-3 py-1.5 text-xs font-mono transition-colors ${vistaDesglose === 'marca' ? 'bg-brand-teal/10 text-brand-teal' : 'text-brand-subtle hover:text-brand-text'}`}
            >
              Por marca
            </button>
          </div>
        </div>

        {/* KPIs ANUALES */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
          <KpiCard icon={<TrendingUp size={15}/>}  label={`Total ${filtroAnio}`}     value={kpisAnio.total.toLocaleString('es-CO')}       accent="subtle"/>
          <KpiCard icon={<CheckCircle size={15}/>} label="Autorizadas"               value={kpisAnio.autorizadas.toLocaleString('es-CO')}  accent="teal"/>
          <KpiCard icon={<TrendingUp size={15}/>}  label="Tasa aut. global"          value={fmtPct(kpisAnio.tasa_auth)}                   accent="teal"  hint="aut / resueltas"/>
          <KpiCard icon={<FileCheck size={15}/>}   label="Facturadas"                value={kpisAnio.facturadas.toLocaleString('es-CO')}   accent="gold"/>
          <KpiCard icon={<FileClock size={15}/>}   label="Radicadas"                 value={kpisAnio.radicadas.toLocaleString('es-CO')}    accent="blue"/>
          <KpiCard icon={<BarChart2 size={15}/>}   label="Prom. valor / mes"         value={fmtM(kpisAnio.promValorMes)}                  accent="gold"/>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <KpiCard icon={<TrendingUp size={15}/>}  label="Valor autorizado acumulado" value={fmtCOP(kpisAnio.valor_aut)} accent="teal" small/>
          <KpiCard icon={<TrendingUp size={15}/>}  label="Tasa facturación acumulada" value={fmtPct(kpisAnio.tasa_fact)} accent="gold" small hint="facturadas / autorizadas"/>
        </div>

        {/* MEJOR Y PEOR MES */}
        {kpisAnio.mejorMes && kpisAnio.peorMes && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-brand-teal/5 border border-brand-teal/30 rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-brand-teal/15 flex items-center justify-center shrink-0">
                <TrendingUp size={18} className="text-brand-teal"/>
              </div>
              <div>
                <p className="font-mono text-[10px] text-brand-teal uppercase tracking-wider mb-0.5">Mejor mes</p>
                <p className="font-title font-bold text-brand-text capitalize">{kpisAnio.mejorMes.mes}</p>
                <p className="font-mono text-xs text-brand-subtle">{fmtCOP(kpisAnio.mejorMes.valor_aut)}</p>
              </div>
            </div>
            <div className="bg-brand-red/5 border border-brand-red/30 rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-brand-red/15 flex items-center justify-center shrink-0">
                <TrendingUp size={18} className="text-brand-red rotate-180"/>
              </div>
              <div>
                <p className="font-mono text-[10px] text-brand-red uppercase tracking-wider mb-0.5">Mes más bajo</p>
                <p className="font-title font-bold text-brand-text capitalize">{kpisAnio.peorMes.mes}</p>
                <p className="font-mono text-xs text-brand-subtle">{fmtCOP(kpisAnio.peorMes.valor_aut)}</p>
              </div>
            </div>
          </div>
        )}

        {/* GRÁFICA PRINCIPAL: VALOR AUTORIZADO + COMPARATIVO */}
        <div className="mb-4">
          <Panel
            title={filtroAnioComp ? `Valor autorizado — ${filtroAnio} vs ${filtroAnioComp}` : `Valor autorizado por mes — ${filtroAnio}`}
            sub={filtroAnioComp ? `Área = ${filtroAnio} · línea punteada = ${filtroAnioComp}` : 'Evolución mensual del valor autorizado'}
          >
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={serieValor} margin={{ left: 0, right: 16, top: 12, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad_resumen_anio" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4FD1C5" stopOpacity={0.4}/>
                    <stop offset="100%" stopColor="#4FD1C5" stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A36" vertical={false}/>
                <XAxis dataKey="mesCorto" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v ? fmtM(v) : ''}/>
                <Tooltip
                  contentStyle={{ background: '#0F1419', border: '1px solid #2A3340', borderRadius: 10, fontSize: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                  formatter={(v: number, name: string) => [v ? fmtCOP(v) : '—', name]}
                  labelStyle={{ color: '#8AA4C8', marginBottom: 4 }}/>
                <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8', paddingTop: 8 }}/>
                <Area type="monotone" dataKey="valor_aut" name={`${filtroAnio}`}
                  fill="url(#grad_resumen_anio)" stroke="#4FD1C5" strokeWidth={2.5}
                  dot={{ fill: '#4FD1C5', r: 4, strokeWidth: 2, stroke: '#0F1419' }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: '#0F1419' }}
                  connectNulls/>
                {filtroAnioComp && (
                  <Line type="monotone" dataKey="valorComp" name={`${filtroAnioComp}`}
                    stroke="#E8A33D" strokeWidth={2} strokeDasharray="6 3"
                    dot={{ fill: '#E8A33D', r: 3, strokeWidth: 2, stroke: '#0F1419' }}
                    activeDot={{ r: 5, fill: '#E8A33D' }}
                    connectNulls/>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* GRÁFICA DESGLOSE */}
        <div className="mb-4">
          {vistaDesglose === 'estado' ? (
            <Panel title="Volumen mensual por estado" sub="Autorizadas · No autorizadas · Pendientes respuesta">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={resumenPorMes} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2A36" vertical={false}/>
                  <XAxis dataKey="mesCorto" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ background: '#0F1419', border: '1px solid #2A3340', borderRadius: 10, fontSize: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}/>
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8' }}/>
                  <Bar dataKey="auth_completa" name="Auth. completa" fill="#4FD1C5" stackId="a"/>
                  <Bar dataKey="auth_parcial"  name="Auth. parcial"  fill="#34D399" stackId="a"/>
                  <Bar dataKey="no_aut"        name="No autorizadas" fill="#E5484D" stackId="a"/>
                  <Bar dataKey="pend"          name="Sin respuesta"  fill="#5B6472" stackId="a" radius={[4, 4, 0, 0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          ) : (
            <Panel title="Valor autorizado por marca" sub="Desglose mensual por cada marca">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={seriePorMarca} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2A36" vertical={false}/>
                  <XAxis dataKey="mesCorto" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v ? fmtM(v) : ''}/>
                  <Tooltip contentStyle={{ background: '#0F1419', border: '1px solid #2A3340', borderRadius: 10, fontSize: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                    formatter={(v: number) => [fmtCOP(v), '']}/>
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8' }}/>
                  {marcasActivas.map(marca => (
                    <Bar key={marca} dataKey={marca} fill={COLORES_MARCA[marca] || COLOR_DEFAULT} stackId="m" radius={[0, 0, 0, 0]}/>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )}
        </div>

        {/* TABLA DETALLE POR MES */}
        <Panel title="Detalle mes a mes" sub={`Todas las métricas — ${filtroAnio}${filtroMarca !== 'todas' ? ` · ${filtroMarca}` : ''}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Mes','Total','Auth. completa','Auth. parcial','No aut.','Sin resp.','Tasa aut.','Facturadas','Radicadas','Tasa fact.','Valor autorizado'].map(h => (
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resumenPorMes.map(m => {
                  const comp = resumenComp[m.mes]
                  const varPct = comp && comp > 0 ? ((m.valor_aut - comp) / comp) * 100 : null
                  return (
                    <tr key={m.mes} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div>
                          <span className="text-brand-text font-medium capitalize">{m.mes}</span>
                          {varPct !== null && (
                            <span className={`ml-2 font-mono text-[10px] ${varPct >= 0 ? 'text-brand-teal' : 'text-brand-red'}`}>
                              {varPct >= 0 ? '+' : ''}{varPct.toFixed(1)}% vs {filtroAnioComp}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 font-mono text-brand-subtle">{m.total.toLocaleString('es-CO')}</td>
                      <td className="py-3 pr-4 font-mono text-brand-teal font-semibold">{m.auth_completa.toLocaleString('es-CO')}</td>
                      <td className="py-3 pr-4 font-mono text-green-400">{m.auth_parcial.toLocaleString('es-CO')}</td>
                      <td className="py-3 pr-4 font-mono text-brand-red">{m.no_aut.toLocaleString('es-CO')}</td>
                      <td className="py-3 pr-4 font-mono text-brand-muted">{m.pend.toLocaleString('es-CO')}</td>
                      <td className="py-3 pr-4">
                        {m.tasa_auth !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-1.5 bg-brand-border rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-brand-teal" style={{ width: `${Math.min(m.tasa_auth, 100)}%` }}/>
                            </div>
                            <span className="font-mono text-xs text-brand-subtle">{fmtPct(m.tasa_auth)}</span>
                          </div>
                        ) : <span className="text-brand-muted font-mono text-xs">—</span>}
                      </td>
                      <td className="py-3 pr-4 font-mono text-brand-gold">{m.facturadas.toLocaleString('es-CO')}</td>
                      <td className="py-3 pr-4 font-mono text-blue-400">{m.radicadas.toLocaleString('es-CO')}</td>
                      <td className="py-3 pr-4">
                        {m.tasa_fact !== null ? (
                          <span className="font-mono text-xs text-brand-subtle">{fmtPct(m.tasa_fact)}</span>
                        ) : <span className="text-brand-muted font-mono text-xs">—</span>}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(m.valor_aut)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-border">
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle font-semibold">TOTAL {filtroAnio}</td>
                  <td className="py-3 pr-4 font-mono text-brand-subtle font-semibold">{kpisAnio.total.toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-brand-teal font-semibold">{resumenPorMes.reduce((a,m) => a + m.auth_completa, 0).toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-green-400 font-semibold">{resumenPorMes.reduce((a,m) => a + m.auth_parcial, 0).toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-brand-red font-semibold">{kpisAnio.no_aut.toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-brand-muted font-semibold">{resumenPorMes.reduce((a,m) => a + m.pend, 0).toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle font-semibold">{fmtPct(kpisAnio.tasa_auth)}</td>
                  <td className="py-3 pr-4 font-mono text-brand-gold font-semibold">{kpisAnio.facturadas.toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-blue-400 font-semibold">{kpisAnio.radicadas.toLocaleString('es-CO')}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle font-semibold">{fmtPct(kpisAnio.tasa_fact)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle font-semibold">{fmtCOP(kpisAnio.valor_aut)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

      </div>
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
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
