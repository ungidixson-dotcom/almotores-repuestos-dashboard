'use client'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Line,
} from 'recharts'
import {
  RefreshCw, Target, TrendingUp, Car, ShoppingBag,
  AlertTriangle, Trophy, Medal, Award,
} from 'lucide-react'

// ── Constantes ────────────────────────────────────────────────────────────────
const COLORES_SEDE: Record<string, string> = {
  'Norte': '#4FD1C5', 'Pasoancho': '#E8A33D',
  'Calle 9': '#60A5FA', 'Pance': '#A78BFA',
}
const MESES_SHORT = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const FESTIVOS_CO = new Set([
  '2026-01-01','2026-01-12','2026-03-23','2026-04-02','2026-04-03',
  '2026-05-01','2026-05-18','2026-06-08','2026-06-29','2026-07-20',
  '2026-08-07','2026-08-17','2026-10-12','2026-11-02','2026-11-16',
  '2026-12-08','2026-12-25',
])

// ── Utilidades ────────────────────────────────────────────────────────────────
const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
const fmtM = (n: number) =>
  n >= 1e9 ? `$${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(0)}M` : `$${(n/1e3).toFixed(0)}K`
const fmtPct = (n: number) => `${(n||0).toFixed(1)}%`

const esDiaHabil = (d: Date) => {
  const iso = d.toISOString().slice(0,10)
  return d.getDay() !== 0 && d.getDay() !== 6 && !FESTIVOS_CO.has(iso)
}
const diasHabilesEnMes = (a: number, m: number) => {
  const d = new Date(a, m-1, 1); let c = 0
  while (d.getMonth()===m-1) { if(esDiaHabil(d)) c++; d.setDate(d.getDate()+1) }
  return c
}
const diasHabilesHasta = (a: number, m: number, dia: number) => {
  const d = new Date(a, m-1, 1); let c = 0
  while (d.getDate()<=dia && d.getMonth()===m-1) { if(esDiaHabil(d)) c++; d.setDate(d.getDate()+1) }
  return c
}

const semaforo = (pct: number) =>
  pct >= 100 ? { color: '#4FD1C5', label: 'Óptimo' } :
  pct >= 80  ? { color: '#E8A33D', label: 'Aceptable' } :
               { color: '#E5484D', label: 'Deficiente' }

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Meta { sede: string; meta_vehiculos: number; ticket_promedio: number; meta_asesor: number; meta_neta: number }
interface FilaSede {
  sede: string; mes_num: number; neto_accesorios: number
  vehiculos_vendidos: number; vehiculos_con_accesorios: number
  ticket_real: number | null
}
interface FilaAsesor {
  sede: string; asesor: string; neto_accesorios: number
  vehiculos_vendidos: number; ticket_promedio: number | null
}
interface FilaDiario { fecha: string; sede: string; neto_dia: number; vehiculos_dia: number }
interface FilaPance { neto: number; placa: string | null }
interface FilaAsesorPance { asesor: string; neto: number; facturas: number }

