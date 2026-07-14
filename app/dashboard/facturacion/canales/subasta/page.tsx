'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface DatoMes {
  anio: number; mes_subasta: string; total: number; subastadas: number
  auth_completa: number; auth_parcial: number; no_autorizadas: number; pend_auth: number
  en_pedido: number; facturadas: number; radicadas: number
  valor_subastado: number; valor_autorizado: number; descuento_prom: number
}
interface DatoAseg {
  anio: number; mes_subasta: string; aseguradora_id: number; aseguradora: string
  total: number; subastadas: number; autorizadas: number; no_autorizadas: number
  facturadas: number; radicadas: number; valor_subastado: number; valor_autorizado: number
}
interface DatoAsesor {
  anio: number; mes_subasta: string; asesor_id: number; asesor: string
  total: number; subastadas: number; autorizadas: number; no_autorizadas: number
  facturadas: number; radicadas: number; valor_subastado: number; valor_autorizado: number
  descuento_prom: number
}
interface Pipeline {
  anio: number; total: number; pend_auth: number; en_pedido: number
  por_facturar: number; por_radicar: number; completadas: number
}
interface Aseguradora { id: number; nombre_corto: string }
interface Asesor { id: number; nombre: string }
interface DetalleSubasta {
  id: number; placa: string; marca: string; aseguradora_id: number; asesor_id: number
  estado_subasta: string; fecha_subasta: string; valor_subastado: number
  estado_autorizacion: string; valor_autorizado: number
  estado_facturacion_oc: string; fecha_factura: string; numero_factura: string
  estado_radicacion_factura: string; mes_subasta: string
}

// ── Constantes ────────────────────────────────────────────────────────────────
const MESES_ORD   = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const MESES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const YEARS = [2024, 2025, 2026]
const COLORES = ['#4FD1C5','#68D391','#F6AD55','#FC8181','#B794F4','#63B3ED','#F687B3','#FBD38D','#9AE6B4','#90CDF4','#FEB2B2','#E9D8FD']

