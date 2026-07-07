'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import {
  ArrowLeft, TrendingUp, TrendingDown, Gavel, CheckCircle, DollarSign,
  Percent, Award, AlertTriangle,
} from 'lucide-react'
import { KpiCard, Panel, fmtCOP, fmtM, fmtPct } from '@/components/dashboard-ui'

type ResumenMensual = { mes: string; total_subastas: number; ganadas: number; no_autorizadas: number; valor_autorizado: number; valor_subastado: number }
type ResumenHistorico = { anio: number; mes_num: number; mes: string; total_subastas: number; ganadas: number; no_autorizadas: number; valor_autorizado: number; valor_subastado: number }
type MonthStat = { total_subastas: number; ganadas: number; no_autorizadas: number; valor_autorizado: number; valor_subastado: number }

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const CURRENT_YEAR = new Date().getFullYear()

export default function ComparativoPeriodosPage() {
  const [loading, setLoading] = useState(true)
  const [resumenMensual, setResumenMensual] = useState<ResumenMensual[]>([])
  const [resumenHistorico, setResumenHistorico] = useState<ResumenHistorico[]>([])
  const [anioObjetivo, setAnioObjetivo] = useState(CURRENT_YEAR)
  const [mesInicio, setMesInicio] = useState(1)
  const [mesFin, setMesFin] = useState(12)
  const [rangoInicializado, setRangoInicializado] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const [{ data: rm }, { data: rh }] = await Promise.all([
        supabase.from('v_resumen_mensual').select('*'),
        supabase.from('resumen_historico_subastas').select('*').order('anio,mes_num'),
      ])
      setResumenMensual((rm as ResumenMensual[]) || [])
      setResumenHistorico((rh as ResumenHistorico[]) || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  // ── Consolidar todos los años disponibles en una sola estructura ──────────
  const allData = useMemo(() => {
    const data: Record<number, Record<number, MonthStat>> = {}

    resumenHistorico.forEach(r => {
      if (!data[r.anio]) data[r.anio] = {}
      data[r.anio][r.mes_num] = {
        total_subastas: r.total_subastas, ganadas: r.ganadas, no_autorizadas: r.no_autorizadas,
        valor_autorizado: r.valor_autorizado, valor_subastado: r.valor_subastado,
      }
    })

    if (resumenMensual.length > 0) {
      data[CURRENT_YEAR] = {}
      resumenMensual.forEach(r => {
        const idx = MESES_ES.indexOf((r.mes || '').toLowerCase().trim())
        if (idx >= 0) {
          data[CURRENT_YEAR][idx + 1] = {
            total_subastas: r.total_subastas, ganadas: r.ganadas, no_autorizadas: r.no_autorizadas,
            valor_autorizado: r.valor_autorizado, valor_subastado: r.valor_subastado,
          }
        }
      })
    }
    return data
  }, [resumenMensual, resumenHistorico])

  const aniosDisponibles = useMemo(
    () => Object.keys(allData).map(Number).sort((a, b) => a - b),
    [allData]
  )

  // Ajustar el año/rango por defecto una sola vez que llegan los datos
  useEffect(() => {
    if (!rangoInicializado && aniosDisponibles.length > 0) {
      const maxAnio = aniosDisponibles[aniosDisponibles.length - 1]
      setAnioObjetivo(maxAnio)
      const mesesDelAnio = Object.keys(allData[maxAnio] || {}).map(Number)
      if (mesesDelAnio.length > 0) setMesFin(Math.max(...mesesDelAnio))
      setRangoInicializado(true)
    }
  }, [aniosDisponibles, allData, rangoInicializado])

  const anioComparacion = anioObjetivo - 1
  const desde = Math.min(mesInicio, mesFin)
  const hasta = Math.max(mesInicio, mesFin)

  // ── Cálculo principal del comparativo ─────────────────────────────────────
  const analisis = useMemo(() => {
    const datosObjetivo = allData[anioObjetivo] || {}
    const datosComparacion = allData[anioComparacion] || {}

    const filas: Array<{
      mes: string; mesNum: number
      subastasObjetivo: number; subastasComparacion: number
      valorObjetivo: number; valorComparacion: number
      ganadasObjetivo: number; ganadasComparacion: number
    }> = []

    for (let m = desde; m <= hasta; m++) {
      const obj = datosObjetivo[m]
      const comp = datosComparacion[m]
      filas.push({
        mes: MESES_ES[m - 1].slice(0, 3),
        mesNum: m,
        subastasObjetivo: obj?.total_subastas || 0,
        subastasComparacion: comp?.total_subastas || 0,
        valorObjetivo: obj?.valor_autorizado || 0,
        valorComparacion: comp?.valor_autorizado || 0,
        ganadasObjetivo: obj?.ganadas || 0,
        ganadasComparacion: comp?.ganadas || 0,
      })
    }

    const filasConDatoObjetivo = filas.filter(f => (allData[anioObjetivo] || {})[f.mesNum] !== undefined)
    const filasConDatoComparacion = filas.filter(f => (allData[anioComparacion] || {})[f.mesNum] !== undefined)
    const n = filasConDatoObjetivo.length || 1
    const nComp = filasConDatoComparacion.length || 1

    const sum = (arr: typeof filas, key: keyof typeof filas[0]) => arr.reduce((a, f) => a + (f[key] as number), 0)

    const totalSubObj = sum(filasConDatoObjetivo, 'subastasObjetivo')
    const totalSubComp = sum(filasConDatoComparacion, 'subastasComparacion')
    const totalValObj = sum(filasConDatoObjetivo, 'valorObjetivo')
    const totalValComp = sum(filasConDatoComparacion, 'valorComparacion')
    const totalGanObj = sum(filasConDatoObjetivo, 'ganadasObjetivo')
    const totalGanComp = sum(filasConDatoComparacion, 'ganadasComparacion')

    const promSubObj = totalSubObj / n
    const promSubComp = totalSubComp / nComp
    const promValObj = totalValObj / n
    const promValComp = totalValComp / nComp

    const convObj = totalSubObj ? (totalGanObj / totalSubObj) * 100 : 0
    const convComp = totalSubComp ? (totalGanComp / totalSubComp) * 100 : 0
    const ticketObj = totalGanObj ? totalValObj / totalGanObj : 0
    const ticketComp = totalGanComp ? totalValComp / totalGanComp : 0

    const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0)

    // Mes con mejor y peor variación de facturación (solo meses con dato en ambos años)
    const filasComparables = filas.filter(f =>
      (allData[anioObjetivo] || {})[f.mesNum] !== undefined && (allData[anioComparacion] || {})[f.mesNum] !== undefined
    )
    const variaciones = filasComparables.map(f => ({
      mes: f.mes,
      varValor: pct(f.valorObjetivo, f.valorComparacion),
      varSub: pct(f.subastasObjetivo, f.subastasComparacion),
    }))
    const mejorMes = variaciones.length ? variaciones.reduce((a, b) => (b.varValor > a.varValor ? b : a)) : null
    const peorMes = variaciones.length ? variaciones.reduce((a, b) => (b.varValor < a.varValor ? b : a)) : null

    return {
      filas, n, nComp,
      totalSubObj, totalSubComp, totalValObj, totalValComp, totalGanObj, totalGanComp,
      promSubObj, promSubComp, promValObj, promValComp,
      convObj, convComp, ticketObj, ticketComp,
      varTotalSub: pct(totalSubObj, totalSubComp),
      varTotalVal: pct(totalValObj, totalValComp),
      varPromSub: pct(promSubObj, promSubComp),
      varPromVal: pct(promValObj, promValComp),
      varConv: convObj - convComp,
      varTicket: pct(ticketObj, ticketComp),
      mejorMes, peorMes,
      hayDatosComparacion: aniosDisponibles.includes(anioComparacion),
    }
  }, [allData, anioObjetivo, anioComparacion, desde, hasta, aniosDisponibles])

  if (loading) {
    return <div className="p-6"><p className="text-brand-subtle font-mono text-sm">Cargando análisis comparativo…</p></div>
  }

  const VarTag = ({ v, invert }: { v: number; invert?: boolean }) => {
    const positivo = invert ? v <= 0 : v >= 0
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-mono ${positivo ? 'text-brand-teal' : 'text-brand-red'}`}>
        {v >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {fmtPct(Math.abs(v))}
      </span>
    )
  }

  return (
    <div className="p-6">
      <Link href="/dashboard/facturacion/canales/subasta" className="inline-flex items-center gap-1.5 text-xs font-mono text-brand-subtle hover:text-brand-teal mb-4 transition-colors">
        <ArrowLeft size={13} /> Volver a Subasta
      </Link>

      <div className="mb-6">
        <h1 className="font-title text-2xl font-bold text-brand-text">Análisis Comparativo de Períodos</h1>
        <p className="text-brand-subtle text-sm mt-1">Elige año y rango de meses — se compara automáticamente contra el mismo período del año anterior</p>
      </div>

      {/* Selectores */}
      <div className="flex flex-wrap items-end gap-3 mb-6 p-4 bg-brand-surface border border-brand-border rounded-xl">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Año a analizar</span>
          <select value={anioObjetivo} onChange={e => setAnioObjetivo(Number(e.target.value))}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
            {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Mes desde</span>
          <select value={mesInicio} onChange={e => setMesInicio(Number(e.target.value))}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
            {MESES_ES.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Mes hasta</span>
          <select value={mesFin} onChange={e => setMesFin(Number(e.target.value))}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
            {MESES_ES.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
        </label>
        <div className="ml-auto text-right">
          <p className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Comparando contra</p>
          <p className="text-sm font-title font-semibold text-brand-gold">
            {anioComparacion} {!analisis.hayDatosComparacion && <span className="text-brand-red">(sin datos)</span>}
          </p>
        </div>
      </div>

      {!analisis.hayDatosComparacion ? (
        <div className="bg-brand-surface border border-dashed border-brand-border rounded-xl p-10 text-center">
          <AlertTriangle className="mx-auto mb-3 text-brand-gold" size={28} />
          <p className="text-brand-text font-title font-semibold mb-1">No hay datos de {anioComparacion} para comparar</p>
          <p className="text-brand-subtle text-sm">El histórico cargado cubre 2024 en adelante. Elige un año objetivo de 2025 o posterior.</p>
        </div>
      ) : (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            <KpiCard icon={<Gavel size={15} />} label={`Subastas totales ${anioObjetivo}`} value={analisis.totalSubObj}
              accent="teal" hint={`vs ${analisis.totalSubComp} en ${anioComparacion}`} />
            <KpiCard icon={<CheckCircle size={15} />} label="Subastas ganadas" value={analisis.totalGanObj}
              accent="blue" hint={`vs ${analisis.totalGanComp} en ${anioComparacion}`} />
            <KpiCard icon={<Percent size={15} />} label="% Conversión" value={fmtPct(analisis.convObj)}
              accent="gold" hint={`vs ${fmtPct(analisis.convComp)} en ${anioComparacion}`} />
            <KpiCard icon={<DollarSign size={15} />} label={`Facturación ${anioObjetivo}`} value={fmtM(analisis.totalValObj)}
              accent="teal" hint={fmtCOP(analisis.totalValObj)} />
            <KpiCard icon={<TrendingUp size={15} />} label="Ticket promedio" value={fmtM(analisis.ticketObj)}
              accent="gold" hint={`vs ${fmtM(analisis.ticketComp)} en ${anioComparacion}`} />
            <KpiCard icon={<Award size={15} />} label="Promedio mensual subastas" value={analisis.promSubObj.toFixed(1)}
              accent="blue" hint={`vs ${analisis.promSubComp.toFixed(1)} en ${anioComparacion}`} />
          </div>

          {/* Variaciones destacadas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-brand-surface border border-brand-border rounded-xl p-3">
              <p className="text-[10px] text-brand-muted font-mono uppercase mb-1">Var. subastas (total)</p>
              <VarTag v={analisis.varTotalSub} />
            </div>
            <div className="bg-brand-surface border border-brand-border rounded-xl p-3">
              <p className="text-[10px] text-brand-muted font-mono uppercase mb-1">Var. facturación (total)</p>
              <VarTag v={analisis.varTotalVal} />
            </div>
            <div className="bg-brand-surface border border-brand-border rounded-xl p-3">
              <p className="text-[10px] text-brand-muted font-mono uppercase mb-1">Var. promedio mensual</p>
              <VarTag v={analisis.varPromVal} />
            </div>
            <div className="bg-brand-surface border border-brand-border rounded-xl p-3">
              <p className="text-[10px] text-brand-muted font-mono uppercase mb-1">Var. % conversión (pp)</p>
              <VarTag v={analisis.varConv} />
            </div>
          </div>

          {/* Resumen ejecutivo */}
          {(analisis.mejorMes || analisis.peorMes) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              {analisis.mejorMes && (
                <div className="bg-brand-teal/5 border border-brand-teal/30 rounded-xl p-4">
                  <p className="text-xs text-brand-teal font-mono uppercase tracking-wider mb-1">Mejor mes vs {anioComparacion}</p>
                  <p className="font-title text-lg font-bold text-brand-text capitalize">{analisis.mejorMes.mes}</p>
                  <VarTag v={analisis.mejorMes.varValor} />
                  <span className="text-brand-muted text-xs ml-2">en facturación</span>
                </div>
              )}
              {analisis.peorMes && (
                <div className="bg-brand-red/5 border border-brand-red/30 rounded-xl p-4">
                  <p className="text-xs text-brand-red font-mono uppercase tracking-wider mb-1">Mes más débil vs {anioComparacion}</p>
                  <p className="font-title text-lg font-bold text-brand-text capitalize">{analisis.peorMes.mes}</p>
                  <VarTag v={analisis.peorMes.varValor} />
                  <span className="text-brand-muted text-xs ml-2">en facturación</span>
                </div>
              )}
            </div>
          )}

          {/* Gráficos de tendencia */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Panel title="Tendencia de subastas" sub={`${anioObjetivo} vs ${anioComparacion}, mes a mes`}>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={analisis.filas} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={{ stroke: '#2A3340' }} tickLine={false} />
                  <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [v, name === 'subastasObjetivo' ? String(anioObjetivo) : String(anioComparacion)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8' }} />
                  <Line type="monotone" dataKey="subastasComparacion" stroke="#5B6472" strokeWidth={2} dot={false} name={String(anioComparacion)} />
                  <Line type="monotone" dataKey="subastasObjetivo" stroke="#4FD1C5" strokeWidth={2.5} dot={{ r: 3 }} name={String(anioObjetivo)} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Tendencia de facturación" sub={`${anioObjetivo} vs ${anioComparacion}, mes a mes`}>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={analisis.filas} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={{ stroke: '#2A3340' }} tickLine={false} />
                  <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtM(v)} />
                  <Tooltip
                    contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [fmtCOP(v), name === 'valorObjetivo' ? String(anioObjetivo) : String(anioComparacion)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8' }} />
                  <Line type="monotone" dataKey="valorComparacion" stroke="#5B6472" strokeWidth={2} dot={false} name={String(anioComparacion)} />
                  <Line type="monotone" dataKey="valorObjetivo" stroke="#E8A33D" strokeWidth={2.5} dot={{ r: 3 }} name={String(anioObjetivo)} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* Barras comparativas lado a lado */}
          <div className="mb-4">
            <Panel title="Comparativo mensual (barras)" sub="Subastas ganadas vs total, ambos años">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={analisis.filas} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={{ stroke: '#2A3340' }} tickLine={false} />
                  <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8' }} />
                  <Bar dataKey="subastasComparacion" fill="#5B6472" radius={[4, 4, 0, 0]} name={`Total ${anioComparacion}`} />
                  <Bar dataKey="subastasObjetivo" fill="#4FD1C5" radius={[4, 4, 0, 0]} name={`Total ${anioObjetivo}`} />
                  <Bar dataKey="ganadasComparacion" fill="#8AA4C8" radius={[4, 4, 0, 0]} name={`Ganadas ${anioComparacion}`} />
                  <Bar dataKey="ganadasObjetivo" fill="#E8A33D" radius={[4, 4, 0, 0]} name={`Ganadas ${anioObjetivo}`} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* Tabla detallada mes a mes */}
          <Panel title="Detalle mes a mes" sub={`${anioObjetivo} vs ${anioComparacion} — subastas, facturación y variación`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border">
                    <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Mes</th>
                    <th className="text-right font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Subastas {anioObjetivo}</th>
                    <th className="text-right font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Subastas {anioComparacion}</th>
                    <th className="text-right font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Var. %</th>
                    <th className="text-right font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Factur. {anioObjetivo}</th>
                    <th className="text-right font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Factur. {anioComparacion}</th>
                    <th className="text-right font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3">Var. %</th>
                  </tr>
                </thead>
                <tbody>
                  {analisis.filas.map(f => {
                    const tieneObj = (allData[anioObjetivo] || {})[f.mesNum] !== undefined
                    const tieneComp = (allData[anioComparacion] || {})[f.mesNum] !== undefined
                    const varSub = tieneComp && f.subastasComparacion ? ((f.subastasObjetivo - f.subastasComparacion) / f.subastasComparacion) * 100 : null
                    const varVal = tieneComp && f.valorComparacion ? ((f.valorObjetivo - f.valorComparacion) / f.valorComparacion) * 100 : null
                    return (
                      <tr key={f.mes} className="border-b border-brand-border/40 hover:bg-brand-bg/50 transition-colors">
                        <td className="py-2.5 pr-4 text-brand-text capitalize font-medium">{f.mes}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-brand-text">{tieneObj ? f.subastasObjetivo : '—'}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-brand-muted">{tieneComp ? f.subastasComparacion : '—'}</td>
                        <td className="py-2.5 pr-4 text-right">{varSub !== null ? <VarTag v={varSub} /> : <span className="text-brand-muted">—</span>}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-brand-text">{tieneObj ? fmtM(f.valorObjetivo) : '—'}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-brand-muted">{tieneComp ? fmtM(f.valorComparacion) : '—'}</td>
                        <td className="py-2.5 text-right">{varVal !== null ? <VarTag v={varVal} /> : <span className="text-brand-muted">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