// ── Componentes helper ────────────────────────────────────────────────────────
function Panel({ children, className='' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-brand-surface border border-brand-border rounded-xl p-5 ${className}`}>{children}</div>
}
function KpiCard({ icon, label, value, hint, color='#4FD1C5', small=false }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; color?: string; small?: boolean
}) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 relative overflow-hidden">
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:color }}/>
      <div className="flex items-center gap-2 text-brand-subtle mb-2">{icon}<span className="text-xs">{label}</span></div>
      <div className={`font-title font-bold ${small?'text-lg':'text-2xl'}`} style={{ color }}>{value}</div>
      {hint && <p className="text-brand-muted text-xs mt-1 font-mono">{hint}</p>}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function TicketPromedioPage() {
  const router = useRouter()
  const hoy = new Date()

  const [filtroAnio, setFiltroAnio] = useState(hoy.getFullYear())
  const [filtroMes,  setFiltroMes]  = useState(hoy.getMonth()+1)
  const [filtroSede, setFiltroSede] = useState('Todas')

  const [metas,     setMetas]     = useState<Meta[]>([])
  const [dataSede,  setDataSede]  = useState<FilaSede[]>([])
  const [dataAsesor,setDataAsesor]= useState<FilaAsesor[]>([])
  const [dataDiario,setDataDiario]= useState<FilaDiario[]>([])
  const [dataPance,       setDataPance]       = useState<FilaPance[]>([])
  const [asesoresPance,     setAsesoresPance]     = useState<FilaAsesorPance[]>([])
  const [asesoresPanceVeh,  setAsesoresPanceVeh]  = useState<FilaAsesor[]>([])
  const [loading,   setLoading]   = useState(true)
  const [ultimaAct, setUltimaAct] = useState<Date|null>(null)
  const [countdown, setCountdown] = useState(1800)

  const cargar = useCallback(async (verificarAuth=false) => {
    if (verificarAuth) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
    }
    const [rMetas, rSede, rAsesor, rDiario, rPance, rAsesorPance, rAsesorPanceVeh] = await Promise.all([
      supabase.from('metas_accesorios')
        .select('sede,meta_vehiculos,ticket_promedio,meta_asesor')
        .eq('anio', filtroAnio).eq('mes_num', filtroMes),
      supabase.from('v_ticket_real_sede')
        .select('sede,mes_num,neto_accesorios,vehiculos_vendidos,vehiculos_con_accesorios,ticket_real,ticket_parcial,pct_vs_meta')
        .eq('anio', filtroAnio),
      supabase.from('v_ticket_promedio')
        .select('sede,asesor,neto_accesorios,vehiculos_vendidos,ticket_promedio,pct_vs_meta')
        .eq('anio', filtroAnio).eq('mes_num', filtroMes),
      supabase.from('v_comisiones_acc_diario')
        .select('fecha,sede,neto_dia,vehiculos_dia')
        .gte('fecha', `${filtroAnio}-01-01`).lte('fecha', `${filtroAnio}-12-31`),
      supabase.from('comisiones_acc_detalle')
        .select('neto,placa')
        .eq('anio', filtroAnio).eq('mes_num', filtroMes).eq('vitrina','Pance'),
      supabase.from('comisiones_acc_detalle')
        .select('asesor,neto')
        .eq('anio', filtroAnio).eq('mes_num', filtroMes).eq('vitrina','Pance'),
      supabase.from('v_ticket_promedio_pance')
        .select('asesor,neto_accesorios,vehiculos_vendidos,ticket_promedio')
        .eq('anio', filtroAnio).eq('mes_num', filtroMes),
    ])
    const rawMetas = (rMetas.data || []) as any[]
    setMetas(rawMetas.map(m => ({
      ...m,
      meta_neta: m.meta_vehiculos * m.ticket_promedio,
    })))
    setDataSede((rSede.data || []) as FilaSede[])
    setDataAsesor((rAsesor.data || []) as FilaAsesor[])
    setDataDiario((rDiario.data || []) as FilaDiario[])
    setDataPance((rPance.data || []) as FilaPance[])
    const rawAsesorPance = (rAsesorPance.data || []) as {asesor:string;neto:number}[]
    const mapaAP: Record<string,{neto:number;facturas:number}> = {}
    rawAsesorPance.forEach(r => {
      const k = r.asesor || 'Sin asesor'
      if (!mapaAP[k]) mapaAP[k] = {neto:0,facturas:0}
      mapaAP[k].neto += r.neto
      mapaAP[k].facturas += 1
    })
    setAsesoresPance(Object.entries(mapaAP).map(([asesor,d])=>({asesor,...d})).sort((a,b)=>b.neto-a.neto))
    setAsesoresPanceVeh((rAsesorPanceVeh.data || []) as FilaAsesor[])
    setUltimaAct(new Date())
    setLoading(false)
  }, [filtroAnio, filtroMes, router])

  useEffect(() => { cargar(true) }, [cargar])
  useEffect(() => {
    const iv = setInterval(() => setCountdown(c => { if(c<=1){cargar(false);return 1800} return c-1 }), 1000)
    return () => clearInterval(iv)
  }, [cargar])

  // ── Días hábiles ─────────────────────────────────────────────────────────
  const totalDH  = useMemo(() => diasHabilesEnMes(filtroAnio, filtroMes), [filtroAnio, filtroMes])
  const dhTransc = useMemo(() => {
    if (filtroAnio === hoy.getFullYear() && filtroMes === hoy.getMonth()+1)
      return diasHabilesHasta(filtroAnio, filtroMes, hoy.getDate())
    return totalDH
  }, [filtroAnio, filtroMes, totalDH])
  const dhRest = totalDH - dhTransc

  // ── Meta del mes activo ───────────────────────────────────────────────────
  const getMeta = (sede: string): Meta | null =>
    metas.find(m => m.sede === sede) || null

  // ── Datos filtrados por sede ──────────────────────────────────────────────
  const sedeActual = useMemo(() =>
    dataSede.filter(r => r.mes_num === filtroMes && (filtroSede==='Todas' || r.sede===filtroSede))
  , [dataSede, filtroMes, filtroSede])

  const asesoresF = useMemo(() =>
    dataAsesor.filter(r => filtroSede==='Todas' || filtroSede==='Pance' || r.sede===filtroSede)
  , [dataAsesor, filtroSede])

  // ── KPIs Pance ────────────────────────────────────────────────────────────
  const kpiPance = useMemo(() => {
    const neto = dataPance.reduce((s,r) => s+(r.neto||0), 0)
    const vehs = new Set(dataPance.map(r=>r.placa).filter(Boolean)).size
    const metaPance = getMeta('Pance')
    return {
      neto, vehs,
      ticket: vehs > 0 ? neto/vehs : 0,
      metaNeta: metaPance?.meta_neta || 0,
      metaVeh:  metaPance?.meta_vehiculos || 0,
      ticketMeta: metaPance?.ticket_promedio || 0,
    }
  }, [dataPance, metas])

  // ── Proyección por sede ───────────────────────────────────────────────────
  const calcProyeccion = (neto: number, vehs: number, meta: Meta | null) => {
    if (!dhTransc || !meta) return null
    const ritmoNeto = neto / dhTransc
    const ritmoVeh  = vehs / dhTransc
    const proyNeto = neto + ritmoNeto * dhRest
    const proyVeh  = Math.round(vehs + ritmoVeh * dhRest)
    const proyTicket = proyVeh > 0 ? proyNeto / proyVeh : 0
    return {
      proyNeto, proyVeh, proyTicket,
      pctProy: meta.meta_neta > 0 ? (proyNeto/meta.meta_neta)*100 : 0,
    }
  }

  // ── Acumulado diario mes activo ───────────────────────────────────────────
  const acumDiario = useMemo(() => {
    const mesStr = String(filtroMes).padStart(2,'0')
    const filtrado = dataDiario.filter(r =>
      r.fecha.startsWith(`${filtroAnio}-${mesStr}`) &&
      (filtroSede==='Todas' || r.sede===filtroSede || (filtroSede==='Pance' && r.sede==='Calle 9'))
    )
    const porFecha: Record<string, {neto:number;vehs:number}> = {}
    filtrado.forEach(r => {
      if (!porFecha[r.fecha]) porFecha[r.fecha] = {neto:0,vehs:0}
      porFecha[r.fecha].neto += r.neto_dia||0
      porFecha[r.fecha].vehs += r.vehiculos_dia||0
    })
    let acumNeto=0, acumVehs=0
    return Object.entries(porFecha).sort(([a],[b])=>a.localeCompare(b)).map(([fecha,v]) => {
      acumNeto += v.neto; acumVehs += v.vehs
      return {
        dia: parseInt(fecha.split('-')[2]),
        neto_dia: v.neto,
        ticket_acum: acumVehs>0 ? Math.round(acumNeto/acumVehs) : 0,
        ticket_dia:  v.vehs>0   ? Math.round(v.neto/v.vehs)    : 0,
      }
    })
  }, [dataDiario, filtroAnio, filtroMes, filtroSede])

  // ── Rankings ──────────────────────────────────────────────────────────────
  const rankingNeto   = useMemo(() => [...asesoresF].sort((a,b)=>(b.neto_accesorios||0)-(a.neto_accesorios||0)).slice(0,5), [asesoresF])
  const rankingTicket = useMemo(() => [...asesoresF].filter(a=>(a.vehiculos_vendidos||0)>0).sort((a,b)=>(b.ticket_promedio||0)-(a.ticket_promedio||0)).slice(0,5), [asesoresF])
  const rankingNetoPorSede = useMemo(() => {
    const sedes = ['Norte','Pasoancho','Calle 9']
    const res: Record<string, FilaAsesor[]> = {}
    sedes.forEach(s => {
      res[s] = [...dataAsesor.filter(a=>a.sede===s)].sort((a,b)=>(b.neto_accesorios||0)-(a.neto_accesorios||0)).slice(0,5)
    })
    return res
  }, [dataAsesor])
  const rankingTicketPorSede = useMemo(() => {
    const sedes = ['Norte','Pasoancho','Calle 9']
    const res: Record<string, FilaAsesor[]> = {}
    sedes.forEach(s => {
      res[s] = [...dataAsesor.filter(a=>a.sede===s&&(a.vehiculos_vendidos||0)>0)].sort((a,b)=>(b.ticket_promedio||0)-(a.ticket_promedio||0)).slice(0,5)
    })
    return res
  }, [dataAsesor])

  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center flex-col gap-3">
      <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin"/>
      <p className="text-brand-subtle font-mono text-xs">Cargando ticket promedio...</p>
    </div>
  )

  const mesNombre = MESES_SHORT[filtroMes]
  const ticketMetaGlobal = metas.length > 0 ? metas[0].ticket_promedio : 2200000

  const iconoRanking = (i: number): React.ReactNode =>
    i===0 ? (<Trophy size={14} className="text-yellow-400"/>) :
    i===1 ? (<Medal size={14} className="text-gray-400"/>) :
    i===2 ? (<Award size={14} className="text-amber-600"/>) :
            (<span className="text-brand-muted font-mono text-xs w-3.5 text-center">{i+1}</span>)

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* TOP BAR */}
      <div className="border-b border-brand-border bg-brand-surface/50 px-6 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-brand-teal animate-pulse"/>
          <span className="font-mono text-xs text-brand-subtle uppercase tracking-widest">Ticket Promedio Accesorios</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { cargar(false); setCountdown(1800) }}
            className="flex items-center gap-1.5 text-xs font-mono text-brand-subtle hover:text-brand-teal transition-colors border border-brand-border rounded-lg px-2.5 py-1">
            <RefreshCw size={12}/> Actualizar
          </button>
          <span className="text-brand-muted font-mono text-xs">
            Auto en {Math.floor(countdown/60)}:{String(countdown%60).padStart(2,'0')}
          </span>
          {ultimaAct && <span className="text-brand-muted font-mono text-xs hidden md:block">{ultimaAct.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</span>}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* TÍTULO */}
        <div>
          <h1 className="font-title text-2xl font-bold text-brand-text">Ticket Promedio · Accesorios</h1>
          <p className="text-brand-subtle text-sm mt-1">
            Meta: {fmtCOP(ticketMetaGlobal)} por vehículo · Meta asesor: {fmtCOP(metas[0]?.meta_asesor||11500000)} · {filtroAnio}
            {metas.length === 0 && <span className="text-brand-red ml-2">⚠ Sin metas configuradas para este mes</span>}
          </p>
        </div>

        {/* FILTROS */}
        <div className="flex flex-wrap gap-2 p-4 bg-brand-surface border border-brand-border rounded-xl">
          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Sede</span>
            <div className="flex rounded-lg border border-brand-border overflow-hidden">
              {['Todas','Norte','Pasoancho','Calle 9','Pance'].map(s => (
                <button key={s} onClick={() => setFiltroSede(s)}
                  className={`px-3 py-1.5 text-xs font-mono transition-colors ${filtroSede===s?'text-black font-semibold':'text-brand-subtle hover:text-brand-text'}`}
                  style={filtroSede===s ? { background: s==='Todas'?'#4FD1C5':(COLORES_SEDE[s]||'#4FD1C5') } : {}}>
                  {s}
                </button>
              ))}
            </div>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Mes</span>
            <select value={filtroMes} onChange={e=>setFiltroMes(Number(e.target.value))}
              className="bg-brand-bg border border-brand-teal/50 rounded-lg px-3 py-1.5 text-brand-teal text-sm font-mono font-semibold outline-none">
              {Array.from({length:12},(_,i)=>i+1).map(m => (
                <option key={m} value={m}>{MESES_SHORT[m]}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Año</span>
            <select value={filtroAnio} onChange={e=>setFiltroAnio(Number(e.target.value))}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm font-mono outline-none">
              {[2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <div className="ml-auto flex items-center gap-3 text-xs font-mono text-brand-subtle">
            <span>📅 {dhTransc}/{totalDH} días hábiles</span>
            <span className="text-brand-muted">({dhRest} restantes)</span>
          </div>
        </div>

        {/* TARJETAS POR SEDE */}
        {filtroSede !== 'Pance' && (
          <div className={`grid gap-4 ${filtroSede==='Todas' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-3'}`}>
            {(['Norte','Pasoancho','Calle 9'] as const).filter(s => filtroSede==='Todas' || filtroSede===s).map(sede => {
              const row = sedeActual.find(r => r.sede===sede)
              const meta = getMeta(sede)
              const neto = row?.neto_accesorios||0
              const vehs = row?.vehiculos_vendidos||0
              const ticket = vehs>0 ? neto/vehs : 0
              const pctMeta = meta ? (ticket/meta.ticket_promedio)*100 : 0
              const pctVeh  = meta ? (vehs/meta.meta_vehiculos)*100 : 0
              const pctNeto = meta ? (neto/meta.meta_neta)*100 : 0
              const sem = semaforo(pctMeta)
              const proy = calcProyeccion(neto, vehs, meta)
              const necesarioDia = meta && dhRest>0 ? (meta.meta_neta - neto)/dhRest : 0
              return (
                <button key={sede} onClick={() => setFiltroSede(filtroSede===sede?'Todas':sede)}
                  className="rounded-xl border p-5 text-left transition-all hover:border-opacity-60"
                  style={filtroSede===sede
                    ? { borderColor: COLORES_SEDE[sede], background: `${COLORES_SEDE[sede]}10` }
                    : { borderColor: '#2A3340', background: '#0F1A24' }}>

                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: COLORES_SEDE[sede] }}/>
                      <p className="font-title font-semibold text-brand-text">{sede}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono text-white"
                      style={{ background: sem.color }}>{sem.label}</span>
                  </div>

                  {/* Ticket principal */}
                  <p className="font-mono text-[10px] text-brand-muted mb-0.5">Ticket real</p>
                  <p className="font-title font-bold text-2xl mb-1" style={{ color: sem.color }}>
                    {ticket>0 ? fmtCOP(ticket) : '—'}
                  </p>
                  {meta && (
                    <>
                      <div className="h-1.5 bg-brand-border rounded-full overflow-hidden mb-1">
                        <div className="h-full rounded-full" style={{ width:`${Math.min(pctMeta,100)}%`, background:sem.color }}/>
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-brand-muted mb-4">
                        <span>{fmtPct(pctMeta)} de {fmtCOP(meta.ticket_promedio)}</span>
                        <span style={{color:sem.color}}>{sem.label}</span>
                      </div>
                    </>
                  )}

                  {/* Grid métricas */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-brand-bg/50 rounded-lg p-2">
                      <p className="font-mono text-[9px] text-brand-muted">Vehículos</p>
                      <p className="font-mono text-sm font-bold text-brand-text">{vehs} / {meta?.meta_vehiculos||'—'}</p>
                      {meta && <p className="font-mono text-[9px]" style={{color:semaforo(pctVeh).color}}>{fmtPct(pctVeh)}</p>}
                    </div>
                    <div className="bg-brand-bg/50 rounded-lg p-2">
                      <p className="font-mono text-[9px] text-brand-muted">Neto</p>
                      <p className="font-mono text-xs font-bold" style={{color:COLORES_SEDE[sede]}}>{fmtCOP(neto)}</p>
                      {meta && <p className="font-mono text-[9px]" style={{color:semaforo(pctNeto).color}}>{fmtPct(pctNeto)}</p>}
                    </div>
                  </div>

                  {/* Meta neta */}
                  {meta && (
                    <div className="pt-3 border-t border-brand-border/50 space-y-1.5">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-brand-muted">Meta neta</span>
                        <span className="text-brand-subtle">{fmtCOP(meta.meta_neta)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-brand-muted">Falta</span>
                        <span className={meta.meta_neta-neto>0?'text-brand-red':'text-brand-teal'}>
                          {fmtCOP(Math.abs(meta.meta_neta-neto))} {meta.meta_neta-neto>0?'↓':'↑ SUPERADO'}
                        </span>
                      </div>
                      {dhRest>0 && necesarioDia>0 && (
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-brand-muted">Necesario/día</span>
                          <span className="text-brand-gold">{fmtCOP(necesarioDia)}</span>
                        </div>
                      )}
                      {proy && (
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-brand-muted">Proyección cierre</span>
                          <span style={{color:semaforo(proy.pctProy).color}}>{fmtPct(proy.pctProy)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              )
            })}

            {/* Tarjeta Pance */}
            {(filtroSede==='Todas') && (() => {
              const metaPance = getMeta('Pance')
              const pctVeh  = metaPance ? (kpiPance.vehs/metaPance.meta_vehiculos)*100 : 0
              const pctNeto = metaPance ? (kpiPance.neto/metaPance.meta_neta)*100 : 0
              const pctTick = metaPance ? (kpiPance.ticket/metaPance.ticket_promedio)*100 : 0
              const sem = semaforo(pctTick)
              return (
                <button onClick={() => setFiltroSede('Pance')}
                  className="rounded-xl border p-5 text-left transition-all"
                  style={{ borderColor:'#7C3AED40', background:'#A78BFA08' }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: '#A78BFA' }}/>
                      <p className="font-title font-semibold text-brand-text">Pance</p>
                      <span className="text-[9px] font-mono border border-brand-border text-brand-muted px-1 rounded">Vitrina</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono text-white" style={{background:sem.color}}>{sem.label}</span>
                  </div>
                  <p className="font-mono text-[10px] text-brand-muted mb-0.5">Ticket promedio</p>
                  <p className="font-title font-bold text-2xl mb-1" style={{color:sem.color}}>
                    {kpiPance.ticket>0?fmtCOP(kpiPance.ticket):'—'}
                  </p>
                  {metaPance && (
                    <>
                      <div className="h-1.5 bg-brand-border rounded-full overflow-hidden mb-3">
                        <div className="h-full rounded-full" style={{width:`${Math.min(pctTick,100)}%`,background:sem.color}}/>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-brand-bg/50 rounded-lg p-2">
                          <p className="font-mono text-[9px] text-brand-muted">Vehículos</p>
                          <p className="font-mono text-sm font-bold text-brand-text">{kpiPance.vehs} / {metaPance.meta_vehiculos}</p>
                          <p className="font-mono text-[9px]" style={{color:semaforo(pctVeh).color}}>{fmtPct(pctVeh)}</p>
                        </div>
                        <div className="bg-brand-bg/50 rounded-lg p-2">
                          <p className="font-mono text-[9px] text-brand-muted">Neto</p>
                          <p className="font-mono text-xs font-bold" style={{color:'#A78BFA'}}>{fmtCOP(kpiPance.neto)}</p>
                          <p className="font-mono text-[9px]" style={{color:semaforo(pctNeto).color}}>{fmtPct(pctNeto)}</p>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-brand-border/50 space-y-1.5">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-brand-muted">Meta neta</span>
                          <span className="text-brand-subtle">{fmtCOP(metaPance.meta_neta)}</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-brand-muted">Falta</span>
                          <span className={metaPance.meta_neta-kpiPance.neto>0?'text-brand-red':'text-brand-teal'}>
                            {fmtCOP(Math.abs(metaPance.meta_neta-kpiPance.neto))}
                          </span>
                        </div>
                        {dhRest>0 && metaPance.meta_neta>kpiPance.neto && (
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-brand-muted">Necesario/día</span>
                            <span className="text-brand-gold">{fmtCOP(Math.round((metaPance.meta_neta-kpiPance.neto)/dhRest))}</span>
                          </div>
                        )}
                        {dhTransc>0 && metaPance && (
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-brand-muted">Proyección cierre</span>
                            <span style={{color:semaforo(kpiPance.neto>0?Math.round((kpiPance.neto/dhTransc)*(dhTransc+dhRest)/metaPance.meta_neta*100):0).color}}>
                              {kpiPance.neto>0?fmtPct(Math.round((kpiPance.neto/dhTransc)*(dhTransc+dhRest)/metaPance.meta_neta*100)):'—'}
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </button>
              )
            })()}
          </div>
        )}

        {/* GRÁFICO ACUMULADO DIARIO */}
        {acumDiario.length>0 && (
          <Panel>
            <h3 className="font-title text-base font-semibold text-brand-text mb-1">
              Ticket acumulado diario — {mesNombre} {filtroAnio}
            </h3>
            <p className="text-xs text-brand-subtle mb-4">Área = ticket acumulado · línea = ticket del día · rojo = meta</p>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={acumDiario} margin={{left:0,right:16,top:8,bottom:0}}>
                <defs>
                  <linearGradient id="gAcum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4FD1C5" stopOpacity={0.4}/>
                    <stop offset="100%" stopColor="#4FD1C5" stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A36" vertical={false}/>
                <XAxis dataKey="dia" tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false}
                  tickFormatter={(v:number)=>v?fmtM(v):''}/>
                <ReferenceLine y={ticketMetaGlobal} stroke="#E5484D" strokeWidth={1.5} strokeDasharray="6 3"
                  label={{value:'Meta',fill:'#E5484D',fontSize:10,position:'right'}}/>
                <Tooltip
                  contentStyle={{background:'#0F1419',border:'1px solid #2A3340',borderRadius:10,fontSize:12}}
                  formatter={(v:number,n:string)=>[fmtCOP(v),n==='ticket_acum'?'Acumulado':'Del día']}/>
                <Area type="monotone" dataKey="ticket_acum" stroke="#4FD1C5" strokeWidth={2.5}
                  fill="url(#gAcum)" dot={false} activeDot={{r:5,strokeWidth:2,stroke:'#0F1419',fill:'#4FD1C5'}}/>
                <Line type="monotone" dataKey="ticket_dia" stroke="#E8A33D" strokeWidth={1.5}
                  strokeDasharray="4 3" dot={false}/>
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {/* TABLA ASESORES */}
        {filtroSede === 'Pance' && asesoresPance.length > 0 && (
          <Panel>
            <h3 className="font-title text-base font-semibold text-brand-text mb-1">Asesores · Pance</h3>
            <p className="text-xs text-brand-subtle mb-4">Vitrina Pance · {mesNombre} {filtroAnio}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border">
                    {['Asesor','Facturas','Neto accesorios'].map(h=>(
                      <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {asesoresPance.map((a,i)=>(
                    <tr key={i} className="border-b border-brand-border/40 hover:bg-brand-surface/50">
                      <td className="py-3 pr-4 text-brand-text font-medium">{a.asesor}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{a.facturas}</td>
                      <td className="py-3 font-mono text-sm font-bold" style={{color:'#A78BFA'}}>{fmtCOP(a.neto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {asesoresF.length > 0 && filtroSede !== 'Pance' && (
          <Panel>
            <h3 className="font-title text-base font-semibold text-brand-text mb-1">Seguimiento por asesor</h3>
            <p className="text-xs text-brand-subtle mb-4">Meta asesor: {fmtCOP(metas[0]?.meta_asesor||11500000)}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border">
                    {['Asesor','Sede','Neto','Veh. vendidos','Ticket promedio','% vs Meta','Estado'].map(h=>(
                      <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {asesoresF.sort((a,b)=>(b.neto_accesorios||0)-(a.neto_accesorios||0)).map((a,i)=>{
                    const metaAsesor = metas[0]?.meta_asesor || 11500000
                    const pctA = metaAsesor>0 ? ((a.neto_accesorios||0)/metaAsesor)*100 : 0
                    const semA = semaforo(pctA)
                    const ticketMeta = metas.find(m=>m.sede===a.sede)?.ticket_promedio || ticketMetaGlobal
                    const pctT = ticketMeta>0 && a.ticket_promedio ? (a.ticket_promedio/ticketMeta)*100 : 0
                    return (
                      <tr key={`${a.asesor}-${i}`} className="border-b border-brand-border/40 hover:bg-brand-surface/50">
                        <td className="py-3 pr-4 text-brand-text font-medium">{a.asesor}</td>
                        <td className="py-3 pr-4">
                          <span className="font-mono text-xs px-2 py-0.5 rounded-full"
                            style={{color:COLORES_SEDE[a.sede],background:`${COLORES_SEDE[a.sede]}15`}}>{a.sede}</span>
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs font-semibold" style={{color:semA.color}}>{fmtCOP(a.neto_accesorios||0)}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{a.vehiculos_vendidos||0}</td>
                        <td className="py-3 pr-4 font-mono text-sm font-bold" style={{color:pctT>=100?'#4FD1C5':pctT>=80?'#E8A33D':'#E5484D'}}>
                          {a.ticket_promedio?fmtCOP(a.ticket_promedio):'—'}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-brand-border rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{width:`${Math.min(pctA,100)}%`,background:semA.color}}/>
                            </div>
                            <span className="font-mono text-xs" style={{color:semA.color}}>{fmtPct(pctA)}</span>
                          </div>
                        </td>
                        <td className="py-3 font-mono text-xs" style={{color:semA.color}}>{semA.label}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* RANKINGS */}
        <div className="space-y-4">
          <h2 className="font-title text-lg font-bold text-brand-text">🏆 Rankings — {mesNombre} {filtroAnio}</h2>

          {/* Top 5 Global */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              { titulo: 'Top 5 Global · Mayor Neto', data: rankingNeto, campo: 'neto_accesorios' as const, fmt: fmtCOP },
              { titulo: 'Top 5 Global · Mayor Ticket', data: rankingTicket, campo: 'ticket_promedio' as const, fmt: fmtCOP },
            ].map(({ titulo, data, campo, fmt }) => (
              <Panel key={titulo}>
                <h3 className="font-title text-sm font-semibold text-brand-text mb-4">{titulo}</h3>
                <div className="space-y-2">
                  {data.map((a, i) => (
                    <div key={`${a.asesor}-${i}`} className="flex items-center gap-3 p-2 rounded-lg bg-brand-bg/50">
                      <div className="w-6 flex justify-center shrink-0">{iconoRanking(i)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-brand-text text-xs font-medium truncate">{a.asesor}</p>
                        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
                          style={{color:COLORES_SEDE[a.sede],background:`${COLORES_SEDE[a.sede]}15`}}>{a.sede}</span>
                      </div>
                      <p className="font-mono text-xs font-bold text-brand-teal shrink-0">{fmt(a[campo]||0)}</p>
                    </div>
                  ))}
                  {data.length===0 && <p className="text-brand-muted text-xs font-mono text-center py-4">Sin datos con vehículos vendidos</p>}
                </div>
              </Panel>
            ))}
          </div>

          {/* Top 5 por Sede */}
          {(filtroSede === 'Todas' || filtroSede === 'Pance') && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {filtroSede !== 'Pance' && (['Norte','Pasoancho','Calle 9'] as const).map(sede => (
                <Panel key={sede}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full" style={{background:COLORES_SEDE[sede]}}/>
                    <h3 className="font-title text-sm font-semibold text-brand-text">{sede}</h3>
                  </div>
                  <p className="font-mono text-[9px] text-brand-subtle uppercase mb-2">Por Neto</p>
                  <div className="space-y-1.5 mb-4">
                    {rankingNetoPorSede[sede].map((a,i) => (
                      <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-brand-bg/50">
                        <div className="w-5 flex justify-center shrink-0">{iconoRanking(i)}</div>
                        <p className="text-brand-text text-[10px] flex-1 truncate">{a.asesor}</p>
                        <p className="font-mono text-[10px] font-bold text-brand-teal">{fmtM(a.neto_accesorios||0)}</p>
                      </div>
                    ))}
                  </div>
                  <p className="font-mono text-[9px] text-brand-subtle uppercase mb-2">Por Ticket</p>
                  <div className="space-y-1.5">
                    {rankingTicketPorSede[sede].map((a,i) => (
                      <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-brand-bg/50">
                        <div className="w-5 flex justify-center shrink-0">{iconoRanking(i)}</div>
                        <p className="text-brand-text text-[10px] flex-1 truncate">{a.asesor}</p>
                        <p className="font-mono text-[10px] font-bold" style={{color:COLORES_SEDE[sede]}}>{fmtM(a.ticket_promedio||0)}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              ))}
              <Panel>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{background:'#A78BFA'}}/>
                  <h3 className="font-title text-sm font-semibold text-brand-text">Pance · Top 3</h3>
                </div>
                <p className="font-mono text-[9px] text-brand-subtle uppercase mb-2">Por Neto</p>
                <div className="space-y-1.5 mb-3">
                  {asesoresPance.slice(0,3).map((a,i)=>(
                    <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-brand-bg/50">
                      <div className="w-5 flex justify-center shrink-0">{iconoRanking(i)}</div>
                      <p className="text-brand-text text-[10px] flex-1 truncate">{a.asesor}</p>
                      <p className="font-mono text-[10px] font-bold" style={{color:'#A78BFA'}}>{fmtCOP(a.neto||0)}</p>
                    </div>
                  ))}
                </div>
                <p className="font-mono text-[9px] text-brand-subtle uppercase mb-2">Por Ticket</p>
                <div className="space-y-1.5">
                  {(asesoresPanceVeh.length>0?asesoresPanceVeh:asesoresPance).filter(a=>((a as any).ticket_promedio||0)>0).sort((a,b)=>((b as any).ticket_promedio||0)-((a as any).ticket_promedio||0)).slice(0,3).map((a,i)=>(
                    <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-brand-bg/50">
                      <div className="w-5 flex justify-center shrink-0">{iconoRanking(i)}</div>
                      <p className="text-brand-text text-[10px] flex-1 truncate">{a.asesor}</p>
                      <p className="font-mono text-[10px] font-bold" style={{color:'#A78BFA'}}>{fmtCOP((a as any).ticket_promedio||(a as any).neto||(a as any).neto_accesorios||0)}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
