'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import {
  ArrowLeft, TrendingUp, TrendingDown, Gavel, CheckCircle, DollarSign,
  Percent, Award, AlertTriangle, Building2, User,
} from 'lucide-react'
import { KpiCard, Panel, fmtCOP, fmtM, fmtPct } from '@/components/dashboard-ui'

// ── Tipos ─────────────────────────────────────────────────────────────────────
type HistoricoRow  = { anio: number; mes_num: number; mes: string; total_subastas: number; ganadas: number; no_autorizadas: number; valor_autorizado: number; valor_subastado: number }
type SubastaRow    = { id: number; placa: string | null; marca: string | null; aseguradora_id: number | null; asesor_id: number | null; estado_autorizacion: string | null; valor_subastado: number | null; valor_autorizado: number | null; fecha_subasta: string | null; anio: number | null }
type Aseguradora   = { id: number; nombre_corto: string }
type Asesor        = { id: number; nombre: string }

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

const normMarca = (raw: string | null | undefined): string => {
  if (!raw) return 'Sin marca'
  const k = raw.trim().toLowerCase()
  const MAP: Record<string,string> = { kia:'Kia', vw:'VW', jac:'Jac', renault:'Renault' }
  return MAP[k] || (k.charAt(0).toUpperCase() + k.slice(1))
}
const esGanada = (e: string | null) => e === 'Autorizada Completa' || e === 'Autorizada parcial'

// ── VarTag ────────────────────────────────────────────────────────────────────
const VarTag = ({ v }: { v: number }) => (
  <span className={`inline-flex items-center gap-1 text-xs font-mono ${v >= 0 ? 'text-brand-teal' : 'text-brand-red'}`}>
    {v >= 0 ? <TrendingUp size={11}/> : <TrendingDown size={11}/>} {fmtPct(Math.abs(v))}
  </span>
)

// ── Tabla de desglose (aseguradora / asesor) ──────────────────────────────────
type DesgloseRow = { nombre: string; subObj: number; subComp: number; ganObj: number; ganComp: number; valObj: number; valComp: number }

