'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, AreaChart, Area, Cell,
} from 'recharts'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface VentaAsesor {
  id: number; cedula: string; asesor: string
  ventas: number; comision: number
  sede: string; area: string; mes: string; anio: number
}

// ── Constantes ────────────────────────────────────────────────────────────────
const YEARS  = [2023, 2024, 2025, 2026]
const SEDES  = ['Norte', 'Pasoancho', 'Sede 39']
const MESES_ORD = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MESES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const COLORES_AÑO: Record<number,string> = {2023:'#B794F4',2024:'#63B3ED',2025:'#68D391',2026:'#F6AD55'}
const COLORES_SEDE: Record<string,string> = {'Norte':'#4FD1C5','Pasoancho':'#68D391','Sede 39':'#F6AD55'}
const PALETA = ['#4FD1C5','#68D391','#F6AD55','#FC8181','#B794F4','#63B3ED',
  '#F687B3','#FBD38D','#9AE6B4','#90CDF4','#FEB2B2','#E9D8FD']

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
const TT=({active,payload,label}:any)=>{
  if(!active||!payload?.length)return null
  return(<div className="bg-brand-surface border border-brand-border rounded-lg p-3 shadow-xl min-w-[160px]">
    <p className="text-xs font-mono text-brand-subtle mb-2">{label}</p>
    {payload.map((p:any,i:number)=>(
      <p key={i} className="text-xs font-mono" style={{color:p.color}}>{p.name}: {fmtCOP(p.value)}</p>
    ))}
  </div>)
}

