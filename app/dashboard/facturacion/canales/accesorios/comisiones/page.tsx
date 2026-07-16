'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, AreaChart, Area, LineChart, Line, Cell,
} from 'recharts'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface VentaComision {
  anio: number; mes: string; mes_num: number; sede: string
  ventas: number; comisiones: number
}
interface ComisionCat {
  anio: number; mes: string; categoria: string; valor: number
}

// ── Constantes ────────────────────────────────────────────────────────────────
const YEARS  = [2023, 2024, 2025, 2026]
const SEDES  = ['Norte', 'Pasoancho', 'Sede 39']
const MESES_ORD = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MESES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const COLORES_AÑO: Record<number,string> = {2023:'#B794F4',2024:'#63B3ED',2025:'#68D391',2026:'#F6AD55'}
const COLORES_SEDE: Record<string,string> = {'Norte':'#4FD1C5','Pasoancho':'#68D391','Sede 39':'#F6AD55'}
const COLORES_CAT: Record<string,string> = {
  'Norte':'#4FD1C5','Pasoancho':'#68D391','Sede 39':'#F6AD55',
  'Incentivos Repuestos':'#B794F4','Colisión':'#FC8181',
  'Venta Extintores y Aditivos':'#63B3ED'
}

const fmtCOP = (v: number) => {
  if (!v && v !== 0) return '—'
  const abs = Math.abs(v), sign = v < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}$${(abs/1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(1)}M`
  return `${sign}$${abs.toLocaleString('es-CO',{maximumFractionDigits:0})}`
}
const fmtPct = (v: number) => `${v.toFixed(1)}%`

function Panel({children,className=''}:{children:React.ReactNode;className?:string}){
  return <div className={`rounded-xl border border-brand-border bg-brand-surface p-5 ${className}`}>{children}</div>
}
function KpiCard({label,value,sub,sub2,accent='text-brand-teal'}:{label:string;value:string;sub?:string;sub2?:string;accent?:string}){
  return(<Panel><p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">{label}</p><p className={`text-xl font-bold font-title ${accent}`}>{value}</p>{sub&&<p className="text-xs text-brand-subtle mt-1">{sub}</p>}{sub2&&<p className="text-xs text-brand-subtle mt-0.5">{sub2}</p>}</Panel>)
}
const TT=({active,payload,label}:any)=>{
  if(!active||!payload?.length)return null
  return(<div className="bg-brand-surface border border-brand-border rounded-lg p-3 shadow-xl min-w-[160px]"><p className="text-xs font-mono text-brand-subtle mb-2">{label}</p>{payload.map((p:any,i:number)=>(<p key={i} className="text-xs font-mono" style={{color:p.color}}>{p.name}: {fmtCOP(p.value)}</p>))}</div>)
}

export default function AccesoriosComisionesPage() {
  const [anio,     setAnio]     = useState(2026)
  const [sede,     setSede]     = useState('Todas')
  const [tab,      setTab]      = useState<'resumen'|'sedes'|'categorias'|'historico'>('resumen')

  const [datos,    setDatos]    = useState<VentaComision[]>([])
  const [cats,     setCats]     = useState<ComisionCat[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [ultimaAct,setUltimaAct]= useState<Date|null>(null)

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [{data:dV},{data:dC}] = await Promise.all([
        supabase.from('ventas_comisiones_accesorios')
          .select('anio,mes,mes_num,sede,ventas,comisiones')
          .in('anio', YEARS).order('anio').order('mes_num'),
        supabase.from('comisiones_categoria')
          .select('anio,mes,categoria,valor')
          .in('anio', YEARS),
      ])
      setDatos((dV??[]) as VentaComision[])
      setCats((dC??[]) as ComisionCat[])
      setUltimaAct(new Date())
    } catch(e:any){setError(`Error: ${e?.message}`)}
    setLoading(false)
  },[])

  useEffect(()=>{cargar()},[cargar])

  // ── Datos filtrados por año y sede ────────────────────────────────────────
  const filtrados = useMemo(()=>{
    return datos.filter(d => d.anio===anio && (sede==='Todas' ? d.sede==='Todas' : d.sede===sede))
  },[datos, anio, sede])

  // ── KPIs del año seleccionado ─────────────────────────────────────────────
  const kpi = useMemo(()=>{
    const base = datos.filter(d=>d.anio===anio&&d.sede==='Todas')
    const ventas     = base.reduce((s,d)=>s+Number(d.ventas||0),0)
    const comisiones = base.reduce((s,d)=>s+Number(d.comisiones||0),0)
    const pctCom     = ventas>0?(comisiones/ventas)*100:0
    // vs año anterior
    const prev = datos.filter(d=>d.anio===anio-1&&d.sede==='Todas')
    const ventasPrev = prev.reduce((s,d)=>s+Number(d.ventas||0),0)
    const comPrev    = prev.reduce((s,d)=>s+Number(d.comisiones||0),0)
    return { ventas, comisiones, pctCom, ventasPrev, comPrev,
      varVentas: ventasPrev>0?((ventas-ventasPrev)/ventasPrev)*100:0,
      varCom:    comPrev>0?((comisiones-comPrev)/comPrev)*100:0 }
  },[datos, anio])

  // ── Evolución mensual ─────────────────────────────────────────────────────
  const evolucion = useMemo(()=>{
    return MESES_ORD.map((m,i)=>{
      const fila = filtrados.find(d=>d.mes===m)
      return {
        name: MESES_SHORT[i],
        Ventas:     Number(fila?.ventas||0),
        Comisiones: Number(fila?.comisiones||0),
      }
    }).filter(r=>r.Ventas>0||r.Comisiones>0)
  },[filtrados])

  // ── Comparativo multi-año ─────────────────────────────────────────────────
  const multiAnio = useMemo(()=>{
    return MESES_ORD.map((m,i)=>{
      const entry:any = {name: MESES_SHORT[i]}
      const sedeFilt = sede==='Todas'?'Todas':sede
      YEARS.forEach(y=>{
        const fila = datos.find(d=>d.mes===m&&d.anio===y&&d.sede===sedeFilt)
        entry[`Ventas${y}`]     = Number(fila?.ventas||0)
        entry[`Comisiones${y}`] = Number(fila?.comisiones||0)
      })
      return entry
    })
  },[datos, sede])

  // ── Por sede (año seleccionado) ───────────────────────────────────────────
  const porSede = useMemo(()=>{
    return SEDES.map(s=>{
      const rows = datos.filter(d=>d.anio===anio&&d.sede===s)
      const ventas     = rows.reduce((sum,d)=>sum+Number(d.ventas||0),0)
      const comisiones = rows.reduce((sum,d)=>sum+Number(d.comisiones||0),0)
      return { sede:s, ventas, comisiones, pct:ventas>0?(comisiones/ventas)*100:0 }
    })
  },[datos, anio])

  // ── Por categoría ─────────────────────────────────────────────────────────
  const porCat = useMemo(()=>{
    const mapa:Record<string,number> = {}
    cats.filter(c=>c.anio===anio).forEach(c=>{
      mapa[c.categoria] = (mapa[c.categoria]||0) + Number(c.valor||0)
    })
    return Object.entries(mapa)
      .map(([cat,total])=>({cat,total}))
      .sort((a,b)=>b.total-a.total)
  },[cats, anio])

  // ── Historico por categoría ───────────────────────────────────────────────
  const historicoCat = useMemo(()=>{
    return MESES_ORD.map((m,i)=>{
      const entry:any={name:MESES_SHORT[i]}
      const rows = cats.filter(c=>c.mes===m&&c.anio===anio)
      rows.forEach(c=>{ entry[c.categoria] = Number(c.valor||0) })
      return entry
    }).filter(e=>Object.keys(e).length>1)
  },[cats, anio])

  // ── % comisión por mes (tabla) ────────────────────────────────────────────
  const tablaMensual = useMemo(()=>{
    const sedeFilt = sede==='Todas'?'Todas':sede
    return MESES_ORD.map((m,i)=>{
      const fila = datos.find(d=>d.mes===m&&d.anio===anio&&d.sede===sedeFilt)
      const v = Number(fila?.ventas||0), c = Number(fila?.comisiones||0)
      return { mes:MESES_SHORT[i], ventas:v, comisiones:c, pct:v>0?(c/v)*100:0 }
    }).filter(r=>r.ventas>0||r.comisiones>0)
  },[datos, anio, sede])

  if(loading)return(<div className="min-h-screen flex items-center justify-center"><div className="text-center"><div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3"/><p className="text-brand-subtle text-sm font-mono">Cargando comisiones...</p></div></div>)

  return(
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-brand-subtle uppercase tracking-wider">Accesorios</span>
            <span className="text-xs text-brand-subtle">·</span>
            <span className="text-xs font-mono text-brand-teal">Ventas vs Comisiones</span>
          </div>
          <h1 className="text-2xl font-bold font-title text-brand-text">💰 Comisiones Accesorios</h1>
          <p className="text-sm text-brand-subtle mt-0.5">
            Ventas vs comisiones pagadas · 2023-2026 · {sede!=='Todas'?sede:'todas las sedes'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Navegación */}
          <a href="/dashboard/facturacion/canales/accesorios"
            className="flex items-center gap-2 rounded-xl border border-brand-border bg-brand-surface px-4 py-2 hover:border-brand-teal/50 transition-colors text-sm font-mono text-brand-subtle hover:text-brand-text">
            ← Accesorios
          </a>
          {/* Filtro sede */}
          <div className="flex rounded-lg border border-brand-border overflow-hidden">
            {['Todas',...SEDES].map(s=>(
              <button key={s} onClick={()=>setSede(s)}
                className={`px-3 py-2 text-xs font-mono transition-colors ${sede===s?'bg-brand-teal text-black':'text-brand-subtle hover:text-brand-text'}`}>
                {s}
              </button>
            ))}
          </div>
          {/* Filtro año */}
          <select value={anio} onChange={e=>setAnio(Number(e.target.value))}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={cargar}
            className="bg-brand-teal/20 hover:bg-brand-teal/30 border border-brand-teal/40 text-brand-teal rounded-lg px-4 py-2 text-sm font-mono transition-colors">
            ↻ Actualizar
          </button>
          {ultimaAct&&<span className="text-xs text-brand-subtle font-mono">Act: {ultimaAct.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</span>}
        </div>
      </div>

      {error&&<div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-400 text-sm font-mono">{error}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={`Ventas ${anio}`} value={fmtCOP(kpi.ventas)}
          sub={`vs ${anio-1}: ${kpi.varVentas>=0?'+':''}${kpi.varVentas.toFixed(1)}%`}
          accent="text-brand-teal"/>
        <KpiCard label={`Comisiones ${anio}`} value={fmtCOP(kpi.comisiones)}
          sub={`vs ${anio-1}: ${kpi.varCom>=0?'+':''}${kpi.varCom.toFixed(1)}%`}
          accent="text-yellow-400"/>
        <KpiCard label="% Comisión sobre ventas" value={fmtPct(kpi.pctCom)}
          sub={`${fmtCOP(kpi.comisiones)} de ${fmtCOP(kpi.ventas)}`}
          accent={kpi.pctCom>12?'text-red-400':kpi.pctCom>9?'text-yellow-400':'text-green-400'}/>
        <KpiCard label="Comisión promedio/mes" value={fmtCOP(kpi.comisiones/Math.max(1,tablaMensual.length))}
          sub={`${tablaMensual.length} meses con datos`}
          accent="text-purple-400"/>
      </div>

      {/* Cards por sede */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {porSede.map(s=>(
          <button key={s.sede} onClick={()=>setSede(sede===s.sede?'Todas':s.sede)}
            className={`rounded-xl border p-5 text-left transition-all ${sede===s.sede?'border-brand-teal bg-brand-teal/10':'border-brand-border bg-brand-surface hover:border-brand-teal/50'}`}>
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-semibold text-brand-text">{s.sede}</p>
              {sede===s.sede&&<span className="text-xs px-2 py-0.5 rounded-full bg-brand-teal text-black font-mono">Activo</span>}
            </div>
            <p className="text-xs font-mono text-brand-subtle mb-1">Ventas</p>
            <p className="text-xl font-bold font-title" style={{color:COLORES_SEDE[s.sede]}}>{fmtCOP(s.ventas)}</p>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-brand-subtle">Comisiones</span>
                <span className="text-yellow-400">{fmtCOP(s.comisiones)}</span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-brand-subtle">% sobre ventas</span>
                <span className={s.pct>12?'text-red-400':s.pct>9?'text-yellow-400':'text-green-400'}>{fmtPct(s.pct)}</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 bg-brand-border rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{width:`${Math.min(100,s.pct*4)}%`,background:COLORES_SEDE[s.sede]}}/>
            </div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-brand-border">
        {([
          {id:'resumen',    label:'📊 Ventas vs Comisiones'},
          {id:'sedes',      label:'🏢 Por sede'},
          {id:'categorias', label:'📂 Por categoría'},
          {id:'historico',  label:'📈 Histórico'},
        ] as const).map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 -mb-px ${tab===t.id?'border-brand-teal text-brand-teal':'border-transparent text-brand-subtle hover:text-brand-text'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Resumen */}
      {tab==='resumen'&&(
        <div className="space-y-6">
          {/* Gráfica de área ventas vs comisiones */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
              Ventas vs Comisiones — {anio} · {sede!=='Todas'?sede:'todas las sedes'}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={evolucion} margin={{top:5,right:10,left:10,bottom:5}}>
                <defs>
                  <linearGradient id="gradV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4FD1C5" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#4FD1C5" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F6AD55" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#F6AD55" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                <XAxis dataKey="name" tick={{fill:'#718096',fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={80} tickFormatter={v=>fmtCOP(v)}/>
                <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                <Area type="monotone" dataKey="Ventas" stroke="#4FD1C5" strokeWidth={2}
                  fill="url(#gradV)" dot={{fill:'#4FD1C5',r:3,strokeWidth:0}}/>
                <Area type="monotone" dataKey="Comisiones" stroke="#F6AD55" strokeWidth={2}
                  fill="url(#gradC)" dot={{fill:'#F6AD55',r:3,strokeWidth:0}}/>
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* Tabla mensual */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Detalle mensual {anio}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-brand-border">
                  {['Mes','Ventas','Comisiones','% Comisión','Barra'].map(h=>(
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-6 whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {tablaMensual.map(r=>(
                    <tr key={r.mes} className="border-b border-brand-border/40 hover:bg-brand-surface/50">
                      <td className="py-3 pr-6 font-mono text-xs text-brand-text font-medium">{r.mes}</td>
                      <td className="py-3 pr-6 font-mono text-xs text-brand-teal font-semibold">{fmtCOP(r.ventas)}</td>
                      <td className="py-3 pr-6 font-mono text-xs text-yellow-400">{fmtCOP(r.comisiones)}</td>
                      <td className="py-3 pr-6 font-mono text-xs" style={{color:r.pct>12?'#FC8181':r.pct>9?'#F6AD55':'#68D391'}}>{fmtPct(r.pct)}</td>
                      <td className="py-3 pr-6">
                        <div className="w-32 h-2 bg-brand-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{width:`${Math.min(100,r.pct*6)}%`,
                            background:r.pct>12?'#FC8181':r.pct>9?'#F6AD55':'#68D391'}}/>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brand-border">
                    <td className="pt-3 pr-6 font-mono text-xs text-brand-text font-bold uppercase">Total</td>
                    <td className="pt-3 pr-6 font-mono text-xs text-brand-teal font-bold">{fmtCOP(tablaMensual.reduce((s,r)=>s+r.ventas,0))}</td>
                    <td className="pt-3 pr-6 font-mono text-xs text-yellow-400 font-bold">{fmtCOP(tablaMensual.reduce((s,r)=>s+r.comisiones,0))}</td>
                    <td className="pt-3 pr-6 font-mono text-xs text-brand-subtle font-bold">{fmtPct(kpi.pctCom)}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB: Por sede */}
      {tab==='sedes'&&(
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Ventas por sede — {anio}</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={SEDES.map(s=>{
                  const rows = datos.filter(d=>d.anio===anio&&d.sede===s)
                  return {name:s, Ventas:rows.reduce((sum,d)=>sum+Number(d.ventas||0),0), Comisiones:rows.reduce((sum,d)=>sum+Number(d.comisiones||0),0)}
                })} margin={{top:5,right:10,left:10,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:'#718096',fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={80} tickFormatter={v=>fmtCOP(v)}/>
                  <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                  <Bar dataKey="Ventas" radius={[4,4,0,0]}>
                    {SEDES.map((s,i)=><Cell key={i} fill={COLORES_SEDE[s]}/>)}
                  </Bar>
                  <Bar dataKey="Comisiones" fill="#F6AD55" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Evolución ventas por sede — {anio}</h2>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={MESES_ORD.map((m,i)=>{
                  const entry:any={name:MESES_SHORT[i]}
                  SEDES.forEach(s=>{
                    const fila=datos.find(d=>d.mes===m&&d.anio===anio&&d.sede===s)
                    entry[s]=Number(fila?.ventas||0)
                  })
                  return entry
                }).filter(e=>SEDES.some(s=>e[s]>0))} margin={{top:5,right:10,left:10,bottom:5}}>
                  <defs>
                    {SEDES.map(s=>(
                      <linearGradient key={s} id={`gs${s}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORES_SEDE[s]} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={COLORES_SEDE[s]} stopOpacity={0}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={80} tickFormatter={v=>fmtCOP(v)}/>
                  <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:10,color:'#718096'}}/>
                  {SEDES.map(s=>(
                    <Area key={s} type="monotone" dataKey={s} stroke={COLORES_SEDE[s]} strokeWidth={2}
                      fill={`url(#gs${s})`} dot={{fill:COLORES_SEDE[s],r:3,strokeWidth:0}}/>
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </Panel>

            {/* Tabla comparativa de sedes */}
            <Panel className="xl:col-span-2">
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Comparativo sedes — {anio}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-brand-border">
                    {['Sede','Ventas','Comisiones','% Comisión','Vs año anterior'].map(h=>(
                      <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-6 whitespace-nowrap">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {porSede.map(s=>{
                      const prev = datos.filter(d=>d.anio===anio-1&&d.sede===s.sede)
                      const ventasPrev = prev.reduce((sum,d)=>sum+Number(d.ventas||0),0)
                      const varV = ventasPrev>0?((s.ventas-ventasPrev)/ventasPrev)*100:0
                      return(
                        <tr key={s.sede} className="border-b border-brand-border/40 hover:bg-brand-surface/50">
                          <td className="py-3 pr-6">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{background:COLORES_SEDE[s.sede]}}/>
                              <span className="text-xs font-medium text-brand-text">{s.sede}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-6 font-mono text-xs font-semibold" style={{color:COLORES_SEDE[s.sede]}}>{fmtCOP(s.ventas)}</td>
                          <td className="py-3 pr-6 font-mono text-xs text-yellow-400">{fmtCOP(s.comisiones)}</td>
                          <td className="py-3 pr-6 font-mono text-xs" style={{color:s.pct>12?'#FC8181':s.pct>9?'#F6AD55':'#68D391'}}>{fmtPct(s.pct)}</td>
                          <td className="py-3 pr-6 font-mono text-xs" style={{color:varV>=0?'#68D391':'#FC8181'}}>
                            {varV>=0?'↑':'↓'} {Math.abs(varV).toFixed(1)}% vs {anio-1}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* TAB: Por categoría */}
      {tab==='categorias'&&(
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Comisiones por categoría — {anio}</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={porCat} layout="vertical" margin={{top:5,right:40,left:120,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" horizontal={false}/>
                  <XAxis type="number" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>fmtCOP(v)}/>
                  <YAxis type="category" dataKey="cat" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={115}/>
                  <Tooltip content={<TT/>}/>
                  <Bar dataKey="total" name="Comisión" radius={[0,4,4,0]}>
                    {porCat.map((e,i)=><Cell key={i} fill={COLORES_CAT[e.cat]||'#4FD1C5'}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Evolución categorías por mes — {anio}</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={historicoCat} margin={{top:5,right:10,left:10,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={80} tickFormatter={v=>fmtCOP(v)}/>
                  <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:10,color:'#718096'}}/>
                  {Object.keys(COLORES_CAT).map(cat=>(
                    <Bar key={cat} dataKey={cat} stackId="a" fill={COLORES_CAT[cat]} radius={[0,0,0,0]}/>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel className="xl:col-span-2">
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Detalle por categoría — {anio}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-brand-border">
                    {['Categoría','Total comisión','% del total'].map(h=>(
                      <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-6 whitespace-nowrap">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {porCat.map(c=>{
                      const total = porCat.reduce((s,x)=>s+x.total,0)
                      return(
                        <tr key={c.cat} className="border-b border-brand-border/40 hover:bg-brand-surface/50">
                          <td className="py-3 pr-6">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{background:COLORES_CAT[c.cat]||'#4FD1C5'}}/>
                              <span className="text-xs font-medium text-brand-text">{c.cat}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-6 font-mono text-xs text-yellow-400 font-semibold">{fmtCOP(c.total)}</td>
                          <td className="py-3 pr-6">
                            <div className="flex items-center gap-3">
                              <div className="w-24 h-1.5 bg-brand-border rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{width:`${total>0?(c.total/total)*100:0}%`,background:COLORES_CAT[c.cat]||'#4FD1C5'}}/>
                              </div>
                              <span className="font-mono text-xs text-brand-subtle">{total>0?fmtPct((c.total/total)*100):'—'}</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-brand-border">
                      <td className="pt-3 font-mono text-xs font-bold text-brand-text uppercase">Total</td>
                      <td className="pt-3 font-mono text-xs text-yellow-400 font-bold">{fmtCOP(porCat.reduce((s,c)=>s+c.total,0))}</td>
                      <td className="pt-3 font-mono text-xs text-brand-subtle">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* TAB: Histórico */}
      {tab==='historico'&&(
        <div className="space-y-6">
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
              Ventas históricas 2023-2026 — {sede!=='Todas'?sede:'todas las sedes'}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={multiAnio} margin={{top:5,right:10,left:10,bottom:5}}>
                <defs>
                  {YEARS.map(y=>(
                    <linearGradient key={y} id={`gh${y}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORES_AÑO[y]} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORES_AÑO[y]} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                <XAxis dataKey="name" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={80} tickFormatter={v=>fmtCOP(v)}/>
                <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:10,color:'#718096'}}/>
                {YEARS.map(y=>(
                  <Area key={y} type="monotone" dataKey={`Ventas${y}`} name={`Ventas ${y}`}
                    stroke={COLORES_AÑO[y]} strokeWidth={2}
                    fill={`url(#gh${y})`} dot={{fill:COLORES_AÑO[y],r:3,strokeWidth:0}}/>
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
              Comisiones históricas 2023-2026 — {sede!=='Todas'?sede:'todas las sedes'}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={multiAnio} margin={{top:5,right:10,left:10,bottom:5}}>
                <defs>
                  {YEARS.map(y=>(
                    <linearGradient key={y} id={`ghc${y}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORES_AÑO[y]} stopOpacity={0.35}/>
                      <stop offset="95%" stopColor={COLORES_AÑO[y]} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                <XAxis dataKey="name" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={80} tickFormatter={v=>fmtCOP(v)}/>
                <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:10,color:'#718096'}}/>
                {YEARS.map(y=>(
                  <Area key={y} type="monotone" dataKey={`Comisiones${y}`} name={`Comisiones ${y}`}
                    stroke={COLORES_AÑO[y]} strokeWidth={2}
                    fill={`url(#ghc${y})`} dot={{fill:COLORES_AÑO[y],r:3,strokeWidth:0}}/>
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* Tabla resumen anual */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Resumen anual histórico</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-brand-border">
                  {['Año','Ventas','Comisiones','% Comisión','vs Año Anterior'].map(h=>(
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-6 whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {YEARS.map((y,idx)=>{
                    const sedeFilt = sede==='Todas'?'Todas':sede
                    const rows  = datos.filter(d=>d.anio===y&&d.sede===sedeFilt)
                    const v     = rows.reduce((s,d)=>s+Number(d.ventas||0),0)
                    const c     = rows.reduce((s,d)=>s+Number(d.comisiones||0),0)
                    const pct   = v>0?(c/v)*100:0
                    const prev  = datos.filter(d=>d.anio===y-1&&d.sede===sedeFilt)
                    const vPrev = prev.reduce((s,d)=>s+Number(d.ventas||0),0)
                    const varV  = vPrev>0?((v-vPrev)/vPrev)*100:null
                    return(
                      <tr key={y} className={`border-b border-brand-border/40 hover:bg-brand-surface/50 ${y===anio?'bg-brand-teal/5':''}`}>
                        <td className="py-3 pr-6 font-bold font-title text-sm" style={{color:COLORES_AÑO[y]}}>{y}</td>
                        <td className="py-3 pr-6 font-mono text-xs text-brand-teal font-semibold">{fmtCOP(v)}</td>
                        <td className="py-3 pr-6 font-mono text-xs text-yellow-400">{fmtCOP(c)}</td>
                        <td className="py-3 pr-6 font-mono text-xs" style={{color:pct>12?'#FC8181':pct>9?'#F6AD55':'#68D391'}}>{fmtPct(pct)}</td>
                        <td className="py-3 pr-6 font-mono text-xs">
                          {varV!==null ? <span style={{color:varV>=0?'#68D391':'#FC8181'}}>{varV>=0?'↑':'↓'} {Math.abs(varV).toFixed(1)}%</span> : <span className="text-brand-subtle">—</span>}
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
        Datos desde Supabase · Facturación Accesorios 2023-2026
      </p>
    </div>
  )
}
