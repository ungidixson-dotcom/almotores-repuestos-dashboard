'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, AreaChart, Area,
} from 'recharts'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface DatoAseg {
  anio: number; aseguradora_id: number; aseguradora: string; marca: string
  total: number; autorizadas: number; no_autorizadas: number
  facturadas: number; radicadas: number
  valor_subastado: number; valor_autorizado: number
}
interface DatoAsesor {
  anio: number; asesor_id: number; asesor: string; marca: string
  total: number; autorizadas: number; no_autorizadas: number
  facturadas: number; radicadas: number
  valor_subastado: number; valor_autorizado: number; descuento_prom: number
}
interface DatoMes {
  anio: number; mes_subasta: string; marca: string
  total: number; autorizadas: number; auth_completa: number; auth_parcial: number
  facturadas: number; radicadas: number; pend_auth: number; en_pedido: number
  valor_subastado: number; valor_autorizado: number; descuento_prom: number
}

// ── Constantes ────────────────────────────────────────────────────────────────
const YEARS = [2024, 2025, 2026]
const MESES_ORD   = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const MESES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const COLORES_AÑO: Record<number,string> = { 2024:'#63B3ED', 2025:'#68D391', 2026:'#F6AD55' }
const COLORES = ['#4FD1C5','#68D391','#F6AD55','#FC8181','#B794F4','#63B3ED','#F687B3','#FBD38D','#9AE6B4','#90CDF4','#FEB2B2','#E9D8FD']