function TablaDesglose({ titulo, icono, filas, anioObj, anioComp }: {
  titulo: string; icono: React.ReactNode
  filas: DesgloseRow[]; anioObj: number; anioComp: number
}) {
  return (
    <Panel title={titulo} sub={`${anioObj} vs ${anioComp} · subastas, conversión y facturación`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-border">
              <th className="text-left font-mono text-[10px] text-brand-subtle uppercase tracking-wider pb-3 pr-4">
                <span className="inline-flex items-center gap-1">{icono} Nombre</span>
              </th>
              {[`Sub. ${anioObj}`,`Sub. ${anioComp}`,'Var.','%Conv. actual','%Conv. ant.','Var. pp',`Factur. ${anioObj}`,`Factur. ${anioComp}`,'Var. $'].map(h => (
                <th key={h} className="text-right font-mono text-[10px] text-brand-subtle uppercase tracking-wider pb-3 pr-3 last:pr-0">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const varSub  = f.subComp  ? ((f.subObj  - f.subComp)  / f.subComp)  * 100 : null
              const varVal  = f.valComp  ? ((f.valObj  - f.valComp)  / f.valComp)  * 100 : null
              const convObj  = f.subObj  ? (f.ganObj  / f.subObj)  * 100 : 0
              const convComp = f.subComp ? (f.ganComp / f.subComp) * 100 : 0
              const varConv  = convObj - convComp
              return (
                <tr key={f.nombre} className="border-b border-brand-border/40 hover:bg-brand-bg/50 transition-colors">
                  <td className="py-2.5 pr-4 text-brand-text font-medium">{f.nombre}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-brand-text">{f.subObj || '—'}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-brand-muted">{f.subComp || '—'}</td>
                  <td className="py-2.5 pr-3 text-right">{varSub !== null ? <VarTag v={varSub}/> : <span className="text-brand-muted">—</span>}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-brand-text">{f.subObj ? fmtPct(convObj) : '—'}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-brand-muted">{f.subComp ? fmtPct(convComp) : '—'}</td>
                  <td className="py-2.5 pr-3 text-right">
                    {f.subObj && f.subComp ? (
                      <span className={`text-xs font-mono ${varConv >= 0 ? 'text-brand-teal' : 'text-brand-red'}`}>
                        {varConv >= 0 ? '+' : ''}{varConv.toFixed(1)} pp
                      </span>
                    ) : <span className="text-brand-muted">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-brand-text">{f.valObj ? fmtM(f.valObj) : '—'}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-brand-muted">{f.valComp ? fmtM(f.valComp) : '—'}</td>
                  <td className="py-2.5 text-right">{varVal !== null ? <VarTag v={varVal}/> : <span className="text-brand-muted">—</span>}</td>
                </tr>
              )
            })}
            {filas.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-brand-subtle text-sm">Sin datos en este rango</td></tr>
            )}
          </tbody>
          {filas.length > 0 && (() => {
            const totSubObj  = filas.reduce((a,f) => a + f.subObj,  0)
            const totSubComp = filas.reduce((a,f) => a + f.subComp, 0)
            const totGanObj  = filas.reduce((a,f) => a + f.ganObj,  0)
            const totGanComp = filas.reduce((a,f) => a + f.ganComp, 0)
            const totValObj  = filas.reduce((a,f) => a + f.valObj,  0)
            const totValComp = filas.reduce((a,f) => a + f.valComp, 0)
            const varSub = totSubComp  ? ((totSubObj - totSubComp) / totSubComp) * 100 : null
            const varVal = totValComp  ? ((totValObj - totValComp) / totValComp) * 100 : null
            const cObj   = totSubObj   ? (totGanObj  / totSubObj)  * 100 : 0
            const cComp  = totSubComp  ? (totGanComp / totSubComp) * 100 : 0
            return (
              <tfoot>
                <tr className="border-t-2 border-brand-border bg-brand-surface">
                  <td className="py-2.5 pr-4 text-brand-text font-semibold font-mono text-xs uppercase">TOTAL</td>
                  <td className="py-2.5 pr-3 text-right font-mono font-semibold text-brand-text">{totSubObj}</td>
                  <td className="py-2.5 pr-3 text-right font-mono font-semibold text-brand-muted">{totSubComp}</td>
                  <td className="py-2.5 pr-3 text-right">{varSub !== null ? <VarTag v={varSub}/> : '—'}</td>
                  <td className="py-2.5 pr-3 text-right font-mono font-semibold text-brand-text">{fmtPct(cObj)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono font-semibold text-brand-muted">{fmtPct(cComp)}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <span className={`text-xs font-mono font-semibold ${(cObj-cComp) >= 0 ? 'text-brand-teal' : 'text-brand-red'}`}>
                      {(cObj-cComp) >= 0 ? '+' : ''}{(cObj-cComp).toFixed(1)} pp
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono font-semibold text-brand-text">{fmtM(totValObj)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono font-semibold text-brand-muted">{fmtM(totValComp)}</td>
                  <td className="py-2.5 text-right">{varVal !== null ? <VarTag v={varVal}/> : '—'}</td>
                </tr>
              </tfoot>
            )
          })()}
        </table>
      </div>
    </Panel>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function ComparativoPeriodosPage() {
  const [loading, setLoading]           = useState(true)
  const [historico, setHistorico]       = useState<HistoricoRow[]>([])
  const [subastas, setSubastas]         = useState<SubastaRow[]>([])
  const [aseguradoras, setAseguradoras] = useState<Aseguradora[]>([])
  const [asesores, setAsesores]         = useState<Asesor[]>([])

  // Filtros
  const [anioObjetivo, setAnioObjetivo]         = useState(0)       // 0 = auto
  const [mesInicio, setMesInicio]               = useState(1)
  const [mesFin, setMesFin]                     = useState(7)
  const [filtroMarca, setFiltroMarca]           = useState('todas')
  const [filtroAseguradora, setFiltroAseguradora] = useState(0)     // 0 = todas
  const [inicializado, setInicializado]         = useState(false)

  useEffect(() => {
    async function fetchData() {
      const [{ data: rh }, { data: sub }, { data: aseg }, { data: ases }] = await Promise.all([
        supabase.from('resumen_historico_subastas').select('*').order('anio,mes_num'),
        supabase.from('subastas').select('id,placa,marca,aseguradora_id,asesor_id,estado_autorizacion,valor_subastado,valor_autorizado,fecha_subasta,anio').order('anio', {ascending: false}).limit(25000),
        supabase.from('aseguradoras').select('id,nombre_corto').order('nombre_corto'),
        supabase.from('asesores').select('id,nombre').order('nombre'),
      ])
      setHistorico((rh as HistoricoRow[]) || [])
      setSubastas((sub as SubastaRow[]) || [])
      setAseguradoras((aseg as Aseguradora[]) || [])
      setAsesores((ases as Asesor[]) || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  // Realtime: recarga cuando el Apps Script sincroniza datos
  useEffect(()=>{
    const refetch = () => {
      supabase.from('resumen_historico_subastas').select('*').order('anio,mes_num')
        .then(({data})=>{ if(data) setHistorico(data as HistoricoRow[]) })
      supabase.from('subastas')
        .select('id,placa,marca,aseguradora_id,asesor_id,estado_autorizacion,valor_subastado,valor_autorizado,fecha_subasta,anio')
        .order('anio', {ascending: false})
        .limit(25000)
        .then(({data})=>{ if(data) setSubastas(data as SubastaRow[]) })
    }
    const chSub  = supabase.channel('cmp-rt-subastas').on('postgres_changes',{event:'*',schema:'public',table:'subastas'},  refetch).subscribe()
    const chHist = supabase.channel('cmp-rt-historico').on('postgres_changes',{event:'*',schema:'public',table:'resumen_historico_subastas'}, refetch).subscribe()
    return ()=>{ supabase.removeChannel(chSub); supabase.removeChannel(chHist) }
  },[])

  // ── Agrupar histórico en estructura anio → mesNum → stats ─────────────────
  // El año actual (2026) viene SOLO de la tabla subastas (v_resumen_mensual ya no la usamos)
  const allData = useMemo(() => {
    const data: Record<number, Record<number, HistoricoRow>> = {}

    // 1. Volcar histórico (2024, 2025)
    historico.forEach(r => {
      if (!data[r.anio]) data[r.anio] = {}
      data[r.anio][r.mes_num] = r
    })

    // 2. Construir 2026 en tiempo real desde la tabla subastas
    const year2026: Record<number, HistoricoRow> = {}
    subastas.forEach(s => {
      if (!s.fecha_subasta) return
      const d = new Date(s.fecha_subasta)
      if (d.getFullYear() !== 2026) return
      const m = d.getMonth() + 1
      if (!year2026[m]) year2026[m] = { anio:2026, mes_num:m, mes:MESES_ES[m-1], total_subastas:0, ganadas:0, no_autorizadas:0, valor_autorizado:0, valor_subastado:0 }
      year2026[m].total_subastas++
      year2026[m].valor_subastado += s.valor_subastado || 0
      if (esGanada(s.estado_autorizacion)) { year2026[m].ganadas++; year2026[m].valor_autorizado += s.valor_autorizado || 0 }
      else if (s.estado_autorizacion === 'NO Autorizada') year2026[m].no_autorizadas++
    })
    if (Object.keys(year2026).length > 0) data[2026] = year2026

    return data
  }, [historico, subastas])

  const aniosDisponibles = useMemo(() => Object.keys(allData).map(Number).sort((a,b) => a - b), [allData])

  // Inicializar año y rango la primera vez
  useEffect(() => {
    if (!inicializado && aniosDisponibles.length > 0) {
      const maxAnio = aniosDisponibles[aniosDisponibles.length - 1]
      setAnioObjetivo(maxAnio)
      const meses = Object.keys(allData[maxAnio] || {}).map(Number)
      if (meses.length) setMesFin(Math.max(...meses))
      setInicializado(true)
    }
  }, [aniosDisponibles, allData, inicializado])

  const anioActivo = anioObjetivo || 2026
  const anioComp   = anioActivo - 1
  const desde = Math.min(mesInicio, mesFin)
  const hasta = Math.max(mesInicio, mesFin)

  // ── Marcas disponibles ───────────────────────────────────────────────────
  const marcas = useMemo(() => {
    const s = new Set<string>()
    subastas.forEach(r => { const m = normMarca(r.marca); if (m !== 'Sin marca') s.add(m) })
    return ['todas', ...Array.from(s).sort()]
  }, [subastas])

  // ── Filtrar subastas row-by-row para el año objetivo (2026 siempre vivo) ─
  const filtrarSubastas = (anio: number) =>
    subastas.filter(s => {
      if (!s.fecha_subasta) return false
      const sAnio = s.anio || new Date(s.fecha_subasta).getFullYear()
      if (sAnio !== anio) return false
      const m = parseInt(s.fecha_subasta.slice(5,7), 10)
      if (m < desde || m > hasta) return false
      if (filtroMarca !== 'todas' && normMarca(s.marca) !== filtroMarca) return false
      if (filtroAseguradora !== 0 && s.aseguradora_id !== filtroAseguradora) return false
      return true
    })

  // Para el año de comparación también podemos filtrar si tiene datos row-by-row
  const tieneDetalle = (anio: number) => subastas.some(s => (s.anio === anio) || (s.fecha_subasta && new Date(s.fecha_subasta).getFullYear() === anio))

  // ── Función para calcular stats de un conjunto de subastas row-by-row ────
  const calcStats = (rows: SubastaRow[]) => {
    const total = rows.length
    const gan   = rows.filter(s => esGanada(s.estado_autorizacion)).length
    const val   = rows.reduce((a, s) => a + (s.valor_autorizado || 0), 0)
    const sub   = rows.reduce((a, s) => a + (s.valor_subastado  || 0), 0)
    return { total, gan, val, sub, conv: total ? (gan/total)*100 : 0, ticket: gan ? val/gan : 0 }
  }

  // ── Obtener stats del período ya sea row-by-row o de histórico ───────────
  const getPeriodoStats = (anio: number) => {
    // Si filtro activo de marca o aseguradora → siempre row-by-row
    if (filtroMarca !== 'todas' || filtroAseguradora !== 0 || tieneDetalle(anio)) {
      return calcStats(filtrarSubastas(anio))
    }
    // Sin filtros → sumar histórico
    let total=0, gan=0, val=0, sub=0
    for (let m = desde; m <= hasta; m++) {
      const r = (allData[anio] || {})[m]
      if (r) { total += r.total_subastas; gan += r.ganadas; val += r.valor_autorizado; sub += r.valor_subastado }
    }
    return { total, gan, val, sub, conv: total ? (gan/total)*100 : 0, ticket: gan ? val/gan : 0 }
  }

  const statsObj  = useMemo(() => getPeriodoStats(anioActivo),  [anioActivo, desde, hasta, filtroMarca, filtroAseguradora, subastas, allData])
  const statsComp = useMemo(() => getPeriodoStats(anioComp),    [anioComp,   desde, hasta, filtroMarca, filtroAseguradora, subastas, allData])

  const pct = (a: number, b: number) => (b ? ((a-b)/b)*100 : 0)

  // ── Tendencia mensual ─────────────────────────────────────────────────────
  const tendencia = useMemo(() => {
    const useDetalle = filtroMarca !== 'todas' || filtroAseguradora !== 0
    const filasObj:  SubastaRow[] = useDetalle ? filtrarSubastas(anioActivo) : []
    const filasComp: SubastaRow[] = useDetalle ? filtrarSubastas(anioComp)   : []

    return Array.from({ length: hasta - desde + 1 }, (_, i) => {
      const m = desde + i
      let sO=0, gO=0, vO=0, sC=0, gC=0, vC=0
      if (useDetalle) {
        const rO = filasObj.filter(s => new Date(s.fecha_subasta!).getMonth()+1 === m)
        const rC = filasComp.filter(s => new Date(s.fecha_subasta!).getMonth()+1 === m)
        sO=rO.length; gO=rO.filter(s=>esGanada(s.estado_autorizacion)).length; vO=rO.reduce((a,s)=>a+(s.valor_autorizado||0),0)
        sC=rC.length; gC=rC.filter(s=>esGanada(s.estado_autorizacion)).length; vC=rC.reduce((a,s)=>a+(s.valor_autorizado||0),0)
      } else {
        const dO = (allData[anioActivo]||{})[m]; const dC = (allData[anioComp]||{})[m]
        sO=dO?.total_subastas||0; gO=dO?.ganadas||0; vO=dO?.valor_autorizado||0
        sC=dC?.total_subastas||0; gC=dC?.ganadas||0; vC=dC?.valor_autorizado||0
      }
      return { mes:MESES_ES[m-1].slice(0,3), subO:sO, ganO:gO, valO:vO, subC:sC, ganC:gC, valC:vC }
    })
  }, [anioActivo, anioComp, desde, hasta, filtroMarca, filtroAseguradora, subastas, allData])

  const mejorMes = useMemo(() => tendencia.reduce((a,b) => (b.valC && (!a.valC || (b.valO-b.valC)/b.valC > (a.valO-a.valC)/a.valC)) ? b : a, tendencia[0]), [tendencia])
  const peorMes  = useMemo(() => tendencia.reduce((a,b) => (b.valC && (!a.valC || (b.valO-b.valC)/b.valC < (a.valO-a.valC)/a.valC)) ? b : a, tendencia[0]), [tendencia])

  // ── Desgloses row-by-row ──────────────────────────────────────────────────
  const buildDesglose = (getKey: (s: SubastaRow) => number | null, nombres: Record<number, string>): DesgloseRow[] => {
    const mapa: Record<number, DesgloseRow> = {}
    Object.entries(nombres).forEach(([id, nombre]) => {
      mapa[Number(id)] = { nombre, subObj:0, subComp:0, ganObj:0, ganComp:0, valObj:0, valComp:0 }
    })
    filtrarSubastas(anioActivo).forEach(s => {
      const k = getKey(s); if (!k || !mapa[k]) return
      mapa[k].subObj++
      if (esGanada(s.estado_autorizacion)) { mapa[k].ganObj++; mapa[k].valObj += s.valor_autorizado||0 }
    })
    filtrarSubastas(anioComp).forEach(s => {
      const k = getKey(s); if (!k || !mapa[k]) return
      mapa[k].subComp++
      if (esGanada(s.estado_autorizacion)) { mapa[k].ganComp++; mapa[k].valComp += s.valor_autorizado||0 }
    })
    return Object.values(mapa).filter(f => f.subObj > 0 || f.subComp > 0).sort((a,b) => b.subObj - a.subObj)
  }

  const nombresAseg  = useMemo(() => Object.fromEntries(aseguradoras.map(a => [a.id, a.nombre_corto])), [aseguradoras])
  const nombresAses  = useMemo(() => Object.fromEntries(asesores.map(a    => [a.id, a.nombre])),        [asesores])

  const desgloseAseg = useMemo(() => buildDesglose(s => s.aseguradora_id, nombresAseg), [subastas, anioActivo, anioComp, desde, hasta, filtroMarca, filtroAseguradora, nombresAseg])
  const desgloseAses = useMemo(() => buildDesglose(s => s.asesor_id,      nombresAses), [subastas, anioActivo, anioComp, desde, hasta, filtroMarca, filtroAseguradora, nombresAses])

  // ── Gráfico aseguradoras ──────────────────────────────────────────────────
  const chartAseg = useMemo(() =>
    desgloseAseg.slice(0,8).map(f => ({
      nombre: f.nombre.length > 9 ? f.nombre.slice(0,9)+'…' : f.nombre,
      [`${anioActivo}`]: f.subObj, [`${anioComp}`]: f.subComp,
      [`Gan. ${anioActivo}`]: f.ganObj, [`Gan. ${anioComp}`]: f.ganComp,
    }))
  , [desgloseAseg, anioActivo, anioComp])

  if (loading) return <div className="p-6"><p className="text-brand-subtle font-mono text-sm">Cargando datos…</p></div>

  const hayDatosComp = aniosDisponibles.includes(anioComp)

  return (
    <div className="p-6">
      <Link href="/dashboard/facturacion/canales/subasta" className="inline-flex items-center gap-1.5 text-xs font-mono text-brand-subtle hover:text-brand-teal mb-4 transition-colors">
        <ArrowLeft size={13}/> Volver a Subasta
      </Link>
      <div className="mb-6">
        <h1 className="font-title text-2xl font-bold text-brand-text">Análisis Comparativo de Períodos</h1>
        <p className="text-brand-subtle text-sm mt-1">Período seleccionado vs el mismo período del año anterior · por marca, aseguradora y asesor</p>
      </div>

      {/* ── Selectores ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 mb-6 p-4 bg-brand-surface border border-brand-border rounded-xl">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-brand-muted font-mono uppercase">Año</span>
          <select value={anioActivo} onChange={e => setAnioObjetivo(Number(e.target.value))}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
            {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-brand-muted font-mono uppercase">Desde</span>
          <select value={mesInicio} onChange={e => setMesInicio(Number(e.target.value))}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
            {MESES_ES.map((m,i) => <option key={m} value={i+1}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-brand-muted font-mono uppercase">Hasta</span>
          <select value={mesFin} onChange={e => setMesFin(Number(e.target.value))}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
            {MESES_ES.map((m,i) => <option key={m} value={i+1}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-brand-muted font-mono uppercase">Marca</span>
          <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-gold">
            {marcas.map(m => <option key={m} value={m}>{m === 'todas' ? 'Todas las marcas' : m}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-brand-muted font-mono uppercase">Aseguradora</span>
          <select value={filtroAseguradora} onChange={e => setFiltroAseguradora(Number(e.target.value))}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-blue">
            <option value={0}>Todas</option>
            {aseguradoras.map(a => <option key={a.id} value={a.id}>{a.nombre_corto}</option>)}
          </select>
        </label>
        <div className="ml-auto text-right">
          <p className="text-[10px] text-brand-muted font-mono uppercase">Comparando contra</p>
          <p className="text-sm font-title font-semibold text-brand-gold">
            {anioComp} {!hayDatosComp && <span className="text-brand-red">(sin datos)</span>}
          </p>
          {(filtroMarca !== 'todas' || filtroAseguradora !== 0) && (
            <p className="text-[10px] text-brand-teal font-mono mt-0.5">
              {[filtroMarca !== 'todas' && filtroMarca, filtroAseguradora !== 0 && aseguradoras.find(a=>a.id===filtroAseguradora)?.nombre_corto].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {!hayDatosComp ? (
        <div className="bg-brand-surface border border-dashed border-brand-border rounded-xl p-10 text-center">
          <AlertTriangle className="mx-auto mb-3 text-brand-gold" size={28}/>
          <p className="text-brand-text font-title font-semibold mb-1">No hay datos de {anioComp}</p>
          <p className="text-brand-subtle text-sm">El histórico cubre desde 2024. Elige 2025 o 2026 como año objetivo.</p>
        </div>
      ) : (
        <>
          {/* ── KPIs ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
            <KpiCard icon={<Gavel     size={15}/>} label={`Subastas ${anioActivo}`}  value={statsObj.total}           accent="teal" hint={`vs ${statsComp.total} en ${anioComp}`}/>
            <KpiCard icon={<CheckCircle size={15}/>} label="Ganadas"                 value={statsObj.gan}             accent="blue" hint={`vs ${statsComp.gan} en ${anioComp}`}/>
            <KpiCard icon={<Percent   size={15}/>} label="% Conversión"              value={fmtPct(statsObj.conv)}    accent="gold" hint={`vs ${fmtPct(statsComp.conv)} en ${anioComp}`}/>
            <KpiCard icon={<DollarSign size={15}/>} label="Facturación"              value={fmtM(statsObj.val)}       accent="teal" hint={`vs ${fmtM(statsComp.val)} en ${anioComp}`}/>
            <KpiCard icon={<Award     size={15}/>} label="Ticket promedio"           value={fmtM(statsObj.ticket)}    accent="gold" hint={`vs ${fmtM(statsComp.ticket)} en ${anioComp}`}/>
          </div>

          {/* ── Variaciones ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label:'Var. subastas',       v: pct(statsObj.total, statsComp.total) },
              { label:'Var. facturación',    v: pct(statsObj.val,   statsComp.val)   },
              { label:'Var. ganadas',        v: pct(statsObj.gan,   statsComp.gan)   },
              { label:'Var. conv. (pp)',     v: statsObj.conv - statsComp.conv        },
            ].map(({label,v}) => (
              <div key={label} className="bg-brand-surface border border-brand-border rounded-xl p-3">
                <p className="text-[10px] text-brand-muted font-mono uppercase mb-1">{label}</p>
                <VarTag v={v}/>
              </div>
            ))}
          </div>

          {/* ── Mejor/peor mes ───────────────────────────────────────────── */}
          {mejorMes && peorMes && mejorMes.mes !== peorMes.mes && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              <div className="bg-brand-teal/5 border border-brand-teal/30 rounded-xl p-4">
                <p className="text-xs text-brand-teal font-mono uppercase tracking-wider mb-1">Mejor mes del período vs {anioComp}</p>
                <p className="font-title text-lg font-bold text-brand-text capitalize">{mejorMes.mes}</p>
                {mejorMes.valC > 0 && <><VarTag v={(mejorMes.valO-mejorMes.valC)/mejorMes.valC*100}/><span className="text-brand-muted text-xs ml-2">en facturación</span></>}
              </div>
              <div className="bg-brand-red/5 border border-brand-red/30 rounded-xl p-4">
                <p className="text-xs text-brand-red font-mono uppercase tracking-wider mb-1">Mes más débil vs {anioComp}</p>
                <p className="font-title text-lg font-bold text-brand-text capitalize">{peorMes.mes}</p>
                {peorMes.valC > 0 && <><VarTag v={(peorMes.valO-peorMes.valC)/peorMes.valC*100}/><span className="text-brand-muted text-xs ml-2">en facturación</span></>}
              </div>
            </div>
          )}

          {/* ── Gráficos tendencia ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Panel title="Tendencia de subastas" sub={`${anioActivo} vs ${anioComp}`}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={tendencia} margin={{left:0,right:8,top:8,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                  <XAxis dataKey="mes" tick={{fill:'#8AA4C8',fontSize:11}} axisLine={{stroke:'#2A3340'}} tickLine={false}/>
                  <YAxis tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{background:'#1B232D',border:'1px solid #2A3340',borderRadius:8,fontSize:12}}
                    formatter={(v:number, n:string) => [v, n==='subO' ? String(anioActivo) : String(anioComp)]}/>
                  <Legend wrapperStyle={{fontSize:11,color:'#8AA4C8'}}
                    formatter={(v) => v==='subO' ? String(anioActivo) : String(anioComp)}/>
                  <Line type="monotone" dataKey="subC" stroke="#5B6472" strokeWidth={2} dot={false} name="subC"/>
                  <Line type="monotone" dataKey="subO" stroke="#4FD1C5" strokeWidth={2.5} dot={{r:3}} name="subO"/>
                </LineChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Tendencia de facturación" sub={`${anioActivo} vs ${anioComp}`}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={tendencia} margin={{left:0,right:8,top:8,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                  <XAxis dataKey="mes" tick={{fill:'#8AA4C8',fontSize:11}} axisLine={{stroke:'#2A3340'}} tickLine={false}/>
                  <YAxis tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>fmtM(v)}/>
                  <Tooltip contentStyle={{background:'#1B232D',border:'1px solid #2A3340',borderRadius:8,fontSize:12}}
                    formatter={(v:number, n:string) => [fmtCOP(v), n==='valO' ? String(anioActivo) : String(anioComp)]}/>
                  <Legend wrapperStyle={{fontSize:11,color:'#8AA4C8'}}
                    formatter={(v) => v==='valO' ? String(anioActivo) : String(anioComp)}/>
                  <Line type="monotone" dataKey="valC" stroke="#5B6472" strokeWidth={2} dot={false} name="valC"/>
                  <Line type="monotone" dataKey="valO" stroke="#E8A33D" strokeWidth={2.5} dot={{r:3}} name="valO"/>
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* ── Gráfico aseguradoras ─────────────────────────────────────── */}
          <div className="mb-4">
            <Panel title="Subastas por aseguradora" sub={`Top 8 · ${anioActivo} vs ${anioComp}`}>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={chartAseg} margin={{left:0,right:8,top:8,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                  <XAxis dataKey="nombre" tick={{fill:'#8AA4C8',fontSize:10}} axisLine={{stroke:'#2A3340'}} tickLine={false}/>
                  <YAxis tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{background:'#1B232D',border:'1px solid #2A3340',borderRadius:8,fontSize:12}}/>
                  <Legend wrapperStyle={{fontSize:11,color:'#8AA4C8'}}/>
                  <Bar dataKey={`${anioComp}`}      fill="#5B6472" radius={[3,3,0,0]}/>
                  <Bar dataKey={`${anioActivo}`}    fill="#4FD1C5" radius={[3,3,0,0]}/>
                  <Bar dataKey={`Gan. ${anioComp}`} fill="#8AA4C8" radius={[3,3,0,0]}/>
                  <Bar dataKey={`Gan. ${anioActivo}`} fill="#E8A33D" radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* ── Tabla mes a mes ───────────────────────────────────────────── */}
          <div className="mb-4">
            <Panel title="Detalle mes a mes" sub={`${anioActivo} vs ${anioComp}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-brand-border">
                      {['Mes',`Sub. ${anioActivo}`,`Sub. ${anioComp}`,'Var.',`Gan. ${anioActivo}`,`Gan. ${anioComp}`,`Factur. ${anioActivo}`,`Factur. ${anioComp}`,'Var. $'].map(h => (
                        <th key={h} className="text-right first:text-left font-mono text-[10px] text-brand-subtle uppercase tracking-wider pb-3 pr-3 last:pr-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tendencia.map(f => {
                      const vS = f.subC ? ((f.subO-f.subC)/f.subC)*100 : null
                      const vV = f.valC ? ((f.valO-f.valC)/f.valC)*100 : null
                      return (
                        <tr key={f.mes} className="border-b border-brand-border/40 hover:bg-brand-bg/50 transition-colors">
                          <td className="py-2.5 pr-3 text-brand-text font-medium capitalize">{f.mes}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-brand-text">{f.subO||'—'}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-brand-muted">{f.subC||'—'}</td>
                          <td className="py-2.5 pr-3 text-right">{vS!==null?<VarTag v={vS}/>:<span className="text-brand-muted">—</span>}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-brand-text">{f.ganO||'—'}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-brand-muted">{f.ganC||'—'}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-brand-text">{f.valO?fmtM(f.valO):'—'}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-brand-muted">{f.valC?fmtM(f.valC):'—'}</td>
                          <td className="py-2.5 text-right">{vV!==null?<VarTag v={vV}/>:<span className="text-brand-muted">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          {/* ── Desglose por aseguradora ─────────────────────────────────── */}
          <div className="mb-4">
            <TablaDesglose titulo="Desglose por aseguradora" icono={<Building2 size={11}/>} filas={desgloseAseg} anioObj={anioActivo} anioComp={anioComp}/>
          </div>

          {/* ── Desglose por asesor ───────────────────────────────────────── */}
          <div className="mb-4">
            <TablaDesglose titulo="Desglose por asesor" icono={<User size={11}/>} filas={desgloseAses} anioObj={anioActivo} anioComp={anioComp}/>
          </div>
        </>
      )}
    </div>
  )
}
