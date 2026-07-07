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
type ResumenMensual = { mes: string; total_subastas: number; ganadas: number; no_autorizadas: number; valor_autorizado: number; valor_subastado: number }
type ResumenHistorico = { anio: number; mes_num: number; mes: string; total_subastas: number; ganadas: number; no_autorizadas: number; valor_autorizado: number; valor_subastado: number }
type MonthStat = { total_subastas: number; ganadas: number; no_autorizadas: number; valor_autorizado: number; valor_subastado: number }
type SubastaRow = { id: number; placa: string | null; marca: string | null; aseguradora_id: number | null; asesor_id: number | null; estado_autorizacion: string | null; valor_subastado: number | null; valor_autorizado: number | null; fecha_subasta: string | null }
type Aseguradora = { id: number; nombre_corto: string }
type Asesor = { id: number; nombre: string }

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const CURRENT_YEAR = new Date().getFullYear()

const normMarca = (raw: string | null | undefined): string => {
  if (!raw) return 'Sin marca'
  const k = raw.trim().toLowerCase()
  const MAP: Record<string, string> = { kia: 'Kia', vw: 'VW', jac: 'Jac', renault: 'Renault' }
  return MAP[k] || (k.charAt(0).toUpperCase() + k.slice(1))
}

const ganada = (estado: string | null) =>
  estado === 'Autorizada Completa' || estado === 'Autorizada parcial'