const fmtCOP = (v: number) => {
  if (!v && v !== 0) return '—'
  const abs = Math.abs(v), sign = v < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}$${(abs/1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(1)}M`
  return `${sign}$${abs.toLocaleString('es-CO',{maximumFractionDigits:0})}`
}
const pct = (n: number, d: number) => d > 0 ? `${((n/d)*100).toFixed(1)}%` : '—'
const pctN = (n: number, d: number) => d > 0 ? (n/d)*100 : 0

function Panel({children, className=''}:{children:React.ReactNode; className?:string}) {
  return <div className={`rounded-xl border border-brand-border bg-brand-surface p-5 ${className}`}>{children}</div>
}

function Delta({ val, inv=false }: { val: number; inv?: boolean }) {
  if (isNaN(val) || !isFinite(val)) return <span className="text-xs font-mono text-brand-subtle">—</span>
  const positive = inv ? val < 0 : val > 0
  const color = val === 0 ? 'text-brand-subtle' : positive ? 'text-green-400' : 'text-red-400'
  const icon  = val > 0 ? '↑' : val < 0 ? '↓' : '→'
  return <span className={`text-xs font-mono ${color}`}>{icon} {Math.abs(val).toFixed(1)}%</span>
}

const TT = ({active,payload,label}:any) => {
  if (!active||!payload?.length) return null
  return (
    <div className="bg-brand-surface border border-brand-border rounded-lg p-3 shadow-xl min-w-[160px]">
      <p className="text-xs font-mono text-brand-subtle mb-2">{label}</p>
      {payload.map((p:any,i:number)=>(
        <p key={i} className="text-xs font-mono" style={{color:p.color}}>
          {p.name}: {p.value>10000?fmtCOP(p.value):typeof p.value==='number'?p.value.toFixed(1):p.value}
        </p>
      ))}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ComparativoSubastasPage() {
  const [añoBase,    setAñoBase]    = useState(2025)
  const [añoComp,    setAñoComp]    = useState(2026)
  const [tab,        setTab]        = useState<'resumen'|'aseguradoras'|'asesores'|'tendencias'|'oportunidades'>('resumen')
  const [filtroMes,  setFiltroMes]  = useState<string[]>([])  // [] = todos
  const [filtroMarca,setFiltroMarca]= useState('Todas')
  const [filtroAseg, setFiltroAseg] = useState('Todas')

  const [datosAseg,   setDatosAseg]   = useState<DatoAseg[]>([])
  const [datosAsesor, setDatosAsesor] = useState<DatoAsesor[]>([])
  const [datosMes,    setDatosMes]    = useState<DatoMes[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [ultimaAct,   setUltimaAct]   = useState<Date|null>(null)

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [{data:dA},{data:dAs},{data:dM}] = await Promise.all([
        supabase.from('v_subastas_por_aseguradora').select('*').in('anio', YEARS),
        supabase.from('v_subastas_por_asesor').select('*').in('anio', YEARS),
        supabase.from('v_subastas_por_mes').select('*').in('anio', YEARS),
      ])
      setDatosAseg((dA??[]) as DatoAseg[])
      setDatosAsesor((dAs??[]) as DatoAsesor[])
      setDatosMes((dM??[]) as DatoMes[])
      setUltimaAct(new Date())
    } catch(e:any){setError(`Error: ${e?.message}`)}
    setLoading(false)
  },[])

  useEffect(()=>{cargar()},[cargar])

  const marcasUnicas = useMemo(()=>{
    const s = new Set<string>()
    datosAseg.forEach(d=>{ if(d.marca && d.marca!=='Sin marca') s.add(d.marca) })
    return ['Todas', ...Array.from(s).sort()]
  },[datosAseg])

  const aseguadorasUnicas = useMemo(()=>{
    const s = new Set<string>()
    datosAseg.forEach(d=>{ if(d.aseguradora) s.add(d.aseguradora) })
    return ['Todas', ...Array.from(s).sort()]
  },[datosAseg])

  // ── Función de filtrado aplicado a datos ─────────────────────────────────
  const aplicarFiltros = (datos: any[]) => datos.filter(d=>{
    if (filtroMarca !== 'Todas' && d.marca !== filtroMarca) return false
    if (filtroAseg !== 'Todas' && d.aseguradora !== filtroAseg) return false
    if (filtroMes.length > 0 && !filtroMes.includes(d.mes_subasta)) return false
    return true
  })
  const porAño = useMemo(()=>{
    const r:Record<number,{total:number;autorizadas:number;facturadas:number;radicadas:number;valSub:number;valAuth:number}> = {}
    YEARS.forEach(y => r[y]={total:0,autorizadas:0,facturadas:0,radicadas:0,valSub:0,valAuth:0})
    datosMes.forEach(d=>{
      if (!r[d.anio]) return
      r[d.anio].total      += Number(d.total||0)
      r[d.anio].autorizadas+= Number(d.autorizadas||0)
      r[d.anio].facturadas += Number(d.facturadas||0)
      r[d.anio].valSub     += Number(d.valor_subastado||0)
      r[d.anio].valAuth    += Number(d.valor_autorizado||0)
    })
    return r
  },[datosMes, filtroMarca, filtroAseg, filtroMes])

  // ── Variación % entre dos años ────────────────────────────────────────────
  const variacion = (base: number, comp: number) => base > 0 ? ((comp - base) / base) * 100 : 0

  // ── Aseguradoras agrupadas por año (con filtros) ──────────────────────────
  const asegPorAño = useMemo(()=>{
    const mapa:Record<string,Record<number,any>> = {}
    aplicarFiltros(datosAseg).forEach((d:any)=>{
      if (!mapa[d.aseguradora]) mapa[d.aseguradora] = {}
      if (!mapa[d.aseguradora][d.anio]) {
        mapa[d.aseguradora][d.anio] = {...d,total:0,autorizadas:0,no_autorizadas:0,facturadas:0,radicadas:0,valor_subastado:0,valor_autorizado:0}
      }
      const r = mapa[d.aseguradora][d.anio]
      r.total+=Number(d.total||0); r.autorizadas+=Number(d.autorizadas||0)
      r.no_autorizadas+=Number(d.no_autorizadas||0); r.facturadas+=Number(d.facturadas||0)
      r.radicadas+=Number(d.radicadas||0); r.valor_subastado+=Number(d.valor_subastado||0)
      r.valor_autorizado+=Number(d.valor_autorizado||0)
    })
    // Calcular tasas
    Object.values(mapa).forEach((porAnio:any)=>{
      Object.values(porAnio).forEach((r:any)=>{
        r.tasaAuth  = pctN(r.autorizadas, r.total)
        r.convTotal = pctN(r.facturadas, r.total)
      })
    })
    return mapa
  },[datosAseg, filtroMarca, filtroAseg, filtroMes])

  // ── Asesores agrupados por año (con filtros) ───────────────────────────────
  const asesorPorAño = useMemo(()=>{
    const mapa:Record<string,Record<number,any>> = {}
    aplicarFiltros(datosAsesor).forEach((d:any)=>{
      if (!mapa[d.asesor]) mapa[d.asesor] = {}
      if (!mapa[d.asesor][d.anio]) {
        mapa[d.asesor][d.anio] = {...d,total:0,autorizadas:0,no_autorizadas:0,facturadas:0,radicadas:0,valor_subastado:0,valor_autorizado:0,descuento_prom:0,_descN:0}
      }
      const r = mapa[d.asesor][d.anio]
      r.total+=Number(d.total||0); r.autorizadas+=Number(d.autorizadas||0)
      r.no_autorizadas+=Number(d.no_autorizadas||0); r.facturadas+=Number(d.facturadas||0)
      r.radicadas+=Number(d.radicadas||0); r.valor_subastado+=Number(d.valor_subastado||0)
      r.valor_autorizado+=Number(d.valor_autorizado||0)
      if(d.descuento_prom){r.descuento_prom+=Number(d.descuento_prom||0);r._descN++}
    })
    Object.values(mapa).forEach((porAnio:any)=>{
      Object.values(porAnio).forEach((r:any)=>{
        r.tasaAuth  = pctN(r.autorizadas, r.total)
        r.convTotal = pctN(r.facturadas, r.total)
        if(r._descN) r.descuento_prom = r.descuento_prom/r._descN
      })
    })
    return mapa
  },[datosAsesor, filtroMarca, filtroAseg, filtroMes])

  // ── Evolución mensual comparativa (con filtros) ───────────────────────────
  const evolucionMensual = useMemo(()=>{
    const datosFilt = aplicarFiltros(datosMes)
    return MESES_ORD.map((m,i)=>{
      const entry:any = {name: MESES_LABEL[i]}
      YEARS.forEach(y=>{
        const filas = datosFilt.filter((d:any)=>d.mes_subasta===m&&d.anio===y)
        entry[`Sub${y}`]  = filas.reduce((s:number,d:any)=>s+Number(d.total||0),0)
        entry[`Auth${y}`] = filas.reduce((s:number,d:any)=>s+Number(d.autorizadas||0),0)
        entry[`Fact${y}`] = filas.reduce((s:number,d:any)=>s+Number(d.facturadas||0),0)
      })
      return entry
    })
  },[datosMes, filtroMarca, filtroAseg, filtroMes])

  // ── Oportunidades (aseguradoras con caída en conversión) ─────────────────
  const oportunidades = useMemo(()=>{
    return Object.entries(asegPorAño).map(([nombre,data])=>{
      const b = data[añoBase], c = data[añoComp]
      if (!b || !c) return null
      const varConv  = variacion(b.convTotal, c.convTotal)
      const varAuth  = variacion(b.tasaAuth, c.tasaAuth)
      const varSub   = variacion(Number(b.valor_subastado), Number(c.valor_subastado))
      return { nombre, base:b, comp:c, varConv, varAuth, varSub }
    }).filter(Boolean)
      .sort((a:any,b:any) => a.varConv - b.varConv) as any[]
  },[asegPorAño, añoBase, añoComp])

  // ── Radar data para asesores ───────────────────────────────────────────────
  const radarData = useMemo(()=>{
    const asesoresLista = Object.keys(asesorPorAño)
    return [
      { metric: 'Vol. Subastas',  ...Object.fromEntries(asesoresLista.map(a=>[a, Math.round(pctN(Number(asesorPorAño[a][añoComp]?.total||0), Math.max(...asesoresLista.map(x=>Number(asesorPorAño[x][añoComp]?.total||0)))+1)*100)])) },
      { metric: 'Tasa Auth.',     ...Object.fromEntries(asesoresLista.map(a=>[a, Math.round(asesorPorAño[a][añoComp]?.tasaAuth||0)])) },
      { metric: 'Conversión',     ...Object.fromEntries(asesoresLista.map(a=>[a, Math.round((asesorPorAño[a][añoComp]?.convTotal||0)*3)])) },
      { metric: 'Val. Autorizado',...Object.fromEntries(asesoresLista.map(a=>[a, Math.round(pctN(Number(asesorPorAño[a][añoComp]?.valor_autorizado||0), Math.max(...asesoresLista.map(x=>Number(asesorPorAño[x][añoComp]?.valor_autorizado||0)))+1)*100)])) },
      { metric: 'Radicadas',      ...Object.fromEntries(asesoresLista.map(a=>[a, Math.round(pctN(Number(asesorPorAño[a][añoComp]?.radicadas||0), Math.max(...asesoresLista.map(x=>Number(asesorPorAño[x][añoComp]?.radicadas||0)))+1)*100)])) },
    ]
  },[asesorPorAño, añoComp])

  const COLORS_ASESORES = ['#4FD1C5','#68D391','#F6AD55','#FC8181','#B794F4']
  const asesoresLista = Object.keys(asesorPorAño)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
        <p className="text-brand-subtle text-sm font-mono">Cargando análisis comparativo...</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-brand-subtle uppercase tracking-wider">Subastas</span>
            <span className="text-xs text-brand-subtle">·</span>
            <span className="text-xs font-mono text-brand-teal">Análisis Comparativo</span>
          </div>
          <h1 className="text-2xl font-bold font-title text-brand-text">📈 Comparativo de Períodos</h1>
          <p className="text-sm text-brand-subtle mt-0.5">
            Evolución {añoBase} → {añoComp} · por aseguradora y asesor · identificación de oportunidades
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-brand-surface border border-brand-border rounded-lg px-3 py-2">
            <span className="text-xs font-mono text-brand-subtle">Año base:</span>
            <select value={añoBase} onChange={e=>setAñoBase(Number(e.target.value))}
              className="bg-transparent text-sm font-mono text-brand-text focus:outline-none">
              {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <span className="text-brand-subtle font-mono">vs</span>
          <div className="flex items-center gap-2 bg-brand-surface border border-brand-teal/40 rounded-lg px-3 py-2">
            <span className="text-xs font-mono text-brand-subtle">Comparar:</span>
            <select value={añoComp} onChange={e=>setAñoComp(Number(e.target.value))}
              className="bg-transparent text-sm font-mono text-brand-teal focus:outline-none">
              {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={cargar}
            className="bg-brand-teal/20 hover:bg-brand-teal/30 border border-brand-teal/40 text-brand-teal rounded-lg px-4 py-2 text-sm font-mono transition-colors">
            ↻ Actualizar
          </button>
          {ultimaAct && <span className="text-xs text-brand-subtle font-mono">Act: {ultimaAct.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</span>}
        </div>
      </div>

      {/* Filtros secundarios */}
      <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl border border-brand-border bg-brand-surface/50">
        <span className="text-xs font-mono text-brand-subtle uppercase tracking-wider">Filtros:</span>
        {/* Marca */}
        <select value={filtroMarca} onChange={e=>setFiltroMarca(e.target.value)}
          className="bg-brand-surface border border-brand-border rounded-lg px-3 py-1.5 text-xs text-brand-text font-mono focus:outline-none focus:border-brand-teal">
          {marcasUnicas.map(m=><option key={m} value={m}>{m==='Todas'?'🚗 Todas las marcas':m}</option>)}
        </select>
        {/* Aseguradora */}
        <select value={filtroAseg} onChange={e=>setFiltroAseg(e.target.value)}
          className="bg-brand-surface border border-brand-border rounded-lg px-3 py-1.5 text-xs text-brand-text font-mono focus:outline-none focus:border-brand-teal">
          {aseguadorasUnicas.map(a=><option key={a} value={a}>{a==='Todas'?'🏢 Todas las aseguradoras':a}</option>)}
        </select>
        {/* Meses - multiselect */}
        <div className="flex flex-wrap gap-1">
          {MESES_ORD.map((m,i)=>(
            <button key={m} onClick={()=>setFiltroMes(prev=>prev.includes(m)?prev.filter(x=>x!==m):[...prev,m])}
              className={`px-2 py-1 text-xs font-mono rounded-md border transition-colors ${
                filtroMes.includes(m)
                  ? 'bg-brand-teal/20 border-brand-teal/50 text-brand-teal'
                  : 'border-brand-border text-brand-subtle hover:text-brand-text'
              }`}>
              {MESES_LABEL[i]}
            </button>
          ))}
          {filtroMes.length > 0 && (
            <button onClick={()=>setFiltroMes([])}
              className="px-2 py-1 text-xs font-mono rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
              ✕ Limpiar
            </button>
          )}
        </div>
        {(filtroMarca !== 'Todas' || filtroAseg !== 'Todas') && (
          <button onClick={()=>{ setFiltroMarca('Todas'); setFiltroAseg('Todas'); setFiltroMes([]) }}
            className="text-xs font-mono text-brand-subtle hover:text-brand-text border border-brand-border rounded-lg px-3 py-1.5 transition-colors">
            ✕ Limpiar todo
          </button>
        )}
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-400 text-sm font-mono">{error}</div>}

      {/* Navegación */}
      <div className="flex gap-3">
        <a href="/dashboard/facturacion/canales/subastas"
          className="flex items-center gap-2 rounded-xl border border-brand-border bg-brand-surface px-4 py-2.5 hover:border-brand-teal/50 transition-colors text-sm font-mono text-brand-subtle hover:text-brand-text">
          ← Facturación Subastas
        </a>
        <a href="/dashboard/facturacion/canales/subasta"
          className="flex items-center gap-2 rounded-xl border border-brand-border bg-brand-surface px-4 py-2.5 hover:border-brand-teal/50 transition-colors text-sm font-mono text-brand-subtle hover:text-brand-text">
          📊 Torre de Control →
        </a>
      </div>

      {/* Resumen comparativo — 3 años */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {YEARS.map(y=>{
          const d = porAño[y]
          const tasaAuth  = pctN(d.autorizadas, d.total)
          const convTotal = pctN(d.facturadas, d.total)
          const isComp = y === añoComp
          const isBase = y === añoBase
          return (
            <Panel key={y} className={isComp?'border-brand-teal/50':isBase?'border-brand-border/80':''}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-bold font-title" style={{color:COLORES_AÑO[y]}}>{y}</span>
                {isComp && <span className="text-xs px-2 py-0.5 rounded-full bg-brand-teal/10 text-brand-teal border border-brand-teal/30 font-mono">Comparar</span>}
                {isBase && <span className="text-xs px-2 py-0.5 rounded-full bg-brand-border/30 text-brand-subtle border border-brand-border font-mono">Base</span>}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-xs font-mono text-brand-subtle">Total subastas</span><span className="text-xs font-mono text-brand-text font-semibold">{d.total.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-xs font-mono text-brand-subtle">Autorizadas</span><span className="text-xs font-mono text-green-400">{d.autorizadas.toLocaleString()} ({tasaAuth.toFixed(1)}%)</span></div>
                <div className="flex justify-between"><span className="text-xs font-mono text-brand-subtle">Facturadas</span><span className="text-xs font-mono text-brand-teal">{d.facturadas.toLocaleString()} ({convTotal.toFixed(1)}%)</span></div>
                <div className="flex justify-between"><span className="text-xs font-mono text-brand-subtle">Valor subastado</span><span className="text-xs font-mono text-brand-text">{fmtCOP(d.valSub)}</span></div>
                <div className="flex justify-between"><span className="text-xs font-mono text-brand-subtle">Valor autorizado</span><span className="text-xs font-mono text-green-400">{fmtCOP(d.valAuth)}</span></div>
              </div>
              {y === añoComp && porAño[añoBase] && (
                <div className="mt-3 pt-3 border-t border-brand-border space-y-1">
                  <p className="text-xs font-mono text-brand-subtle mb-1">vs {añoBase}:</p>
                  <div className="flex justify-between"><span className="text-xs font-mono text-brand-subtle">Volumen</span><Delta val={variacion(porAño[añoBase].total, d.total)}/></div>
                  <div className="flex justify-between"><span className="text-xs font-mono text-brand-subtle">% Auth</span><Delta val={variacion(pctN(porAño[añoBase].autorizadas,porAño[añoBase].total), tasaAuth)}/></div>
                  <div className="flex justify-between"><span className="text-xs font-mono text-brand-subtle">% Conversión</span><Delta val={variacion(pctN(porAño[añoBase].facturadas,porAño[añoBase].total), convTotal)}/></div>
                </div>
              )}
            </Panel>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-brand-border">
        {([
          {id:'resumen',       label:'📊 Evolución'},
          {id:'aseguradoras',  label:'🏢 Aseguradoras'},
          {id:'asesores',      label:'👤 Asesores'},
          {id:'tendencias',    label:'📉 Tendencias'},
          {id:'oportunidades', label:'🎯 Oportunidades'},
        ] as const).map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 -mb-px ${tab===t.id?'border-brand-teal text-brand-teal':'border-transparent text-brand-subtle hover:text-brand-text'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Evolución */}
      {tab==='resumen' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Volumen mensual comparativo</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={evolucionMensual} margin={{top:5,right:10,left:10,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                  <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:10,color:'#718096'}}/>
                  {YEARS.map(y=><Bar key={y} dataKey={`Sub${y}`} name={`Subastas ${y}`} fill={COLORES_AÑO[y]} radius={[3,3,0,0]}/>)}
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Facturadas mensual comparativo</h2>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={evolucionMensual} margin={{top:5,right:10,left:10,bottom:5}}>
                  <defs>
                    {YEARS.map(y=>(
                      <linearGradient key={y} id={`gradFact${y}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORES_AÑO[y]} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={COLORES_AÑO[y]} stopOpacity={0}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                  <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:10,color:'#718096'}}/>
                  {YEARS.map(y=>(
                    <Area key={y} type="monotone" dataKey={`Fact${y}`} name={`Fact. ${y}`}
                      stroke={COLORES_AÑO[y]} strokeWidth={2}
                      fill={`url(#gradFact${y})`}
                      dot={{fill:COLORES_AÑO[y],r:3,strokeWidth:0}}/>
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          </div>
          {/* Tabla resumen anual */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Resumen anual comparativo</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-brand-border">
                  {['Año','Total','Autorizadas','% Auth','Facturadas','% Conv','V. Subastado','V. Autorizado','% Recup.'].map(h=>(
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-6 whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {YEARS.map(y=>{
                    const d = porAño[y]
                    const prev = porAño[y-1]
                    return(
                      <tr key={y} className={`border-b border-brand-border/40 ${y===añoComp?'bg-brand-teal/5':''}`}>
                        <td className="py-3 pr-6 font-bold font-title text-sm" style={{color:COLORES_AÑO[y]}}>{y}</td>
                        <td className="py-3 pr-6 font-mono text-xs text-brand-text font-semibold">{d.total.toLocaleString()}</td>
                        <td className="py-3 pr-6 font-mono text-xs text-green-400">{d.autorizadas.toLocaleString()}</td>
                        <td className="py-3 pr-6 font-mono text-xs text-green-400">{pct(d.autorizadas,d.total)}</td>
                        <td className="py-3 pr-6 font-mono text-xs text-brand-teal">{d.facturadas.toLocaleString()}</td>
                        <td className="py-3 pr-6 font-mono text-xs text-brand-teal">{pct(d.facturadas,d.total)}</td>
                        <td className="py-3 pr-6 font-mono text-xs text-brand-subtle">{fmtCOP(d.valSub)}</td>
                        <td className="py-3 pr-6 font-mono text-xs text-green-400">{fmtCOP(d.valAuth)}</td>
                        <td className="py-3 font-mono text-xs text-brand-subtle">{pct(d.valAuth,d.valSub)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB: Aseguradoras */}
      {tab==='aseguradoras' && (
        <div className="space-y-6">
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
              Comparativo por aseguradora — {añoBase} vs {añoComp}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-brand-border">
                  <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Aseguradora</th>
                  {['Total','Auth.','%Auth','Fact.','%Conv','V.Sub.','Δ Conv'].map(h=>(
                    <th key={`${añoBase}-${h}`} className="text-right font-mono text-xs pb-3 pr-4 whitespace-nowrap" style={{color:COLORES_AÑO[añoBase]}}>{añoBase} {h}</th>
                  ))}
                  {['Total','Auth.','%Auth','Fact.','%Conv','V.Sub.','Δ Conv'].map(h=>(
                    <th key={`${añoComp}-${h}`} className="text-right font-mono text-xs pb-3 pr-4 whitespace-nowrap" style={{color:COLORES_AÑO[añoComp]}}>{añoComp} {h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {Object.entries(asegPorAño).map(([nombre,data],i)=>{
                    const b = data[añoBase], c = data[añoComp]
                    const varConv = b&&c ? variacion(pctN(Number(b.facturadas),Number(b.total)), pctN(Number(c.facturadas),Number(c.total))) : null
                    return(
                      <tr key={nombre} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                        <td className="py-2 pr-4 text-xs font-medium text-brand-text">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{background:COLORES[i%12]}}/>
                            {nombre}
                          </div>
                        </td>
                        {/* Base */}
                        <td className="py-2 pr-4 font-mono text-xs text-right text-brand-subtle">{b?.total?.toLocaleString()||'—'}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-right text-green-400">{b?Number(b.autorizadas).toLocaleString():'—'}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-right text-green-400">{b?pct(Number(b.autorizadas),Number(b.total)):'—'}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-right text-brand-teal">{b?Number(b.facturadas).toLocaleString():'—'}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-right text-brand-teal">{b?pct(Number(b.facturadas),Number(b.total)):'—'}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-right text-brand-subtle">{b?fmtCOP(Number(b.valor_subastado)):'—'}</td>
                        <td className="py-2 pr-4 text-right">{b?<Delta val={0}/>:'—'}</td>
                        {/* Comp */}
                        <td className="py-2 pr-4 font-mono text-xs text-right text-brand-subtle">{c?Number(c.total).toLocaleString():'—'}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-right text-green-400">{c?Number(c.autorizadas).toLocaleString():'—'}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-right text-green-400">{c?pct(Number(c.autorizadas),Number(c.total)):'—'}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-right text-brand-teal">{c?Number(c.facturadas).toLocaleString():'—'}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-right text-brand-teal">{c?pct(Number(c.facturadas),Number(c.total)):'—'}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-right text-brand-subtle">{c?fmtCOP(Number(c.valor_subastado)):'—'}</td>
                        <td className="py-2 pr-4 text-right">{varConv!==null?<Delta val={varConv}/>:'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB: Asesores */}
      {tab==='asesores' && (
        <div className="space-y-6">
          {/* Cards por asesor */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.entries(asesorPorAño).map(([nombre,data],i)=>{
              const b = data[añoBase], c = data[añoComp]
              return(
                <Panel key={nombre} className="border-brand-border">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full" style={{background:COLORS_ASESORES[i]}}/>
                    <h3 className="text-sm font-semibold text-brand-text">{nombre}</h3>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-brand-border pb-1">
                      <th className="text-left font-mono text-brand-subtle pb-2">Métrica</th>
                      <th className="text-right font-mono pb-2" style={{color:COLORES_AÑO[añoBase]}}>{añoBase}</th>
                      <th className="text-right font-mono pb-2" style={{color:COLORES_AÑO[añoComp]}}>{añoComp}</th>
                      <th className="text-right font-mono text-brand-subtle pb-2">Δ</th>
                    </tr></thead>
                    <tbody className="space-y-1">
                      {[
                        {label:'Subastas',  bv:Number(b?.total||0),      cv:Number(c?.total||0),      fmt:(v:number)=>v.toLocaleString()},
                        {label:'Auth.',     bv:Number(b?.autorizadas||0), cv:Number(c?.autorizadas||0), fmt:(v:number)=>v.toLocaleString()},
                        {label:'% Auth',    bv:b?.tasaAuth||0,            cv:c?.tasaAuth||0,            fmt:(v:number)=>`${v.toFixed(1)}%`},
                        {label:'Facturadas',bv:Number(b?.facturadas||0),  cv:Number(c?.facturadas||0),  fmt:(v:number)=>v.toLocaleString()},
                        {label:'% Conv',    bv:b?.convTotal||0,           cv:c?.convTotal||0,           fmt:(v:number)=>`${v.toFixed(1)}%`},
                        {label:'V.Auth.',   bv:Number(b?.valor_autorizado||0),cv:Number(c?.valor_autorizado||0),fmt:fmtCOP},
                      ].map(row=>(
                        <tr key={row.label} className="border-b border-brand-border/20">
                          <td className="py-1.5 font-mono text-brand-subtle">{row.label}</td>
                          <td className="py-1.5 text-right font-mono" style={{color:COLORES_AÑO[añoBase]}}>{row.fmt(row.bv)}</td>
                          <td className="py-1.5 text-right font-mono" style={{color:COLORES_AÑO[añoComp]}}>{row.fmt(row.cv)}</td>
                          <td className="py-1.5 text-right"><Delta val={variacion(row.bv,row.cv)}/></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              )
            })}
          </div>

          {/* Radar chart */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Perfil de efectividad por asesor — {añoComp}</h2>
            <ResponsiveContainer width="100%" height={360}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#2D3748"/>
                <PolarAngleAxis dataKey="metric" tick={{fill:'#718096',fontSize:11}}/>
                <PolarRadiusAxis tick={{fill:'#718096',fontSize:9}} domain={[0,100]}/>
                {asesoresLista.map((a,i)=>(
                  <Radar key={a} name={a} dataKey={a} stroke={COLORS_ASESORES[i]} fill={COLORS_ASESORES[i]} fillOpacity={0.1}/>
                ))}
                <Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                <Tooltip/>
              </RadarChart>
            </ResponsiveContainer>
          </Panel>

          {/* Tabla detallada */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Comparativo detallado por asesor</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-brand-border">
                  <th className="text-left font-mono text-xs text-brand-subtle uppercase pb-3 pr-4">Asesor</th>
                  <th className="text-right font-mono text-xs pb-3 pr-4" style={{color:COLORES_AÑO[añoBase]}}>Sub {añoBase}</th>
                  <th className="text-right font-mono text-xs pb-3 pr-4" style={{color:COLORES_AÑO[añoComp]}}>Sub {añoComp}</th>
                  <th className="text-right font-mono text-xs pb-3 pr-4 text-brand-subtle">Δ Vol</th>
                  <th className="text-right font-mono text-xs pb-3 pr-4" style={{color:COLORES_AÑO[añoBase]}}>%Auth {añoBase}</th>
                  <th className="text-right font-mono text-xs pb-3 pr-4" style={{color:COLORES_AÑO[añoComp]}}>%Auth {añoComp}</th>
                  <th className="text-right font-mono text-xs pb-3 pr-4 text-brand-subtle">Δ Auth</th>
                  <th className="text-right font-mono text-xs pb-3 pr-4" style={{color:COLORES_AÑO[añoBase]}}>%Conv {añoBase}</th>
                  <th className="text-right font-mono text-xs pb-3 pr-4" style={{color:COLORES_AÑO[añoComp]}}>%Conv {añoComp}</th>
                  <th className="text-right font-mono text-xs pb-3 text-brand-subtle">Δ Conv</th>
                </tr></thead>
                <tbody>
                  {Object.entries(asesorPorAño).map(([nombre,data],i)=>{
                    const b = data[añoBase], c = data[añoComp]
                    return(
                      <tr key={nombre} className="border-b border-brand-border/40 hover:bg-brand-surface/50">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{background:COLORS_ASESORES[i]}}/>
                            <span className="text-xs font-medium text-brand-text">{nombre}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right font-mono text-xs" style={{color:COLORES_AÑO[añoBase]}}>{b?Number(b.total).toLocaleString():'—'}</td>
                        <td className="py-3 pr-4 text-right font-mono text-xs" style={{color:COLORES_AÑO[añoComp]}}>{c?Number(c.total).toLocaleString():'—'}</td>
                        <td className="py-3 pr-4 text-right">{b&&c?<Delta val={variacion(Number(b.total),Number(c.total))}/>:'—'}</td>
                        <td className="py-3 pr-4 text-right font-mono text-xs text-green-400">{b?`${(b.tasaAuth||0).toFixed(1)}%`:'—'}</td>
                        <td className="py-3 pr-4 text-right font-mono text-xs text-green-400">{c?`${(c.tasaAuth||0).toFixed(1)}%`:'—'}</td>
                        <td className="py-3 pr-4 text-right">{b&&c?<Delta val={variacion(b.tasaAuth||0,c.tasaAuth||0)}/>:'—'}</td>
                        <td className="py-3 pr-4 text-right font-mono text-xs text-brand-teal">{b?`${(b.convTotal||0).toFixed(1)}%`:'—'}</td>
                        <td className="py-3 pr-4 text-right font-mono text-xs text-brand-teal">{c?`${(c.convTotal||0).toFixed(1)}%`:'—'}</td>
                        <td className="py-3 text-right">{b&&c?<Delta val={variacion(b.convTotal||0,c.convTotal||0)}/>:'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB: Tendencias */}
      {tab==='tendencias' && (
        <div className="space-y-6">
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Tasa de autorización por aseguradora — evolución {añoBase} → {añoComp}</h2>
            <ResponsiveContainer width="100%" height={Math.max(250,Object.keys(asegPorAño).length*30)}>
              <BarChart
                data={Object.entries(asegPorAño).map(([nombre,data])=>({
                  nombre: nombre.length>12?nombre.slice(0,12)+'…':nombre,
                  [añoBase]: Number(data[añoBase]?.tasaAuth||0).toFixed(1),
                  [añoComp]: Number(data[añoComp]?.tasaAuth||0).toFixed(1),
                }))}
                layout="vertical" margin={{top:5,right:50,left:100,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" horizontal={false}/>
                <XAxis type="number" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`}/>
                <YAxis type="category" dataKey="nombre" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={95}/>
                <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                <Bar dataKey={añoBase} fill={COLORES_AÑO[añoBase]} radius={[0,4,4,0]}/>
                <Bar dataKey={añoComp} fill={COLORES_AÑO[añoComp]} radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Conversión (subasta → factura) por aseguradora</h2>
            <ResponsiveContainer width="100%" height={Math.max(250,Object.keys(asegPorAño).length*30)}>
              <BarChart
                data={Object.entries(asegPorAño).map(([nombre,data])=>({
                  nombre: nombre.length>12?nombre.slice(0,12)+'…':nombre,
                  [añoBase]: Number(data[añoBase]?.convTotal||0).toFixed(1),
                  [añoComp]: Number(data[añoComp]?.convTotal||0).toFixed(1),
                }))}
                layout="vertical" margin={{top:5,right:50,left:100,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" horizontal={false}/>
                <XAxis type="number" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`}/>
                <YAxis type="category" dataKey="nombre" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={95}/>
                <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                <Bar dataKey={añoBase} fill={COLORES_AÑO[añoBase]} radius={[0,4,4,0]}/>
                <Bar dataKey={añoComp} fill={COLORES_AÑO[añoComp]} radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* TAB: Oportunidades */}
      {tab==='oportunidades' && (
        <div className="space-y-6">
          {/* Insights clave */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Panel className="border-red-500/30 bg-red-500/5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-red-400 mb-3">⚠ Mayor caída en conversión</h3>
              {oportunidades.slice(0,3).map((o:any)=>(
                <div key={o.nombre} className="flex justify-between items-center py-2 border-b border-red-500/10">
                  <span className="text-xs text-brand-text font-medium truncate max-w-[130px]">{o.nombre}</span>
                  <Delta val={o.varConv}/>
                </div>
              ))}
              <p className="text-xs font-mono text-red-400/70 mt-3">Requieren atención inmediata</p>
            </Panel>
            <Panel className="border-green-500/30 bg-green-500/5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-green-400 mb-3">✅ Mayor mejora en conversión</h3>
              {[...oportunidades].sort((a:any,b:any)=>b.varConv-a.varConv).slice(0,3).map((o:any)=>(
                <div key={o.nombre} className="flex justify-between items-center py-2 border-b border-green-500/10">
                  <span className="text-xs text-brand-text font-medium truncate max-w-[130px]">{o.nombre}</span>
                  <Delta val={o.varConv}/>
                </div>
              ))}
              <p className="text-xs font-mono text-green-400/70 mt-3">Replicar estrategia</p>
            </Panel>
            <Panel className="border-yellow-500/30 bg-yellow-500/5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-yellow-400 mb-3">📈 Mayor volumen en {añoComp}</h3>
              {Object.entries(asegPorAño)
                .map(([n,d])=>({nombre:n,total:Number(d[añoComp]?.total||0)}))
                .sort((a,b)=>b.total-a.total).slice(0,3).map(o=>(
                <div key={o.nombre} className="flex justify-between items-center py-2 border-b border-yellow-500/10">
                  <span className="text-xs text-brand-text font-medium truncate max-w-[130px]">{o.nombre}</span>
                  <span className="text-xs font-mono text-yellow-400">{o.total.toLocaleString()} sub.</span>
                </div>
              ))}
              <p className="text-xs font-mono text-yellow-400/70 mt-3">Mayor potencial de facturación</p>
            </Panel>
          </div>

          {/* Tabla completa de oportunidades */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
              Análisis de oportunidades — {añoBase} vs {añoComp} — ordenado por caída en conversión
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-brand-border">
                  {['Aseguradora',`Sub ${añoBase}`,`Sub ${añoComp}`,'Δ Vol',`%Auth ${añoBase}`,`%Auth ${añoComp}`,'Δ Auth',`%Conv ${añoBase}`,`%Conv ${añoComp}`,'Δ Conv','Potencial'].map(h=>(
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {oportunidades.map((o:any)=>{
                    const potencial = Number(o.comp?.autorizadas||0) - Number(o.comp?.facturadas||0)
                    return(
                      <tr key={o.nombre} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                        <td className="py-3 pr-4 text-xs font-medium text-brand-text">{o.nombre}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{Number(o.base?.total||0).toLocaleString()}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{Number(o.comp?.total||0).toLocaleString()}</td>
                        <td className="py-3 pr-4"><Delta val={o.varSub}/></td>
                        <td className="py-3 pr-4 font-mono text-xs text-green-400">{o.base?`${(o.base.tasaAuth||0).toFixed(1)}%`:'—'}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-green-400">{o.comp?`${(o.comp.tasaAuth||0).toFixed(1)}%`:'—'}</td>
                        <td className="py-3 pr-4"><Delta val={o.varAuth}/></td>
                        <td className="py-3 pr-4 font-mono text-xs text-brand-teal">{o.base?`${(o.base.convTotal||0).toFixed(1)}%`:'—'}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-brand-teal">{o.comp?`${(o.comp.convTotal||0).toFixed(1)}%`:'—'}</td>
                        <td className="py-3 pr-4"><Delta val={o.varConv}/></td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${potencial > 50 ? 'bg-red-400' : potencial > 20 ? 'bg-yellow-400' : 'bg-green-400'}`}/>
                            <span className="font-mono text-xs text-brand-subtle">{potencial} auth. sin facturar</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Datos desde Supabase · 2024-2026 · {Object.values(porAño).reduce((s,d)=>s+d.total,0).toLocaleString()} registros totales
      </p>
    </div>
  )
}