const fmtCOP = (v: number) => {
  if (!v && v !== 0) return '—'
  const abs = Math.abs(v), sign = v < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}$${(abs/1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(1)}M`
  return `${sign}$${abs.toLocaleString('es-CO',{maximumFractionDigits:0})}`
}
const fmtPct = (v: number) => `${(v*100).toFixed(1)}%`

function Panel({children,className=''}:{children:React.ReactNode;className?:string}){
  return <div className={`rounded-xl border border-brand-border bg-brand-surface p-5 ${className}`}>{children}</div>
}
function KpiCard({label,value,sub,sub2,accent='text-brand-teal'}:{label:string;value:string;sub?:string;sub2?:string;accent?:string}){
  return(<Panel><p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">{label}</p><p className={`text-xl font-bold font-title ${accent}`}>{value}</p>{sub&&<p className="text-xs text-brand-subtle mt-1">{sub}</p>}{sub2&&<p className="text-xs text-brand-subtle mt-0.5">{sub2}</p>}</Panel>)
}
function Badge({estado}:{estado:string}){
  const cfg:Record<string,string>={
    'Autorizada Completa':'bg-green-500/10 text-green-400 border-green-500/30',
    'Autorizada parcial':'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    'NO Autorizada':'bg-red-500/10 text-red-400 border-red-500/30',
    'Facturado':'bg-teal-500/10 text-teal-400 border-teal-500/30',
    'Radicada':'bg-blue-500/10 text-blue-400 border-blue-500/30',
  }
  return <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${cfg[estado]||'bg-gray-500/10 text-gray-400 border-gray-500/30'}`}>{estado||'—'}</span>
}
const TT=({active,payload,label}:any)=>{
  if(!active||!payload?.length)return null
  return(<div className="bg-brand-surface border border-brand-border rounded-lg p-3 shadow-xl min-w-[150px]"><p className="text-xs font-mono text-brand-subtle mb-2">{label}</p>{payload.map((p:any,i:number)=>(<p key={i} className="text-xs font-mono" style={{color:p.color}}>{p.name}: {p.value>1000?fmtCOP(p.value):typeof p.value==='number'?p.value.toFixed(1):p.value}</p>))}</div>)
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function TorreControlSubastasPage() {
  const [anio,        setAnio]        = useState(2026)
  const [filtroMes,   setFiltroMes]   = useState('todos')
  const [filtroAseg,  setFiltroAseg]  = useState(0)
  const [filtroAsesor,setFiltroAsesor]= useState(0)
  const [tab,         setTab]         = useState<'resumen'|'aseguradoras'|'asesores'|'pipeline'|'detalle'>('resumen')
  const [buscar,      setBuscar]      = useState('')
  const [detallePag,  setDetallePag]  = useState(0)

  const [datosMes,    setDatosMes]    = useState<DatoMes[]>([])
  const [datosAseg,   setDatosAseg]   = useState<DatoAseg[]>([])
  const [datosAsesor, setDatosAsesor] = useState<DatoAsesor[]>([])
  const [pipeline,    setPipeline]    = useState<Pipeline|null>(null)
  const [detalle,     setDetalle]     = useState<DetalleSubasta[]>([])
  const [aseguradoras,setAseguradoras]= useState<Aseguradora[]>([])
  const [asesores,    setAsesores]    = useState<Asesor[]>([])
  const [loading,     setLoading]     = useState(true)
  const [loadingDet,  setLoadingDet]  = useState(false)
  const [error,       setError]       = useState('')
  const [ultimaAct,   setUltimaAct]   = useState<Date|null>(null)
  const [totalDet,    setTotalDet]    = useState(0)

  // ── Carga principal desde vistas agregadas ────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [{data:dMes},{data:dAseg},{data:dAs},{data:dPip},{data:dCatAseg},{data:dCatAs}] = await Promise.all([
        supabase.from('v_subastas_por_mes').select('*').eq('anio', anio),
        supabase.from('v_subastas_por_aseguradora').select('*').eq('anio', anio),
        supabase.from('v_subastas_por_asesor').select('*').eq('anio', anio),
        supabase.from('v_subastas_pipeline').select('*').eq('anio', anio).single(),
        supabase.from('aseguradoras').select('id, nombre_corto'),
        supabase.from('asesores').select('id, nombre'),
      ])
      setDatosMes((dMes??[]) as DatoMes[])
      setDatosAseg((dAseg??[]) as DatoAseg[])
      setDatosAsesor((dAs??[]) as DatoAsesor[])
      setPipeline(dPip as Pipeline)
      setAseguradoras((dCatAseg??[]) as Aseguradora[])
      setAsesores((dCatAs??[]) as Asesor[])
      setUltimaAct(new Date())
    } catch(e:any){setError(`Error: ${e?.message}`)}
    setLoading(false)
  },[anio])

  useEffect(()=>{cargar()},[cargar])

  // ── Carga paginada del detalle (solo cuando está en tab Detalle) ───────────
  const cargarDetalle = useCallback(async () => {
    setLoadingDet(true)
    const POR_PAG = 200
    let q = supabase.from('subastas').select('id,placa,marca,aseguradora_id,asesor_id,estado_subasta,fecha_subasta,valor_subastado,estado_autorizacion,valor_autorizado,estado_facturacion_oc,fecha_factura,numero_factura,estado_radicacion_factura,mes_subasta', {count:'exact'})
      .eq('anio', anio)
      .order('fecha_subasta', {ascending: false})
      .range(detallePag * POR_PAG, (detallePag + 1) * POR_PAG - 1)
    if (filtroMes !== 'todos') q = q.eq('mes_subasta', filtroMes)
    if (filtroAseg) q = q.eq('aseguradora_id', filtroAseg)
    if (filtroAsesor) q = q.eq('asesor_id', filtroAsesor)
    const {data, count} = await q
    setDetalle((data??[]) as DetalleSubasta[])
    setTotalDet(count??0)
    setLoadingDet(false)
  },[anio, filtroMes, filtroAseg, filtroAsesor, detallePag])

  useEffect(()=>{if(tab==='detalle')cargarDetalle()},[tab, cargarDetalle])

  const nombreAseg  = (id:number) => aseguradoras.find(a=>a.id===id)?.nombre_corto||`Aseg ${id}`
  const nombreAsesor= (id:number) => asesores.find(a=>a.id===id)?.nombre||`Asesor ${id}`

  // ── Filtrado de vistas agregadas ──────────────────────────────────────────
  const mesFiltro = (d:any) => filtroMes==='todos'||d.mes_subasta===filtroMes
  const asegFiltro= (d:any) => !filtroAseg||d.aseguradora_id===filtroAseg
  const asrFiltro = (d:any) => !filtroAsesor||d.asesor_id===filtroAsesor

  // ── KPIs totales desde vistas ─────────────────────────────────────────────
  const kpi = useMemo(()=>{
    const base = datosMes.filter(mesFiltro)
    const sum  = (k:keyof DatoMes)=>base.reduce((s,d)=>s+Number(d[k]||0),0)
    const total        = sum('total')
    const subastadas   = sum('subastadas')
    const autorizadas  = sum('auth_completa')+sum('auth_parcial')
    const no_auth      = sum('no_autorizadas')
    const facturadas   = sum('facturadas')
    const radicadas    = sum('radicadas')
    const valSub       = sum('valor_subastado')
    const valAuth      = sum('valor_autorizado')
    const descProm     = base.reduce((s,d)=>s+Number(d.descuento_prom||0),0)/(base.length||1)
    return {
      total, subastadas, autorizadas, no_auth, facturadas, radicadas,
      valSub, valAuth, descProm,
      tasaAuth:  subastadas>0?autorizadas/subastadas:0,
      tasaFact:  autorizadas>0?facturadas/autorizadas:0,
      convTotal: subastadas>0?facturadas/subastadas:0,
    }
  },[datosMes, filtroMes])

  // ── Evolución mensual ─────────────────────────────────────────────────────
  const evolucion = useMemo(()=>{
    return MESES_ORD.map((m,i)=>{
      const rows = datosMes.filter(d=>d.mes_subasta===m&&asegFiltro(d as any)&&asrFiltro(d as any))
      if(!rows.length)return null
      const sum=(k:keyof DatoMes)=>rows.reduce((s,d)=>s+Number(d[k]||0),0)
      const sub=sum('subastadas'), auth=sum('auth_completa')+sum('auth_parcial'), fact=sum('facturadas')
      return {
        name:MESES_LABEL[i], Subastadas:sub, Autorizadas:auth, Facturadas:fact,
        TasaAuth:sub>0?(auth/sub)*100:0,
        ValSubastado:sum('valor_subastado'), ValAutorizado:sum('valor_autorizado'),
      }
    }).filter(Boolean) as any[]
  },[datosMes, filtroAseg, filtroAsesor])

  // ── Por aseguradora agrupado ──────────────────────────────────────────────
  const porAseg = useMemo(()=>{
    const mapa:Record<number,any>={}
    datosAseg.filter(mesFiltro).filter(asrFiltro).forEach(d=>{
      if(!mapa[d.aseguradora_id])mapa[d.aseguradora_id]={id:d.aseguradora_id,nombre:d.aseguradora||nombreAseg(d.aseguradora_id),total:0,autorizadas:0,no_auth:0,facturadas:0,radicadas:0,valSub:0,valAuth:0}
      const r=mapa[d.aseguradora_id]
      r.total+=Number(d.total||0);r.autorizadas+=Number(d.autorizadas||0);r.no_auth+=Number(d.no_autorizadas||0)
      r.facturadas+=Number(d.facturadas||0);r.radicadas+=Number(d.radicadas||0)
      r.valSub+=Number(d.valor_subastado||0);r.valAuth+=Number(d.valor_autorizado||0)
    })
    return Object.values(mapa).map(r=>({...r,
      tasaAuth:r.total?r.autorizadas/r.total:0,
      convTotal:r.total?r.facturadas/r.total:0,
    })).sort((a:any,b:any)=>b.total-a.total)
  },[datosAseg, filtroMes, filtroAsesor, aseguradoras])

  // ── Por asesor agrupado ───────────────────────────────────────────────────
  const porAsesor = useMemo(()=>{
    const mapa:Record<number,any>={}
    datosAsesor.filter(mesFiltro).filter(asegFiltro).forEach(d=>{
      if(!mapa[d.asesor_id])mapa[d.asesor_id]={id:d.asesor_id,nombre:d.asesor||nombreAsesor(d.asesor_id),total:0,autorizadas:0,no_auth:0,facturadas:0,radicadas:0,valSub:0,valAuth:0,descSum:0,descN:0}
      const r=mapa[d.asesor_id]
      r.total+=Number(d.total||0);r.autorizadas+=Number(d.autorizadas||0);r.no_auth+=Number(d.no_autorizadas||0)
      r.facturadas+=Number(d.facturadas||0);r.radicadas+=Number(d.radicadas||0)
      r.valSub+=Number(d.valor_subastado||0);r.valAuth+=Number(d.valor_autorizado||0)
      if(d.descuento_prom){r.descSum+=d.descuento_prom;r.descN++}
    })
    return Object.values(mapa).map(r=>({...r,
      tasaAuth:r.total?r.autorizadas/r.total:0,
      convTotal:r.total?r.facturadas/r.total:0,
      descProm:r.descN?r.descSum/r.descN:0,
      pctPart:kpi.total?r.total/kpi.total:0,
    })).sort((a:any,b:any)=>b.total-a.total)
  },[datosAsesor, filtroMes, filtroAseg, kpi.total, asesores])

  // ── Pie data ──────────────────────────────────────────────────────────────
  const pieData = [
    {name:'Auth. Completa',value:datosMes.filter(mesFiltro).reduce((s,d)=>s+Number(d.auth_completa||0),0),color:'#68D391'},
    {name:'Auth. Parcial', value:datosMes.filter(mesFiltro).reduce((s,d)=>s+Number(d.auth_parcial||0),0),color:'#F6AD55'},
    {name:'NO Autorizada', value:datosMes.filter(mesFiltro).reduce((s,d)=>s+Number(d.no_autorizadas||0),0),color:'#FC8181'},
    {name:'Pendiente',     value:datosMes.filter(mesFiltro).reduce((s,d)=>s+Number(d.pend_auth||0),0),color:'#63B3ED'},
  ].filter(d=>d.value>0)

  if(loading)return(<div className="min-h-screen flex items-center justify-center"><div className="text-center"><div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3"/><p className="text-brand-subtle text-sm font-mono">Cargando torre de control...</p></div></div>)

  return(
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-brand-subtle uppercase tracking-wider">Torre de Control</span>
            <span className="text-xs text-brand-subtle">·</span>
            <span className="text-xs font-mono text-brand-teal">Subastas {anio}</span>
          </div>
          <h1 className="text-2xl font-bold font-title text-brand-text">📊 Seguimiento de Subastas</h1>
          <p className="text-sm text-brand-subtle mt-0.5">
            {kpi.total.toLocaleString()} registros · conversión {fmtPct(kpi.convTotal)} · {fmtCOP(kpi.valSub)} subastado
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
          <button onClick={cargar} className="bg-brand-teal/20 hover:bg-brand-teal/30 border border-brand-teal/40 text-brand-teal rounded-lg px-4 py-2 text-sm font-mono transition-colors">↻ Actualizar</button>
          {ultimaAct&&<span className="text-xs text-brand-subtle font-mono">Act: {ultimaAct.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</span>}
        </div>
      </div>

      {error&&<div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-400 text-sm font-mono">{error}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total subastas" value={kpi.total.toLocaleString()} sub={`${kpi.subastadas.toLocaleString()} subastadas`} accent="text-brand-teal"/>
        <KpiCard label="Tasa autorización" value={fmtPct(kpi.tasaAuth)} sub={`${kpi.autorizadas.toLocaleString()} autorizadas`} sub2={`${kpi.no_auth.toLocaleString()} no autorizadas`} accent={kpi.tasaAuth>0.2?'text-green-400':'text-yellow-400'}/>
        <KpiCard label="Tasa facturación" value={fmtPct(kpi.tasaFact)} sub={`${kpi.facturadas.toLocaleString()} facturadas`} sub2={`${kpi.radicadas.toLocaleString()} radicadas`} accent="text-brand-teal"/>
        <KpiCard label="Conversión total" value={fmtPct(kpi.convTotal)} sub="Subasta → Factura" sub2={`Desc. prom: ${kpi.descProm.toFixed(1)}%`} accent={kpi.convTotal>0.1?'text-green-400':'text-yellow-400'}/>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Valor subastado" value={fmtCOP(kpi.valSub)} accent="text-brand-teal"/>
        <KpiCard label="Valor autorizado" value={fmtCOP(kpi.valAuth)} sub={`${kpi.valSub>0?((kpi.valAuth/kpi.valSub)*100).toFixed(1):0}% del subastado`} accent="text-green-400"/>
        <KpiCard label="Por facturar" value={(pipeline?.por_facturar||0).toLocaleString()} sub="Autorizadas sin factura" accent="text-yellow-400"/>
        <KpiCard label="Por radicar" value={(pipeline?.por_radicar||0).toLocaleString()} sub="Facturadas sin radicar" accent="text-yellow-400"/>
      </div>

      {/* Pipeline */}
      <Panel>
        <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-5">Pipeline de conversión {anio}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {[
            {label:'Subastadas',  value:pipeline?.total||0,          color:'#4FD1C5'},
            {label:'Autorizadas', value:kpi.autorizadas,             color:'#68D391'},
            {label:'En pedido',   value:pipeline?.en_pedido||0,      color:'#F6AD55'},
            {label:'Facturadas',  value:kpi.facturadas,              color:'#63B3ED'},
            {label:'Radicadas',   value:kpi.radicadas,               color:'#B794F4'},
          ].map((step,i,arr)=>(
            <div key={step.label} className="flex items-center gap-2">
              <div className="text-center">
                <div className="rounded-lg border p-3 min-w-[100px]" style={{borderColor:`${step.color}40`,background:`${step.color}10`}}>
                  <p className="text-xl font-bold font-title" style={{color:step.color}}>{step.value.toLocaleString()}</p>
                  <p className="text-xs font-mono text-brand-subtle mt-0.5">{step.label}</p>
                  {i>0&&arr[i-1].value>0&&<p className="text-xs font-mono mt-1" style={{color:step.color}}>{((step.value/arr[i-1].value)*100).toFixed(0)}%</p>}
                </div>
              </div>
              {i<arr.length-1&&<span className="text-brand-subtle font-mono text-lg">→</span>}
            </div>
          ))}
        </div>
      </Panel>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-brand-border">
        {([{id:'resumen',label:'📈 Evolución'},{id:'aseguradoras',label:'🏢 Aseguradoras'},{id:'asesores',label:'👤 Asesores'},{id:'pipeline',label:'🔄 Pipeline'},{id:'detalle',label:'📋 Detalle'}] as const).map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 -mb-px ${tab===t.id?'border-brand-teal text-brand-teal':'border-transparent text-brand-subtle hover:text-brand-text'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Evolución */}
      {tab==='resumen'&&(
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Volumen mensual {anio}</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={evolucion} margin={{top:5,right:10,left:10,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:'#718096',fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                  <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                  <Bar dataKey="Subastadas" fill="#2D3748" radius={[4,4,0,0]}/>
                  <Bar dataKey="Autorizadas" fill="#68D391" radius={[4,4,0,0]}/>
                  <Bar dataKey="Facturadas" fill="#4FD1C5" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Tasa de autorización mensual (%)</h2>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={evolucion} margin={{top:5,right:10,left:10,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:'#718096',fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={40} tickFormatter={v=>`${v.toFixed(0)}%`}/>
                  <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                  <Line type="monotone" dataKey="TasaAuth" name="% Auth" stroke="#68D391" strokeWidth={2} dot={{fill:'#68D391',r:4}}/>
                </LineChart>
              </ResponsiveContainer>
            </Panel>
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Distribución por estado de autorización</h2>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
                    {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                  </Pie><Tooltip formatter={(v:any)=>[`${v} subastas`,'']}/></PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {pieData.map(d=>(<div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{background:d.color}}/><span className="text-xs font-mono text-brand-subtle">{d.name}</span></div>
                    <span className="text-xs font-mono text-brand-text">{d.value.toLocaleString()} <span className="text-brand-subtle">({kpi.total>0?((d.value/kpi.total)*100).toFixed(1):0}%)</span></span>
                  </div>))}
                </div>
              </div>
            </Panel>
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Valor subastado vs autorizado por mes</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={evolucion} margin={{top:5,right:10,left:10,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:'#718096',fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={70} tickFormatter={v=>fmtCOP(v)}/>
                  <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                  <Bar dataKey="ValSubastado" name="Subastado" fill="#2D3748" radius={[4,4,0,0]}/>
                  <Bar dataKey="ValAutorizado" name="Autorizado" fill="#68D391" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        </div>
      )}

      {/* TAB: Aseguradoras */}
      {tab==='aseguradoras'&&(
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {porAseg.slice(0,4).map((a:any,i:number)=>(
              <button key={a.id} onClick={()=>setFiltroAseg(filtroAseg===a.id?0:a.id)}
                className={`rounded-xl border p-4 text-left transition-all ${filtroAseg===a.id?'border-brand-teal bg-brand-teal/10':'border-brand-border bg-brand-surface hover:border-brand-teal/50'}`}>
                <div className="flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full" style={{background:COLORES[i]}}/><p className="text-xs font-semibold text-brand-text truncate">{a.nombre}</p></div>
                <p className="text-xl font-bold font-title" style={{color:COLORES[i]}}>{a.total}</p>
                <div className="mt-2 space-y-0.5">
                  <p className="text-xs font-mono text-green-400">Auth: {fmtPct(a.tasaAuth)}</p>
                  <p className="text-xs font-mono text-blue-400">Conv: {fmtPct(a.convTotal)}</p>
                </div>
              </button>
            ))}
          </div>
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Análisis por aseguradora</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-brand-border">{['Aseguradora','Total','Auth.','No Auth.','% Auth','Fact.','% Conv','V.Subastado','V.Autorizado'].map(h=>(<th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>))}</tr></thead>
                <tbody>
                  {porAseg.map((a:any,i:number)=>(
                    <tr key={a.id} className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors cursor-pointer ${filtroAseg===a.id?'bg-brand-teal/5 border-l-2 border-l-brand-teal':''}`}
                      onClick={()=>setFiltroAseg(filtroAseg===a.id?0:a.id)}>
                      <td className="py-3 pr-4"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full shrink-0" style={{background:COLORES[i%12]}}/><span className="text-xs font-medium text-brand-text">{a.nombre}</span></div></td>
                      <td className="py-3 pr-4 font-mono text-xs font-semibold text-brand-text">{a.total}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-green-400">{a.autorizadas}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-red-400">{a.no_auth}</td>
                      <td className="py-3 pr-4"><div className="flex items-center gap-2"><div className="w-12 h-1.5 bg-brand-border rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${Math.min(100,a.tasaAuth*100)}%`,background:'#68D391'}}/></div><span className="font-mono text-xs text-green-400">{fmtPct(a.tasaAuth)}</span></div></td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-teal">{a.facturadas}</td>
                      <td className="py-3 pr-4 font-mono text-xs" style={{color:a.convTotal>0.1?'#68D391':'#FC8181'}}>{fmtPct(a.convTotal)}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(a.valSub)}</td>
                      <td className="py-3 font-mono text-xs text-brand-subtle">{fmtCOP(a.valAuth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Participación por aseguradora</h2>
            <ResponsiveContainer width="100%" height={Math.max(200,porAseg.length*35)}>
              <BarChart data={porAseg} layout="vertical" margin={{top:5,right:30,left:90,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" horizontal={false}/>
                <XAxis type="number" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="nombre" tick={{fill:'#718096',fontSize:11}} axisLine={false} tickLine={false} width={85}/>
                <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                <Bar dataKey="total" name="Total" fill="#2D3748" radius={[0,4,4,0]}/>
                <Bar dataKey="autorizadas" name="Autorizadas" fill="#68D391" radius={[0,4,4,0]}/>
                <Bar dataKey="facturadas" name="Facturadas" fill="#4FD1C5" radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* TAB: Asesores */}
      {tab==='asesores'&&(
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {porAsesor.map((a:any)=>(
              <button key={a.id} onClick={()=>setFiltroAsesor(filtroAsesor===a.id?0:a.id)}
                className={`rounded-xl border p-4 text-left transition-all ${filtroAsesor===a.id?'border-brand-teal bg-brand-teal/10':'border-brand-border bg-brand-surface hover:border-brand-teal/50'}`}>
                <p className="text-xs font-semibold text-brand-text mb-2 truncate">{a.nombre}</p>
                <p className="text-xl font-bold font-title text-brand-teal">{a.total}</p>
                <p className="text-xs font-mono text-brand-subtle">{((a.pctPart||0)*100).toFixed(1)}% participación</p>
                <div className="mt-2 space-y-0.5">
                  <p className="text-xs font-mono text-green-400">Auth: {fmtPct(a.tasaAuth)}</p>
                  <p className="text-xs font-mono text-blue-400">Conv: {fmtPct(a.convTotal)}</p>
                  <p className="text-xs font-mono text-yellow-400">Desc: {(a.descProm||0).toFixed(1)}%</p>
                </div>
              </button>
            ))}
          </div>
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Comparativo por asesor</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-brand-border">{['Asesor','Total','% Part.','Auth.','No Auth.','% Auth','Fact.','Rad.','% Conv','V.Subastado','Desc.Prom'].map(h=>(<th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>))}</tr></thead>
                <tbody>
                  {porAsesor.map((a:any)=>(
                    <tr key={a.id} className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors cursor-pointer ${filtroAsesor===a.id?'bg-brand-teal/5 border-l-2 border-l-brand-teal':''}`}
                      onClick={()=>setFiltroAsesor(filtroAsesor===a.id?0:a.id)}>
                      <td className="py-3 pr-4 text-brand-text text-xs font-medium">{a.nombre}</td>
                      <td className="py-3 pr-4 font-mono text-xs font-semibold text-brand-text">{a.total}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{((a.pctPart||0)*100).toFixed(1)}%</td>
                      <td className="py-3 pr-4 font-mono text-xs text-green-400">{a.autorizadas}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-red-400">{a.no_auth}</td>
                      <td className="py-3 pr-4"><div className="flex items-center gap-2"><div className="w-12 h-1.5 bg-brand-border rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${Math.min(100,a.tasaAuth*100)}%`,background:'#68D391'}}/></div><span className="font-mono text-xs text-green-400">{fmtPct(a.tasaAuth)}</span></div></td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-teal">{a.facturadas}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-purple-400">{a.radicadas}</td>
                      <td className="py-3 pr-4 font-mono text-xs" style={{color:a.convTotal>0.1?'#68D391':'#FC8181'}}>{fmtPct(a.convTotal)}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(a.valSub)}</td>
                      <td className="py-3 font-mono text-xs text-yellow-400">{(a.descProm||0).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Comparativa de asesores</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porAsesor} margin={{top:5,right:10,left:10,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                <XAxis dataKey="nombre" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={(v:string)=>v.split(' ')[0]}/>
                <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                <Bar dataKey="total" name="Total" fill="#2D3748" radius={[4,4,0,0]}/>
                <Bar dataKey="autorizadas" name="Autorizadas" fill="#68D391" radius={[4,4,0,0]}/>
                <Bar dataKey="facturadas" name="Facturadas" fill="#4FD1C5" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* TAB: Pipeline */}
      {tab==='pipeline'&&pipeline&&(
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {label:'Pendientes de autorización',value:pipeline.pend_auth,color:'#63B3ED',desc:'Sin respuesta de la aseguradora'},
            {label:'En pedido / Reservado',value:pipeline.en_pedido,color:'#F6AD55',desc:'Pedidos creados pendientes'},
            {label:'Por facturar',value:pipeline.por_facturar,color:'#F6AD55',desc:'Autorizadas sin factura'},
            {label:'Por radicar',value:pipeline.por_radicar,color:'#B794F4',desc:'Facturadas sin radicar'},
            {label:'Completadas',value:pipeline.completadas,color:'#68D391',desc:'Proceso completo'},
            {label:'Total año',value:pipeline.total,color:'#4FD1C5',desc:'Todos los registros'},
          ].map(s=>(
            <Panel key={s.label}>
              <p className="text-xs font-mono text-brand-subtle mb-2">{s.label}</p>
              <p className="text-3xl font-bold font-title" style={{color:s.color}}>{s.value.toLocaleString()}</p>
              <p className="text-xs font-mono text-brand-subtle mt-2">{s.desc}</p>
              <div className="mt-3 h-1.5 bg-brand-border rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{width:`${pipeline.total>0?(s.value/pipeline.total)*100:0}%`,background:s.color}}/>
              </div>
              <p className="text-xs font-mono text-brand-subtle mt-1">{pipeline.total>0?((s.value/pipeline.total)*100).toFixed(1):0}% del total</p>
            </Panel>
          ))}
        </div>
      )}

      {/* TAB: Detalle paginado */}
      {tab==='detalle'&&(
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle">
              Detalle — {totalDet.toLocaleString()} registros {filtroMes!=='todos'?`· ${filtroMes}`:''}
            </h2>
            <div className="flex gap-2 items-center">
              <button disabled={detallePag===0} onClick={()=>setDetallePag(p=>Math.max(0,p-1))}
                className="px-3 py-1.5 text-xs font-mono border border-brand-border rounded-lg text-brand-subtle hover:text-brand-text disabled:opacity-40">← Ant</button>
              <span className="text-xs font-mono text-brand-subtle">Pág {detallePag+1} de {Math.ceil(totalDet/200)||1}</span>
              <button disabled={(detallePag+1)*200>=totalDet} onClick={()=>setDetallePag(p=>p+1)}
                className="px-3 py-1.5 text-xs font-mono border border-brand-border rounded-lg text-brand-subtle hover:text-brand-text disabled:opacity-40">Sig →</button>
            </div>
          </div>
          {loadingDet?<div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto"/></div>:(
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-brand-border">{['Placa','Marca','Aseguradora','Asesor','Fecha','V.Subastado','Estado Auth.','Estado Fact.','Factura','Estado Rad.'].map(h=>(<th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>))}</tr></thead>
                <tbody>
                  {detalle.map(s=>(
                    <tr key={s.id} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                      <td className="py-2 pr-4 font-mono text-xs text-brand-teal font-semibold">{s.placa}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{s.marca}</td>
                      <td className="py-2 pr-4 text-xs text-brand-text max-w-[110px] truncate">{nombreAseg(s.aseguradora_id)}</td>
                      <td className="py-2 pr-4 text-xs text-brand-subtle max-w-[90px] truncate">{nombreAsesor(s.asesor_id)?.split(' ')[0]}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{s.fecha_subasta}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{s.valor_subastado?fmtCOP(Number(s.valor_subastado)):'—'}</td>
                      <td className="py-2 pr-4"><Badge estado={s.estado_autorizacion}/></td>
                      <td className="py-2 pr-4"><Badge estado={s.estado_facturacion_oc}/></td>
                      <td className="py-2 pr-4 font-mono text-xs text-brand-subtle">{s.numero_factura||'—'}</td>
                      <td className="py-2"><Badge estado={s.estado_radicacion_factura}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Datos desde Supabase · Registro Subastas Aseguradoras {anio} · Sin límite de registros
      </p>
    </div>
  )
}