// ── Componentes auxiliares ─────────────────────────────────────────────────────
const VarTag = ({ v, invert }: { v: number; invert?: boolean }) => {
  const pos = invert ? v <= 0 : v >= 0
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono ${pos ? 'text-brand-teal' : 'text-brand-red'}`}>
      {v >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {fmtPct(Math.abs(v))}
    </span>
  )
}

type DesgloseFila = { nombre: string; subObj: number; subComp: number; ganObj: number; ganComp: number; valObj: number; valComp: number }

function TablaDesglose({ titulo, icono, filas, anioObj, anioComp }: {
  titulo: string; icono: React.ReactNode
  filas: DesgloseFila[]; anioObj: number; anioComp: number
}) {
  return (
    <Panel title={titulo} sub={`${anioObj} vs ${anioComp} — top por subastas realizadas`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-border">
              <th className="text-left font-mono text-[10px] text-brand-subtle uppercase tracking-wider pb-3 pr-4">{icono && <span className="inline-flex items-center gap-1">{icono} Nombre</span>}</th>
              <th className="text-right font-mono text-[10px] text-brand-subtle uppercase tracking-wider pb-3 pr-3">Sub. {anioObj}</th>
              <th className="text-right font-mono text-[10px] text-brand-subtle uppercase tracking-wider pb-3 pr-3">Sub. {anioComp}</th>
              <th className="text-right font-mono text-[10px] text-brand-subtle uppercase tracking-wider pb-3 pr-3">Var.</th>
              <th className="text-right font-mono text-[10px] text-brand-subtle uppercase tracking-wider pb-3 pr-3">Conv. {anioObj}</th>
              <th className="text-right font-mono text-[10px] text-brand-subtle uppercase tracking-wider pb-3 pr-3">Conv. {anioComp}</th>
              <th className="text-right font-mono text-[10px] text-brand-subtle uppercase tracking-wider pb-3 pr-3">Factur. {anioObj}</th>
              <th className="text-right font-mono text-[10px] text-brand-subtle uppercase tracking-wider pb-3">Factur. {anioComp}</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const varSub = f.subComp ? ((f.subObj - f.subComp) / f.subComp) * 100 : null
              const convObj = f.subObj ? (f.ganObj / f.subObj) * 100 : 0
              const convComp = f.subComp ? (f.ganComp / f.subComp) * 100 : 0
              return (
                <tr key={f.nombre} className="border-b border-brand-border/40 hover:bg-brand-bg/50 transition-colors">
                  <td className="py-2.5 pr-4 text-brand-text font-medium">{f.nombre}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-brand-text">{f.subObj}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-brand-muted">{f.subComp || '—'}</td>
                  <td className="py-2.5 pr-3 text-right">{varSub !== null ? <VarTag v={varSub} /> : <span className="text-brand-muted text-xs">—</span>}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-brand-text">{fmtPct(convObj)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-brand-muted">{f.subComp ? fmtPct(convComp) : '—'}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-brand-text">{fmtM(f.valObj)}</td>
                  <td className="py-2.5 text-right font-mono text-brand-muted">{f.valComp ? fmtM(f.valComp) : '—'}</td>
                </tr>
              )
            })}
            {filas.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-brand-subtle text-sm">Sin datos en este rango</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function ComparativoPeriodosPage() {
  const [loading, setLoading] = useState(true)
  const [resumenMensual, setResumenMensual] = useState<ResumenMensual[]>([])
  const [resumenHistorico, setResumenHistorico] = useState<ResumenHistorico[]>([])
  const [subastas, setSubastas] = useState<SubastaRow[]>([])
  const [aseguradoras, setAseguradoras] = useState<Aseguradora[]>([])
  const [asesores, setAsesores] = useState<Asesor[]>([])

  const [anioObjetivo, setAnioObjetivo] = useState(CURRENT_YEAR)
  const [mesInicio, setMesInicio] = useState(1)
  const [mesFin, setMesFin] = useState(12)
  const [filtroMarca, setFiltroMarca] = useState('todas')
  const [rangoInicializado, setRangoInicializado] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const [{ data: rm }, { data: rh }, { data: sub }, { data: aseg }, { data: ases }] = await Promise.all([
        supabase.from('v_resumen_mensual').select('*'),
        supabase.from('resumen_historico_subastas').select('*').order('anio,mes_num'),
        supabase.from('subastas').select('id,placa,marca,aseguradora_id,asesor_id,estado_autorizacion,valor_subastado,valor_autorizado,fecha_subasta').limit(8000),
        supabase.from('aseguradoras').select('id,nombre_corto'),
        supabase.from('asesores').select('id,nombre'),
      ])
      setResumenMensual((rm as ResumenMensual[]) || [])
      setResumenHistorico((rh as ResumenHistorico[]) || [])
      setSubastas((sub as SubastaRow[]) || [])
      setAseguradoras((aseg as Aseguradora[]) || [])
      setAsesores((ases as Asesor[]) || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  // ── Normalizar y agrupar datos históricos ─────────────────────────────────
  const allData = useMemo(() => {
    const data: Record<number, Record<number, MonthStat>> = {}
    resumenHistorico.forEach(r => {
      if (!data[r.anio]) data[r.anio] = {}
      data[r.anio][r.mes_num] = { total_subastas: r.total_subastas, ganadas: r.ganadas, no_autorizadas: r.no_autorizadas, valor_autorizado: r.valor_autorizado, valor_subastado: r.valor_subastado }
    })
    if (resumenMensual.length > 0) {
      data[CURRENT_YEAR] = {}
      resumenMensual.forEach(r => {
        const idx = MESES_ES.indexOf((r.mes || '').toLowerCase().trim())
        if (idx >= 0) data[CURRENT_YEAR][idx + 1] = { total_subastas: r.total_subastas, ganadas: r.ganadas, no_autorizadas: r.no_autorizadas, valor_autorizado: r.valor_autorizado, valor_subastado: r.valor_subastado }
      })
    }
    return data
  }, [resumenMensual, resumenHistorico])

  const aniosDisponibles = useMemo(() => Object.keys(allData).map(Number).sort((a, b) => a - b), [allData])

  useEffect(() => {
    if (!rangoInicializado && aniosDisponibles.length > 0) {
      const maxAnio = aniosDisponibles[aniosDisponibles.length - 1]
      setAnioObjetivo(maxAnio)
      const meses = Object.keys(allData[maxAnio] || {}).map(Number)
      if (meses.length > 0) setMesFin(Math.max(...meses))
      setRangoInicializado(true)
    }
  }, [aniosDisponibles, allData, rangoInicializado])

  const anioComparacion = anioObjetivo - 1
  const desde = Math.min(mesInicio, mesFin)
  const hasta = Math.max(mesInicio, mesFin)

  // ── Marcas disponibles (desde tabla subastas real) ────────────────────────
  const marcasDisponibles = useMemo(() => {
    const set = new Set<string>()
    subastas.forEach(s => set.add(normMarca(s.marca)))
    return ['todas', ...Array.from(set).filter(m => m !== 'Sin marca').sort(), 'Sin marca']
  }, [subastas])

  // ── Filtrar subastas por rango de fechas y marca ──────────────────────────
  const filtrarPorPeriodoYMarca = (anio: number) =>
    subastas.filter(s => {
      if (!s.fecha_subasta) return false
      const d = new Date(s.fecha_subasta)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      if (y !== anio) return false
      if (m < desde || m > hasta) return false
      if (filtroMarca !== 'todas' && normMarca(s.marca) !== filtroMarca) return false
      return true
    })

  const subObj = useMemo(() => filtrarPorPeriodoYMarca(anioObjetivo), [subastas, anioObjetivo, desde, hasta, filtroMarca])
  const subComp = useMemo(() => filtrarPorPeriodoYMarca(anioComparacion), [subastas, anioComparacion, desde, hasta, filtroMarca])

  // ── Estadísticas generales del período ───────────────────────────────────
  const stats = useMemo(() => {
    const calc = (rows: SubastaRow[]) => {
      const total = rows.length
      const gan = rows.filter(s => ganada(s.estado_autorizacion)).length
      const val = rows.reduce((a, s) => a + (s.valor_autorizado || 0), 0)
      const sub = rows.reduce((a, s) => a + (s.valor_subastado || 0), 0)
      const conv = total ? (gan / total) * 100 : 0
      const ticket = gan ? val / gan : 0
      return { total, gan, val, sub, conv, ticket }
    }
    const obj = calc(subObj)
    const comp = calc(subComp)
    const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0)
    return {
      obj, comp,
      varTotal: pct(obj.total, comp.total),
      varGan: pct(obj.gan, comp.gan),
      varVal: pct(obj.val, comp.val),
      varConv: obj.conv - comp.conv,
      varTicket: pct(obj.ticket, comp.ticket),
    }
  }, [subObj, subComp])

  // ── Tendencia mensual (resumen histórico + filtro marca si es "todas") ───
  const analisisMensual = useMemo(() => {
    // Si hay filtro de marca, usamos las subastas reales row-by-row
    // Si no, usamos el resumen pre-calculado (más preciso para datos históricos)
    const usarDetalle = filtroMarca !== 'todas'

    const filas = []
    for (let m = desde; m <= hasta; m++) {
      if (usarDetalle) {
        const oRows = subObj.filter(s => new Date(s.fecha_subasta!).getMonth() + 1 === m)
        const cRows = subComp.filter(s => new Date(s.fecha_subasta!).getMonth() + 1 === m)
        filas.push({
          mes: MESES_ES[m - 1].slice(0, 3), mesNum: m,
          subastasObjetivo: oRows.length,
          subastasComparacion: cRows.length,
          ganadasObjetivo: oRows.filter(s => ganada(s.estado_autorizacion)).length,
          ganadasComparacion: cRows.filter(s => ganada(s.estado_autorizacion)).length,
          valorObjetivo: oRows.reduce((a, s) => a + (s.valor_autorizado || 0), 0),
          valorComparacion: cRows.reduce((a, s) => a + (s.valor_autorizado || 0), 0),
        })
      } else {
        const dObj = (allData[anioObjetivo] || {})[m]
        const dComp = (allData[anioComparacion] || {})[m]
        filas.push({
          mes: MESES_ES[m - 1].slice(0, 3), mesNum: m,
          subastasObjetivo: dObj?.total_subastas || 0,
          subastasComparacion: dComp?.total_subastas || 0,
          ganadasObjetivo: dObj?.ganadas || 0,
          ganadasComparacion: dComp?.ganadas || 0,
          valorObjetivo: dObj?.valor_autorizado || 0,
          valorComparacion: dComp?.valor_autorizado || 0,
        })
      }
    }

    const filasConDatos = filas.filter(f => f.subastasObjetivo > 0 || f.subastasComparacion > 0)
    const mejorMes = filasConDatos.length
      ? filasConDatos.reduce((a, b) => {
          const va = b.valorComparacion ? (b.valorObjetivo - b.valorComparacion) / b.valorComparacion : 0
          const vb = a.valorComparacion ? (a.valorObjetivo - a.valorComparacion) / a.valorComparacion : 0
          return va > vb ? b : a
        })
      : null
    const peorMes = filasConDatos.length
      ? filasConDatos.reduce((a, b) => {
          const va = b.valorComparacion ? (b.valorObjetivo - b.valorComparacion) / b.valorComparacion : 0
          const vb = a.valorComparacion ? (a.valorObjetivo - a.valorComparacion) / a.valorComparacion : 0
          return va < vb ? b : a
        })
      : null

    return { filas, mejorMes, peorMes }
  }, [subObj, subComp, desde, hasta, filtroMarca, allData, anioObjetivo, anioComparacion])

  // ── Desglose por aseguradora ──────────────────────────────────────────────
  const desgloseAseguradoras = useMemo((): DesgloseFila[] => {
    const mapa: Record<number, DesgloseFila> = {}
    aseguradoras.forEach(a => {
      mapa[a.id] = { nombre: a.nombre_corto, subObj: 0, subComp: 0, ganObj: 0, ganComp: 0, valObj: 0, valComp: 0 }
    })
    subObj.forEach(s => {
      if (s.aseguradora_id && mapa[s.aseguradora_id]) {
        mapa[s.aseguradora_id].subObj++
        if (ganada(s.estado_autorizacion)) { mapa[s.aseguradora_id].ganObj++; mapa[s.aseguradora_id].valObj += s.valor_autorizado || 0 }
      }
    })
    subComp.forEach(s => {
      if (s.aseguradora_id && mapa[s.aseguradora_id]) {
        mapa[s.aseguradora_id].subComp++
        if (ganada(s.estado_autorizacion)) { mapa[s.aseguradora_id].ganComp++; mapa[s.aseguradora_id].valComp += s.valor_autorizado || 0 }
      }
    })
    return Object.values(mapa).filter(f => f.subObj > 0 || f.subComp > 0).sort((a, b) => b.subObj - a.subObj)
  }, [subObj, subComp, aseguradoras])

  // ── Desglose por asesor ────────────────────────────────────────────────────
  const desgloseAsesores = useMemo((): DesgloseFila[] => {
    const mapa: Record<number, DesgloseFila> = {}
    asesores.forEach(a => {
      mapa[a.id] = { nombre: a.nombre, subObj: 0, subComp: 0, ganObj: 0, ganComp: 0, valObj: 0, valComp: 0 }
    })
    subObj.forEach(s => {
      if (s.asesor_id && mapa[s.asesor_id]) {
        mapa[s.asesor_id].subObj++
        if (ganada(s.estado_autorizacion)) { mapa[s.asesor_id].ganObj++; mapa[s.asesor_id].valObj += s.valor_autorizado || 0 }
      }
    })
    subComp.forEach(s => {
      if (s.asesor_id && mapa[s.asesor_id]) {
        mapa[s.asesor_id].subComp++
        if (ganada(s.estado_autorizacion)) { mapa[s.asesor_id].ganComp++; mapa[s.asesor_id].valComp += s.valor_autorizado || 0 }
      }
    })
    return Object.values(mapa).filter(f => f.subObj > 0 || f.subComp > 0).sort((a, b) => b.subObj - a.subObj)
  }, [subObj, subComp, asesores])

  // ── Gráfico barras aseguradoras ───────────────────────────────────────────
  const chartAseg = useMemo(() =>
    desgloseAseguradoras.slice(0, 8).map(f => ({
      nombre: f.nombre.length > 10 ? f.nombre.slice(0, 10) + '…' : f.nombre,
      [`Sub ${anioObjetivo}`]: f.subObj,
      [`Sub ${anioComparacion}`]: f.subComp,
      [`Gan ${anioObjetivo}`]: f.ganObj,
      [`Gan ${anioComparacion}`]: f.ganComp,
    }))
  , [desgloseAseguradoras, anioObjetivo, anioComparacion])

  if (loading) {
    return <div className="p-6"><p className="text-brand-subtle font-mono text-sm">Cargando análisis comparativo…</p></div>
  }

  const hayDatosComparacion = aniosDisponibles.includes(anioComparacion)

  return (
    <div className="p-6">
      <Link href="/dashboard/facturacion/canales/subasta" className="inline-flex items-center gap-1.5 text-xs font-mono text-brand-subtle hover:text-brand-teal mb-4 transition-colors">
        <ArrowLeft size={13} /> Volver a Subasta
      </Link>

      <div className="mb-6">
        <h1 className="font-title text-2xl font-bold text-brand-text">Análisis Comparativo de Períodos</h1>
        <p className="text-brand-subtle text-sm mt-1">Compara cualquier período contra el mismo período del año anterior — por marca, aseguradora y asesor</p>
      </div>

      {/* ── Selectores ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 mb-6 p-4 bg-brand-surface border border-brand-border rounded-xl">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Año</span>
          <select value={anioObjetivo} onChange={e => setAnioObjetivo(Number(e.target.value))}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
            {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Desde</span>
          <select value={mesInicio} onChange={e => setMesInicio(Number(e.target.value))}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
            {MESES_ES.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Hasta</span>
          <select value={mesFin} onChange={e => setMesFin(Number(e.target.value))}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
            {MESES_ES.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Marca</span>
          <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-gold">
            {marcasDisponibles.map(m => <option key={m} value={m}>{m === 'todas' ? 'Todas las marcas' : m}</option>)}
          </select>
        </label>
        <div className="ml-auto text-right">
          <p className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Comparando contra</p>
          <p className="text-sm font-title font-semibold text-brand-gold">
            {anioComparacion} {!hayDatosComparacion && <span className="text-brand-red">(sin datos)</span>}
          </p>
          {filtroMarca !== 'todas' && (
            <p className="text-[10px] text-brand-teal font-mono mt-0.5">Filtrado: {filtroMarca}</p>
          )}
        </div>
      </div>

      {!hayDatosComparacion ? (
        <div className="bg-brand-surface border border-dashed border-brand-border rounded-xl p-10 text-center">
          <AlertTriangle className="mx-auto mb-3 text-brand-gold" size={28} />
          <p className="text-brand-text font-title font-semibold mb-1">No hay datos de {anioComparacion}</p>
          <p className="text-brand-subtle text-sm">El histórico cubre desde 2024. Elige un año objetivo de 2025 o posterior.</p>
        </div>
      ) : (
        <>
          {/* ── KPIs principales ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
            <KpiCard icon={<Gavel size={15} />} label={`Subastas ${anioObjetivo}`} value={stats.obj.total} accent="teal" hint={`vs ${stats.comp.total} en ${anioComparacion}`} />
            <KpiCard icon={<CheckCircle size={15} />} label="Ganadas" value={stats.obj.gan} accent="blue" hint={`vs ${stats.comp.gan} en ${anioComparacion}`} />
            <KpiCard icon={<Percent size={15} />} label="% Conversión" value={fmtPct(stats.obj.conv)} accent="gold" hint={`vs ${fmtPct(stats.comp.conv)} en ${anioComparacion}`} />
            <KpiCard icon={<DollarSign size={15} />} label="Facturación" value={fmtM(stats.obj.val)} accent="teal" hint={`vs ${fmtM(stats.comp.val)} en ${anioComparacion}`} />
            <KpiCard icon={<Award size={15} />} label="Ticket promedio" value={fmtM(stats.obj.ticket)} accent="gold" hint={`vs ${fmtM(stats.comp.ticket)} en ${anioComparacion}`} />
          </div>

          {/* ── Variaciones clave ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Var. subastas', v: stats.varTotal },
              { label: 'Var. facturación', v: stats.varVal },
              { label: 'Var. ganadas', v: stats.varGan },
              { label: 'Var. conv. (pp)', v: stats.varConv },
            ].map(({ label, v }) => (
              <div key={label} className="bg-brand-surface border border-brand-border rounded-xl p-3">
                <p className="text-[10px] text-brand-muted font-mono uppercase mb-1">{label}</p>
                <VarTag v={v} />
              </div>
            ))}
          </div>

          {/* ── Resumen ejecutivo ─────────────────────────────────────────── */}
          {(analisisMensual.mejorMes || analisisMensual.peorMes) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              {analisisMensual.mejorMes && (
                <div className="bg-brand-teal/5 border border-brand-teal/30 rounded-xl p-4">
                  <p className="text-xs text-brand-teal font-mono uppercase tracking-wider mb-1">Mejor mes del período vs {anioComparacion}</p>
                  <p className="font-title text-lg font-bold text-brand-text capitalize">{analisisMensual.mejorMes.mes}</p>
                  {analisisMensual.mejorMes.valorComparacion > 0 && <VarTag v={(analisisMensual.mejorMes.valorObjetivo - analisisMensual.mejorMes.valorComparacion) / analisisMensual.mejorMes.valorComparacion * 100} />}
                  <span className="text-brand-muted text-xs ml-2">en facturación</span>
                </div>
              )}
              {analisisMensual.peorMes && (
                <div className="bg-brand-red/5 border border-brand-red/30 rounded-xl p-4">
                  <p className="text-xs text-brand-red font-mono uppercase tracking-wider mb-1">Mes más débil del período vs {anioComparacion}</p>
                  <p className="font-title text-lg font-bold text-brand-text capitalize">{analisisMensual.peorMes.mes}</p>
                  {analisisMensual.peorMes.valorComparacion > 0 && <VarTag v={(analisisMensual.peorMes.valorObjetivo - analisisMensual.peorMes.valorComparacion) / analisisMensual.peorMes.valorComparacion * 100} />}
                  <span className="text-brand-muted text-xs ml-2">en facturación</span>
                </div>
              )}
            </div>
          )}

          {/* ── Gráficos de tendencia ────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Panel title="Tendencia de subastas" sub={`${anioObjetivo} vs ${anioComparacion}${filtroMarca !== 'todas' ? ` · ${filtroMarca}` : ''}`}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={analisisMensual.filas} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={{ stroke: '#2A3340' }} tickLine={false} />
                  <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [v, name.includes(String(anioObjetivo)) ? String(anioObjetivo) : String(anioComparacion)]} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8' }} />
                  <Line type="monotone" dataKey="subastasComparacion" stroke="#5B6472" strokeWidth={2} dot={false} name={String(anioComparacion)} />
                  <Line type="monotone" dataKey="subastasObjetivo" stroke="#4FD1C5" strokeWidth={2.5} dot={{ r: 3 }} name={String(anioObjetivo)} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Tendencia de facturación" sub={`${anioObjetivo} vs ${anioComparacion}${filtroMarca !== 'todas' ? ` · ${filtroMarca}` : ''}`}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={analisisMensual.filas} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={{ stroke: '#2A3340' }} tickLine={false} />
                  <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtM(v)} />
                  <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [fmtCOP(v), name.includes(String(anioObjetivo)) ? String(anioObjetivo) : String(anioComparacion)]} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8' }} />
                  <Line type="monotone" dataKey="valorComparacion" stroke="#5B6472" strokeWidth={2} dot={false} name={String(anioComparacion)} />
                  <Line type="monotone" dataKey="valorObjetivo" stroke="#E8A33D" strokeWidth={2.5} dot={{ r: 3 }} name={String(anioObjetivo)} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* ── Comparativo barras aseguradoras ──────────────────────────── */}
          <div className="mb-4">
            <Panel title="Subastas por aseguradora" sub={`Top 8 — ${anioObjetivo} vs ${anioComparacion}${filtroMarca !== 'todas' ? ` · ${filtroMarca}` : ''}`}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartAseg} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false} />
                  <XAxis dataKey="nombre" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={{ stroke: '#2A3340' }} tickLine={false} />
                  <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8' }} />
                  <Bar dataKey={`Sub ${anioComparacion}`} fill="#5B6472" radius={[3, 3, 0, 0]} />
                  <Bar dataKey={`Sub ${anioObjetivo}`} fill="#4FD1C5" radius={[3, 3, 0, 0]} />
                  <Bar dataKey={`Gan ${anioComparacion}`} fill="#8AA4C8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey={`Gan ${anioObjetivo}`} fill="#E8A33D" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* ── Tabla detallada mes a mes ─────────────────────────────────── */}
          <div className="mb-4">
            <Panel title="Detalle mes a mes" sub={`${anioObjetivo} vs ${anioComparacion} — subastas, ganadas, facturación y variación`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-brand-border">
                      {['Mes', `Sub. ${anioObjetivo}`, `Sub. ${anioComparacion}`, 'Var.', `Gan. ${anioObjetivo}`, `Gan. ${anioComparacion}`, `Factur. ${anioObjetivo}`, `Factur. ${anioComparacion}`, 'Var. $'].map(h => (
                        <th key={h} className="text-right first:text-left font-mono text-[10px] text-brand-subtle uppercase tracking-wider pb-3 pr-3 last:pr-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analisisMensual.filas.map(f => {
                      const varSub = f.subastasComparacion ? ((f.subastasObjetivo - f.subastasComparacion) / f.subastasComparacion) * 100 : null
                      const varVal = f.valorComparacion ? ((f.valorObjetivo - f.valorComparacion) / f.valorComparacion) * 100 : null
                      return (
                        <tr key={f.mes} className="border-b border-brand-border/40 hover:bg-brand-bg/50 transition-colors">
                          <td className="py-2.5 pr-3 text-brand-text font-medium capitalize">{f.mes}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-brand-text">{f.subastasObjetivo || '—'}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-brand-muted">{f.subastasComparacion || '—'}</td>
                          <td className="py-2.5 pr-3 text-right">{varSub !== null ? <VarTag v={varSub} /> : <span className="text-brand-muted text-xs">—</span>}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-brand-text">{f.ganadasObjetivo || '—'}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-brand-muted">{f.ganadasComparacion || '—'}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-brand-text">{f.valorObjetivo ? fmtM(f.valorObjetivo) : '—'}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-brand-muted">{f.valorComparacion ? fmtM(f.valorComparacion) : '—'}</td>
                          <td className="py-2.5 text-right">{varVal !== null ? <VarTag v={varVal} /> : <span className="text-brand-muted text-xs">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          {/* ── Desglose por aseguradora ──────────────────────────────────── */}
          <div className="mb-4">
            <TablaDesglose
              titulo="Desglose por aseguradora"
              icono={<Building2 size={11} />}
              filas={desgloseAseguradoras}
              anioObj={anioObjetivo}
              anioComp={anioComparacion}
            />
          </div>

          {/* ── Desglose por asesor ───────────────────────────────────────── */}
          <div className="mb-4">
            <TablaDesglose
              titulo="Desglose por asesor"
              icono={<User size={11} />}
              filas={desgloseAsesores}
              anioObj={anioObjetivo}
              anioComp={anioComparacion}
            />
          </div>
        </>
      )}
    </div>
  )
}