export default function AccesoriosVentasAsesorPage() {
  const [anio,       setAnio]       = useState(2026)
  const [sede,       setSede]       = useState('Todas')
  const [tab,        setTab]        = useState<'ranking'|'norte'|'pasoancho'|'sede39'|'historico'>('ranking')
  const [buscar,     setBuscar]     = useState('')
  const [topN,       setTopN]       = useState(10)

  const [datos,    setDatos]    = useState<VentaAsesor[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [ultimaAct,setUltimaAct]= useState<Date|null>(null)

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const {data} = await supabase
        .from('ventas_asesor_accesorios')
        .select('id,cedula,asesor,ventas,comision,sede,area,mes,anio')
        .in('anio', YEARS)
        .range(0, 4999)
      setDatos((data??[]) as VentaAsesor[])
      setUltimaAct(new Date())
    } catch(e:any){setError(`Error: ${e?.message}`)}
    setLoading(false)
  },[])

  useEffect(()=>{cargar()},[cargar])

  // ── Filtrado base ─────────────────────────────────────────────────────────
  const base = useMemo(()=>{
    return datos.filter(d => d.anio === anio && (sede==='Todas' || d.sede===sede))
  },[datos, anio, sede])

  // ── Ranking general ───────────────────────────────────────────────────────
  const ranking = useMemo(()=>{
    const mapa: Record<string,{ventas:number;comision:number;registros:number;sedes:Set<string>}> = {}
    base.forEach(d=>{
      if (!mapa[d.asesor]) mapa[d.asesor]={ventas:0,comision:0,registros:0,sedes:new Set()}
      mapa[d.asesor].ventas    += Number(d.ventas||0)
      mapa[d.asesor].comision  += Number(d.comision||0)
      mapa[d.asesor].registros += 1
      if (d.sede) mapa[d.asesor].sedes.add(d.sede)
    })
    return Object.entries(mapa)
      .map(([asesor,d],i)=>({
        pos: 0, asesor,
        ventas: d.ventas, comision: d.comision,
        registros: d.registros,
        sedes: Array.from(d.sedes).join(', '),
        pctCom: d.ventas>0?(d.comision/d.ventas)*100:0,
      }))
      .sort((a,b)=>b.ventas-a.ventas)
      .map((r,i)=>({...r,pos:i+1}))
  },[base])

  // ── Ranking por sede ──────────────────────────────────────────────────────
  const rankingPorSede = useMemo(()=>{
    const result: Record<string,any[]> = {}
    SEDES.forEach(s=>{
      const mapa: Record<string,{ventas:number;comision:number}> = {}
      datos.filter(d=>d.anio===anio&&d.sede===s).forEach(d=>{
        if (!mapa[d.asesor]) mapa[d.asesor]={ventas:0,comision:0}
        mapa[d.asesor].ventas   += Number(d.ventas||0)
        mapa[d.asesor].comision += Number(d.comision||0)
      })
      result[s] = Object.entries(mapa)
        .map(([asesor,d])=>({asesor,...d,pctCom:d.ventas>0?(d.comision/d.ventas)*100:0}))
        .sort((a,b)=>b.ventas-a.ventas)
        .map((r,i)=>({...r,pos:i+1}))
    })
    return result
  },[datos, anio])

  // ── Evolución mensual top asesores ────────────────────────────────────────
  const topAsesores = useMemo(()=>ranking.slice(0,5).map(r=>r.asesor),[ranking])

  const evolucionTop = useMemo(()=>{
    return MESES_ORD.map((m,i)=>{
      const entry:any={name:MESES_SHORT[i]}
      topAsesores.forEach(a=>{
        const rows = base.filter(d=>d.mes===m&&d.asesor===a)
        entry[a.split(' ')[0]] = rows.reduce((s,d)=>s+Number(d.ventas||0),0)
      })
      return entry
    }).filter(e=>Object.keys(e).length>1)
  },[base, topAsesores])

  // ── Histórico por asesor ──────────────────────────────────────────────────
  const historico = useMemo(()=>{
    const mapa: Record<string,Record<number,number>> = {}
    datos.filter(d=>d.sede==='Todas'||sede==='Todas'?true:d.sede===sede).forEach(d=>{
      if (!mapa[d.asesor]) mapa[d.asesor]={}
      mapa[d.asesor][d.anio] = (mapa[d.asesor][d.anio]||0) + Number(d.ventas||0)
    })
    return Object.entries(mapa)
      .map(([asesor,porAnio])=>({asesor,...Object.fromEntries(YEARS.map(y=>[y,porAnio[y]||0]))}))
      .sort((a:any,b:any)=>(b[anio]||0)-(a[anio]||0))
      .slice(0,15)
  },[datos, sede, anio])

  // ── KPIs globales ─────────────────────────────────────────────────────────
  const kpi = useMemo(()=>({
    totalVentas:    ranking.reduce((s,r)=>s+r.ventas,0),
    totalComision:  ranking.reduce((s,r)=>s+r.comision,0),
    totalAsesores:  ranking.length,
    promVentas:     ranking.length ? ranking.reduce((s,r)=>s+r.ventas,0)/ranking.length : 0,
  }),[ranking])

  // ── Filtro búsqueda ───────────────────────────────────────────────────────
  const rankingFiltrado = useMemo(()=>{
    let r = ranking
    if (buscar.trim()) r = r.filter(x=>x.asesor.toLowerCase().includes(buscar.toLowerCase()))
    return r.slice(0, topN)
  },[ranking, buscar, topN])

  if(loading)return(<div className="min-h-screen flex items-center justify-center"><div className="text-center"><div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3"/><p className="text-brand-subtle text-sm font-mono">Cargando ventas por asesor...</p></div></div>)

  return(
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-brand-subtle uppercase tracking-wider">Accesorios</span>
            <span className="text-xs text-brand-subtle">·</span>
            <span className="text-xs font-mono text-brand-teal">Ventas por Asesor</span>
          </div>
          <h1 className="text-2xl font-bold font-title text-brand-text">👤 Ranking de Asesores</h1>
          <p className="text-sm text-brand-subtle mt-0.5">
            {kpi.totalAsesores} asesores · {sede!=='Todas'?sede:'todas las sedes'} · {anio}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <a href="/dashboard/facturacion/canales/accesorios"
            className="rounded-xl border border-brand-border bg-brand-surface px-4 py-2 hover:border-brand-teal/50 transition-colors text-sm font-mono text-brand-subtle hover:text-brand-text">
            ← Accesorios
          </a>
          <a href="/dashboard/facturacion/canales/accesorios/comisiones"
            className="rounded-xl border border-brand-border bg-brand-surface px-4 py-2 hover:border-brand-teal/50 transition-colors text-sm font-mono text-brand-subtle hover:text-brand-text">
            💰 Comisiones
          </a>
          <div className="flex rounded-lg border border-brand-border overflow-hidden">
            {['Todas',...SEDES].map(s=>(
              <button key={s} onClick={()=>setSede(s)}
                className={`px-3 py-2 text-xs font-mono transition-colors ${sede===s?'bg-brand-teal text-black':'text-brand-subtle hover:text-brand-text'}`}>
                {s}
              </button>
            ))}
          </div>
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
        {[
          {label:'Ventas totales',   value:fmtCOP(kpi.totalVentas),   accent:'text-brand-teal'},
          {label:'Comisiones pagadas',value:fmtCOP(kpi.totalComision), accent:'text-yellow-400'},
          {label:'Asesores activos', value:kpi.totalAsesores.toString(),accent:'text-brand-text'},
          {label:'Promedio por asesor',value:fmtCOP(kpi.promVentas),  accent:'text-purple-400'},
        ].map(k=>(
          <Panel key={k.label}>
            <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">{k.label}</p>
            <p className={`text-xl font-bold font-title ${k.accent}`}>{k.value}</p>
          </Panel>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-brand-border overflow-x-auto">
        {([
          {id:'ranking',    label:'🏆 Ranking General'},
          {id:'norte',      label:'📍 Norte'},
          {id:'pasoancho',  label:'📍 Pasoancho'},
          {id:'sede39',     label:'📍 Sede 39'},
          {id:'historico',  label:'📈 Histórico'},
        ] as const).map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 -mb-px whitespace-nowrap ${tab===t.id?'border-brand-teal text-brand-teal':'border-transparent text-brand-subtle hover:text-brand-text'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Ranking General */}
      {tab==='ranking'&&(
        <div className="space-y-6">
          {/* Gráfica top 10 */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
              Top {Math.min(10,ranking.length)} asesores por ventas — {anio} · {sede!=='Todas'?sede:'todas las sedes'}
            </h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={ranking.slice(0,10).map(r=>({
                  name: r.asesor.split(' ').slice(0,2).join(' '),
                  Ventas: r.ventas,
                  Comisión: r.comision,
                }))}
                layout="vertical" margin={{top:5,right:40,left:130,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" horizontal={false}/>
                <XAxis type="number" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>fmtCOP(v)}/>
                <YAxis type="category" dataKey="name" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={125}/>
                <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                <Bar dataKey="Ventas" fill="#4FD1C5" radius={[0,4,4,0]}>
                  {ranking.slice(0,10).map((_,i)=><Cell key={i} fill={PALETA[i%12]}/>)}
                </Bar>
                <Bar dataKey="Comisión" fill="#F6AD55" radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          {/* Evolución mensual top 5 */}
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
              Evolución mensual — Top 5 asesores — {anio}
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={evolucionTop} margin={{top:5,right:10,left:10,bottom:5}}>
                <defs>
                  {topAsesores.map((a,i)=>(
                    <linearGradient key={a} id={`gt${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PALETA[i]} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={PALETA[i]} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                <XAxis dataKey="name" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={80} tickFormatter={v=>fmtCOP(v)}/>
                <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:10,color:'#718096'}}/>
                {topAsesores.map((a,i)=>(
                  <Area key={a} type="monotone" dataKey={a.split(' ')[0]} stroke={PALETA[i]} strokeWidth={2}
                    fill={`url(#gt${i})`} dot={{fill:PALETA[i],r:3,strokeWidth:0}}/>
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* Tabla ranking completa */}
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle">
                Ranking completo — {ranking.length} asesores
              </h2>
              <div className="flex gap-3 items-center">
                <input type="text" placeholder="Buscar asesor..."
                  value={buscar} onChange={e=>setBuscar(e.target.value)}
                  className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-brand-teal w-52"/>
                <select value={topN} onChange={e=>setTopN(Number(e.target.value))}
                  className="bg-brand-surface border border-brand-border rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-brand-teal">
                  {[10,20,50,100,9999].map(n=><option key={n} value={n}>{n===9999?'Todos':`Top ${n}`}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-brand-border">
                  {['#','Asesor','Sedes','Ventas','Comisión','% Comisión','Barra'].map(h=>(
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rankingFiltrado.map((r,i)=>{
                    const maxV = ranking[0]?.ventas||1
                    return(
                      <tr key={r.asesor} className="border-b border-brand-border/40 hover:bg-brand-surface/50">
                        <td className="py-2 pr-4">
                          <span className={`text-xs font-bold font-mono ${r.pos<=3?'text-yellow-400':'text-brand-subtle'}`}>
                            {r.pos<=3?['🥇','🥈','🥉'][r.pos-1]:r.pos}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-xs font-medium text-brand-text max-w-[180px]">{r.asesor}</td>
                        <td className="py-2 pr-4 text-xs text-brand-subtle max-w-[120px] truncate">{r.sedes||'—'}</td>
                        <td className="py-2 pr-4 font-mono text-xs font-semibold" style={{color:PALETA[i%12]}}>{fmtCOP(r.ventas)}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-yellow-400">{fmtCOP(r.comision)}</td>
                        <td className="py-2 pr-4 font-mono text-xs" style={{color:r.pctCom>12?'#FC8181':r.pctCom>9?'#F6AD55':'#68D391'}}>{fmtPct(r.pctCom)}</td>
                        <td className="py-2 pr-4">
                          <div className="w-28 h-2 bg-brand-border rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{width:`${(r.ventas/maxV)*100}%`,background:PALETA[i%12]}}/>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brand-border">
                    <td colSpan={3} className="pt-3 font-mono text-xs font-bold text-brand-text uppercase">Total</td>
                    <td className="pt-3 font-mono text-xs text-brand-teal font-bold">{fmtCOP(kpi.totalVentas)}</td>
                    <td className="pt-3 font-mono text-xs text-yellow-400 font-bold">{fmtCOP(kpi.totalComision)}</td>
                    <td className="pt-3 font-mono text-xs text-brand-subtle">{kpi.totalVentas>0?fmtPct((kpi.totalComision/kpi.totalVentas)*100):'—'}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB: Por sede */}
      {(['norte','pasoancho','sede39'] as const).map(tabId=>{
        const sedeNombre = tabId==='norte'?'Norte':tabId==='pasoancho'?'Pasoancho':'Sede 39'
        const datos39 = rankingPorSede[sedeNombre]||[]
        if (tab !== tabId) return null
        const maxV = datos39[0]?.ventas||1
        return(
          <div key={tabId} className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                {label:'Ventas totales',value:fmtCOP(datos39.reduce((s,r)=>s+r.ventas,0)),accent:'text-brand-teal'},
                {label:'Comisiones',    value:fmtCOP(datos39.reduce((s,r)=>s+r.comision,0)),accent:'text-yellow-400'},
                {label:'Asesores',      value:datos39.length.toString(),accent:'text-brand-text'},
              ].map(k=>(
                <Panel key={k.label}>
                  <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">{k.label}</p>
                  <p className={`text-xl font-bold font-title ${k.accent}`}>{k.value}</p>
                  <p className="text-xs font-mono text-brand-subtle mt-1">{sedeNombre} · {anio}</p>
                </Panel>
              ))}
            </div>

            {/* Gráfica top 10 sede */}
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
                Top 10 asesores — {sedeNombre} — {anio}
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={datos39.slice(0,10).map(r=>({
                    name: r.asesor.split(' ').slice(0,2).join(' '),
                    Ventas: r.ventas, Comisión: r.comision,
                  }))}
                  layout="vertical" margin={{top:5,right:40,left:130,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" horizontal={false}/>
                  <XAxis type="number" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>fmtCOP(v)}/>
                  <YAxis type="category" dataKey="name" tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={125}/>
                  <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:11,color:'#718096'}}/>
                  <Bar dataKey="Ventas" radius={[0,4,4,0]}>
                    {datos39.slice(0,10).map((_,i)=><Cell key={i} fill={PALETA[i%12]}/>)}
                  </Bar>
                  <Bar dataKey="Comisión" fill="#F6AD55" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            {/* Tabla completa sede */}
            <Panel>
              <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
                Ranking completo — {sedeNombre} — {datos39.length} asesores
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-brand-border">
                    {['#','Asesor','Ventas','Comisión','% Comisión','Barra'].map(h=>(
                      <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {datos39.map((r,i)=>(
                      <tr key={r.asesor} className="border-b border-brand-border/40 hover:bg-brand-surface/50">
                        <td className="py-2 pr-4">
                          <span className={`text-xs font-bold font-mono ${r.pos<=3?'text-yellow-400':'text-brand-subtle'}`}>
                            {r.pos<=3?['🥇','🥈','🥉'][r.pos-1]:r.pos}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-xs font-medium text-brand-text">{r.asesor}</td>
                        <td className="py-2 pr-4 font-mono text-xs font-semibold" style={{color:PALETA[i%12]}}>{fmtCOP(r.ventas)}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-yellow-400">{fmtCOP(r.comision)}</td>
                        <td className="py-2 pr-4 font-mono text-xs" style={{color:r.pctCom>12?'#FC8181':r.pctCom>9?'#F6AD55':'#68D391'}}>{fmtPct(r.pctCom)}</td>
                        <td className="py-2 pr-4">
                          <div className="w-28 h-2 bg-brand-border rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${(r.ventas/maxV)*100}%`,background:PALETA[i%12]}}/>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )
      })}

      {/* TAB: Histórico */}
      {tab==='historico'&&(
        <div className="space-y-6">
          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
              Evolución histórica por asesor — top 15 por ventas en {anio}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-brand-border">
                  <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Asesor</th>
                  {YEARS.map(y=>(
                    <th key={y} className="text-right font-mono text-xs pb-3 pr-4 whitespace-nowrap" style={{color:COLORES_AÑO[y]}}>{y}</th>
                  ))}
                  <th className="text-right font-mono text-xs pb-3 text-brand-subtle">Var. {anio-1}→{anio}</th>
                </tr></thead>
                <tbody>
                  {historico.map((r:any,i:number)=>{
                    const prev = r[anio-1]||0
                    const curr = r[anio]||0
                    const varV = prev>0?((curr-prev)/prev)*100:null
                    return(
                      <tr key={r.asesor} className="border-b border-brand-border/40 hover:bg-brand-surface/50">
                        <td className="py-2 pr-4 text-xs font-medium text-brand-text">{r.asesor}</td>
                        {YEARS.map(y=>(
                          <td key={y} className="py-2 pr-4 text-right font-mono text-xs" style={{color:COLORES_AÑO[y]}}>
                            {r[y]>0?fmtCOP(r[y]):'—'}
                          </td>
                        ))}
                        <td className="py-2 text-right font-mono text-xs">
                          {varV!==null
                            ? <span style={{color:varV>=0?'#68D391':'#FC8181'}}>{varV>=0?'↑':'↓'}{Math.abs(varV).toFixed(1)}%</span>
                            : <span className="text-brand-subtle">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel>
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
              Ventas totales por año — top 5 asesores históricos
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={YEARS.map(y=>{
                  const entry:any={name:y}
                  historico.slice(0,5).forEach((r:any)=>{
                    entry[r.asesor.split(' ')[0]] = r[y]||0
                  })
                  return entry
                })}
                margin={{top:5,right:10,left:10,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false}/>
                <XAxis dataKey="name" tick={{fill:'#718096',fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:'#718096',fontSize:10}} axisLine={false} tickLine={false} width={80} tickFormatter={v=>fmtCOP(v)}/>
                <Tooltip content={<TT/>}/><Legend wrapperStyle={{fontSize:10,color:'#718096'}}/>
                {historico.slice(0,5).map((r:any,i:number)=>(
                  <Bar key={r.asesor} dataKey={r.asesor.split(' ')[0]} fill={PALETA[i]} radius={[4,4,0,0]}/>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Datos desde Supabase · Facturación Accesorios 2023-2026
      </p>
    </div>
  )
}
