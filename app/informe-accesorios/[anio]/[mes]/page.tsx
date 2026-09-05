'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useInformeAcc } from '@/lib/informe-accesorios/useInformeAcc'
import {
  fmtM, fmtCOP, fmtNum, fmtPct, calcDelta,
  VITRINA_COLORS, VITRINAS, semaforoVentas, semaforoTicket,
  SEMAFORO_CLS, SEMAFORO_BADGE, VITRINA_BG, MESES,
} from '@/lib/informe-accesorios/utils'
import {
  KpiCard, VitrinaBadge, DeltaBadge, SemaforoBadge,
  ProgressBar, MesSelector, TablaHeader, RankBadge,
} from '@/lib/informe-accesorios/components/Shared'
import TabComparativo from '@/lib/informe-accesorios/components/TabComparativo'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'resumen',      label: 'Resumen'       },
  { id: 'areas',        label: 'Áreas de venta' },
  { id: 'ventas',       label: 'Por ventas'     },
  { id: 'ticket',       label: 'Por ticket'     },
  { id: 'vitrina',      label: 'Por vitrina'    },
  { id: 'comparativo',  label: 'Comparativo'    },
] as const

type TabId = typeof TABS[number]['id']

// ── Helpers de tooltip ────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-brand-surface border border-brand-border rounded-lg p-3 text-xs">
      <p className="text-brand-muted mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-brand-text font-mono">
          {p.name}: {fmtM(p.value)}
        </p>
      ))}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function InformeAccesoriosPage() {
  const router = useRouter()
  const params = useParams()

  // Parámetros de URL o valores por defecto (mes actual)
  const now = new Date()
  const [anio, setAnio] = useState<number>(
    params?.anio ? Number(params.anio) : now.getFullYear()
  )
  const [mes, setMes] = useState<number>(
    params?.mes ? Number(params.mes) : now.getMonth() + 1
  )
  const [tab, setTab] = useState<TabId>('resumen')

  // Verificar acceso — solo admin y gerente
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/login'); return }
      supabase
        .from('user_profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()
        .then(({ data: profile }) => {
          if (!profile || !['admin', 'gerente'].includes(profile.role)) {
            router.replace('/')
          }
        })
    })
  }, [router])

  const {
    resumen, vitrinas, asesores, areas,
    resumenMesAnt, resumenAnioAnt,
    vitrinasMesAnt, vitrinasAnioAnt,
    meses, loading, error,
  } = useInformeAcc(anio, mes)

  const handleMesChange = (a: number, m: number) => {
    setAnio(a)
    setMes(m)
    router.replace(`/informe-accesorios/${a}/${m}`, { scroll: false })
  }

  // ── Datos derivados ─────────────────────────────────────────────────────────

  // Áreas consolidadas para el tab de áreas
  const areaConsolidada = areas.reduce<Record<string, { facturas: number; ventas_neto: number; comisiones: number }>>(
    (acc, r) => {
      if (!acc[r.area]) acc[r.area] = { facturas: 0, ventas_neto: 0, comisiones: 0 }
      acc[r.area].facturas   += r.facturas
      acc[r.area].ventas_neto += r.ventas_neto
      acc[r.area].comisiones  += r.comisiones
      return acc
    }, {}
  )

  // Detalle de semanas para Comercial VN
  const semanasComercial = areas
    .filter(a => a.area === 'Comercial VN' && a.area_detalle !== 'Comercial' && a.area_detalle !== '#N/A')
    .sort((a, b) => {
      const nA = parseInt(a.area_detalle.replace('Semana ', ''))
      const nB = parseInt(b.area_detalle.replace('Semana ', ''))
      return nA - nB
    })

  // Datos del chart de comparativo vitrinas
  const chartVitrinas = VITRINAS.map(v => {
    const act  = vitrinas.find(x => x.vitrina === v)
    const mAnt = vitrinasMesAnt.find(x => x.vitrina === v)
    const aAnt = vitrinasAnioAnt.find(x => x.vitrina === v)
    return {
      vitrina: v,
      actual:   (act?.ventas_neto  ?? 0) / 1e6,
      mes_ant:  (mAnt?.ventas_neto ?? 0) / 1e6,
      anio_ant: (aAnt?.ventas_neto ?? 0) / 1e6,
    }
  })

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text font-sans">
      <div className="max-w-screen-xl mx-auto px-6 pb-16">

        {/* Header */}
        <div className="flex items-end justify-between py-8 border-b border-brand-border mb-6">
          <div>
            <h1 className="font-title text-xl font-bold text-brand-text">
              Accesorios{' '}
              <span className="text-brand-subtle">·</span>{' '}
              <span className="text-brand-gold">{MESES[mes - 1]} {anio}</span>
            </h1>
            <p className="text-brand-muted text-sm mt-1">
              Almotores KIA — Informe mensual de ventas y comisiones
            </p>
          </div>
          <div className="flex items-center gap-4">
            <MesSelector anio={anio} mes={mes} meses={meses} onChange={handleMesChange} />
            <span className="text-brand-muted text-xs">Objetivo ticket: {fmtCOP(resumen?.ticket_objetivo ?? 2600000)}</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-brand-red rounded-lg p-4 mb-6 text-brand-red text-sm">
            Error cargando datos: {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-brand-border mb-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-brand-gold text-brand-text'
                  : 'border-transparent text-brand-muted hover:text-brand-subtle'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-brand-surface rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!loading && (
          <>
            {/* ══ TAB RESUMEN ══ */}
            {tab === 'resumen' && (
              <div className="space-y-6">
                {/* KPIs */}
                <div className="grid grid-cols-4 gap-3">
                  <KpiCard
                    label="Ventas netas"
                    value={fmtM(resumen?.ventas_neto)}
                    sub={`${fmtPct(resumen?.pct_meta_ventas)} de meta · obj ${fmtM(resumen?.meta_ventas)}`}
                    subColor={SEMAFORO_CLS[semaforoVentas(resumen?.pct_meta_ventas ?? null)]}
                  />
                  <KpiCard
                    label="Vehículos accesorios"
                    value={fmtNum(resumen?.vehiculos)}
                    sub={`${fmtPct(resumen?.pct_meta_vehiculos)} de meta · obj ${resumen?.meta_vehiculos ?? '—'}`}
                    subColor={SEMAFORO_CLS[semaforoVentas(resumen?.pct_meta_vehiculos ?? null)]}
                  />
                  <KpiCard
                    label="Ticket promedio"
                    value={fmtM(resumen?.ticket_promedio)}
                    sub={`vs objetivo ${fmtCOP(resumen?.ticket_objetivo ?? 0)}`}
                    subColor={SEMAFORO_CLS[semaforoTicket(resumen?.ticket_promedio ?? null, resumen?.ticket_objetivo ?? 2600000)]}
                  />
                  <KpiCard
                    label="Comisiones"
                    value={fmtM(resumen?.comisiones)}
                    sub={`${fmtPct(resumen?.pct_comision)} s/ ventas · ${resumen?.facturas ?? '—'} facturas`}
                    subColor="text-brand-muted"
                  />
                </div>

                {/* Áreas resumen */}
                <div>
                  <p className="text-xs font-medium text-brand-muted uppercase tracking-widest mb-3">Ventas por área</p>
                  <div className="grid grid-cols-3 gap-3">
                    {['Comercial VN', 'Accesorios', 'Taller'].map(area => {
                      const d = areaConsolidada[area]
                      const pct = d && resumen ? (d.ventas_neto / resumen.ventas_neto * 100) : 0
                      return (
                        <div key={area} className="bg-brand-surface border border-brand-border rounded-lg p-4">
                          <div className="flex justify-between items-center mb-2">
                            <p className="text-sm font-medium text-brand-text">{area}</p>
                            <p className="text-xs text-brand-muted font-mono">{fmtPct(pct)}</p>
                          </div>
                          <p className="font-mono text-lg font-medium text-brand-text">{fmtM(d?.ventas_neto)}</p>
                          <p className="text-xs text-brand-muted mt-1">{fmtNum(d?.facturas)} facturas · comisiones {fmtM(d?.comisiones)}</p>
                          <ProgressBar pct={pct} color="bg-brand-subtle" />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Vitrinas */}
                <div>
                  <p className="text-xs font-medium text-brand-muted uppercase tracking-widest mb-3">Resultado por vitrina</p>
                  <div className="grid grid-cols-2 gap-3">
                    {vitrinas
                      .filter(v => VITRINAS.includes(v.vitrina as any))
                      .sort((a, b) => (b.ventas_neto ?? 0) - (a.ventas_neto ?? 0))
                      .map(v => (
                        <div key={v.vitrina} className="bg-brand-surface border border-brand-border rounded-lg p-4">
                          <div className="flex justify-between items-center mb-3">
                            <VitrinaBadge vitrina={v.vitrina} />
                            <SemaforoBadge pct={v.pct_meta_ventas} />
                          </div>
                          <p className="font-mono text-xl font-medium text-brand-text mb-2">{fmtM(v.ventas_neto)}</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-brand-muted">Vehículos</span>
                              <span className="text-brand-text font-medium">{v.vehiculos ?? '—'} / {v.meta_vehiculos ?? '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-brand-muted">Ticket promedio</span>
                              <span className={`font-medium ${SEMAFORO_CLS[semaforoTicket(v.ticket_promedio, v.ticket_objetivo ?? 2600000)]}`}>
                                {fmtM(v.ticket_promedio)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-brand-muted">Facturas</span>
                              <span className="text-brand-text font-medium">{fmtNum(v.facturas)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-brand-muted">Comisiones</span>
                              <span className="text-brand-text font-medium">{fmtM(v.comisiones)}</span>
                            </div>
                          </div>
                          <ProgressBar pct={v.pct_meta_ventas} />
                          <div className="flex justify-between text-xs text-brand-muted mt-1">
                            <span>$0</span>
                            <span>Meta {fmtM(v.meta_ventas)}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Ticket vs objetivo */}
                <div>
                  <p className="text-xs font-medium text-brand-muted uppercase tracking-widest mb-3">Ticket promedio vs objetivo por vitrina</p>
                  <div className="border border-brand-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <TablaHeader cols={[
                        { label: 'Vitrina' },
                        { label: 'Ticket real',   right: true },
                        { label: 'Objetivo',       right: true },
                        { label: 'Diferencia',     right: true },
                        { label: 'Vehículos',      right: true },
                        { label: 'Cumplimiento',   right: true },
                      ]} />
                      <tbody>
                        {[...vitrinas]
                          .filter(v => VITRINAS.includes(v.vitrina as any))
                          .sort((a, b) => (b.ticket_promedio ?? 0) - (a.ticket_promedio ?? 0))
                          .map(v => {
                            const obj = v.ticket_objetivo ?? 2600000
                            const diff = (v.ticket_promedio ?? 0) - obj
                            const s = semaforoTicket(v.ticket_promedio, obj)
                            return (
                              <tr key={v.vitrina} className="border-t border-brand-border hover:bg-brand-surface/50">
                                <td className="px-3 py-2"><VitrinaBadge vitrina={v.vitrina} /></td>
                                <td className={`px-3 py-2 font-mono font-medium text-right ${SEMAFORO_CLS[s]}`}>{fmtCOP(v.ticket_promedio)}</td>
                                <td className="px-3 py-2 font-mono text-brand-muted text-right">{fmtCOP(obj)}</td>
                                <td className={`px-3 py-2 font-mono text-right ${diff >= 0 ? 'text-brand-teal' : 'text-brand-red'}`}>
                                  {diff >= 0 ? '+' : ''}{fmtCOP(diff)}
                                </td>
                                <td className="px-3 py-2 font-mono text-brand-muted text-right">{fmtNum(v.vehiculos)}</td>
                                <td className={`px-3 py-2 font-mono text-right font-medium ${SEMAFORO_CLS[s]}`}>
                                  {fmtPct(v.ticket_promedio && obj ? (v.ticket_promedio / obj * 100) : null)}
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TAB ÁREAS ══ */}
            {tab === 'areas' && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  {['Comercial VN', 'Accesorios', 'Taller'].map(area => {
                    const d = areaConsolidada[area]
                    const pct = d && resumen ? (d.ventas_neto / resumen.ventas_neto * 100) : 0
                    return (
                      <div key={area} className="bg-brand-surface border border-brand-border rounded-lg p-4">
                        <div className="flex justify-between mb-2">
                          <p className="text-sm font-medium">{area}</p>
                          <p className="text-xs text-brand-muted font-mono">{fmtPct(pct)}</p>
                        </div>
                        <p className="font-mono text-xl font-medium">{fmtM(d?.ventas_neto)}</p>
                        <p className="text-xs text-brand-muted mt-1">{fmtNum(d?.facturas)} facturas · comisiones {fmtM(d?.comisiones)}</p>
                      </div>
                    )
                  })}
                </div>

                {/* Desglose por vitrina */}
                <div>
                  <p className="text-xs font-medium text-brand-muted uppercase tracking-widest mb-3">Distribución por área y vitrina</p>
                  <div className="border border-brand-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <TablaHeader cols={[
                        { label: 'Vitrina' },
                        { label: 'Comercial VN', right: true },
                        { label: 'Accesorios',   right: true },
                        { label: 'Taller',        right: true },
                        { label: 'Total',         right: true },
                      ]} />
                      <tbody>
                        {VITRINAS.map(vit => {
                          const v = vitrinas.find(x => x.vitrina === vit)
                          return (
                            <tr key={vit} className="border-t border-brand-border hover:bg-brand-surface/50">
                              <td className="px-3 py-2"><VitrinaBadge vitrina={vit} /></td>
                              <td className="px-3 py-2 font-mono text-brand-text text-right">{v ? fmtM(v.comercial_vn) : '—'}</td>
                              <td className="px-3 py-2 font-mono text-brand-muted text-right">{v && v.accesorios > 0 ? fmtM(v.accesorios) : '—'}</td>
                              <td className="px-3 py-2 font-mono text-brand-muted text-right">{v && v.taller > 0 ? fmtM(v.taller) : '—'}</td>
                              <td className="px-3 py-2 font-mono text-brand-text font-medium text-right">{fmtM(v?.ventas_neto)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="px-3 py-2 font-medium text-brand-text">Total</td>
                          <td className="px-3 py-2 font-mono font-medium text-brand-text text-right">{fmtM(areaConsolidada['Comercial VN']?.ventas_neto)}</td>
                          <td className="px-3 py-2 font-mono font-medium text-brand-text text-right">{fmtM(areaConsolidada['Accesorios']?.ventas_neto)}</td>
                          <td className="px-3 py-2 font-mono font-medium text-brand-text text-right">{fmtM(areaConsolidada['Taller']?.ventas_neto)}</td>
                          <td className="px-3 py-2 font-mono font-medium text-brand-text text-right">{fmtM(resumen?.ventas_neto)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Desglose semanas */}
                {semanasComercial.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-brand-muted uppercase tracking-widest mb-3">Facturación por semana — Comercial VN</p>
                    <div className="border border-brand-border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <TablaHeader cols={[
                          { label: 'Período' },
                          { label: 'Ventas',     right: true },
                          { label: 'Facturas',   right: true },
                          { label: 'Comisiones', right: true },
                          { label: '% s/ CV',    right: true },
                        ]} />
                        <tbody>
                          {semanasComercial.map(s => {
                            const base = areaConsolidada['Comercial VN']?.ventas_neto
                            const pct  = base ? (s.ventas_neto / base * 100) : 0
                            return (
                              <tr key={s.area_detalle} className="border-t border-brand-border hover:bg-brand-surface/50">
                                <td className="px-3 py-2 font-medium">{s.area_detalle}</td>
                                <td className="px-3 py-2 font-mono text-right">{fmtM(s.ventas_neto)}</td>
                                <td className="px-3 py-2 font-mono text-brand-muted text-right">{s.facturas}</td>
                                <td className="px-3 py-2 font-mono text-brand-muted text-right">{fmtM(s.comisiones)}</td>
                                <td className="px-3 py-2 font-mono text-brand-muted text-right">{fmtPct(pct)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ TAB POR VENTAS ══ */}
            {tab === 'ventas' && (
              <div className="border border-brand-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <TablaHeader cols={[
                    { label: '#', right: true },
                    { label: 'Asesor' },
                    { label: 'Vitrina' },
                    { label: 'Ventas', right: true },
                    { label: 'Veh',    right: true },
                    { label: 'Fact',   right: true },
                    { label: 'Comisión', right: true },
                    { label: 'Tipo' },
                  ]} />
                  <tbody>
                    {asesores.map((a, i) => (
                      <tr key={`${a.nombre_dropbox}-${a.vitrina}`}
                          className="border-t border-brand-border hover:bg-brand-surface/50">
                        <td className="px-3 py-2 text-right">
                          {i < 3 ? <RankBadge rank={i + 1} /> :
                            <span className="text-brand-muted text-xs font-mono">{i + 1}</span>}
                        </td>
                        <td className="px-3 py-2 font-medium text-brand-text">{a.nombre_dropbox}</td>
                        <td className="px-3 py-2"><VitrinaBadge vitrina={a.vitrina} /></td>
                        <td className={`px-3 py-2 font-mono text-right font-medium ${a.ventas_neto < 0 ? 'text-brand-red' : 'text-brand-text'}`}>
                          {fmtM(a.ventas_neto)}
                        </td>
                        <td className="px-3 py-2 font-mono text-brand-muted text-right">{a.vehiculos ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-brand-muted text-right">{a.facturas}</td>
                        <td className="px-3 py-2 font-mono text-brand-muted text-right">{fmtM(a.comisiones)}</td>
                        <td className="px-3 py-2">
                          {a.solo_accesorios && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300">Mostrador</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ══ TAB POR TICKET ══ */}
            {tab === 'ticket' && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-xs text-brand-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-brand-teal inline-block"/>
                    ≥ {fmtCOP(resumen?.ticket_objetivo ?? 2600000)} — supera objetivo
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-brand-gold inline-block"/>
                    $1.800.000 – {fmtCOP((resumen?.ticket_objetivo ?? 2600000) - 1)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-brand-red inline-block"/>
                    {'< $1.800.000'}
                  </span>
                </div>
                <div className="border border-brand-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <TablaHeader cols={[
                      { label: '#', right: true },
                      { label: 'Asesor' },
                      { label: 'Vitrina' },
                      { label: 'Ticket',  right: true },
                      { label: 'vs objetivo', right: false },
                      { label: 'Ventas',  right: true },
                      { label: 'Veh',     right: true },
                    ]} />
                    <tbody>
                      {asesores
                        .filter(a => !a.solo_accesorios && a.ticket_promedio != null && a.ticket_promedio > 0)
                        .sort((a, b) => (b.ticket_promedio ?? 0) - (a.ticket_promedio ?? 0))
                        .map((a, i) => {
                          const obj = resumen?.ticket_objetivo ?? 2600000
                          const s   = semaforoTicket(a.ticket_promedio, obj)
                          const pct = a.ticket_promedio ? Math.min((a.ticket_promedio / obj) * 100, 100) : 0
                          return (
                            <tr key={`${a.nombre_dropbox}-${a.vitrina}`}
                                className="border-t border-brand-border hover:bg-brand-surface/50">
                              <td className="px-3 py-2 text-right">
                                {i < 3 ? <RankBadge rank={i + 1} /> :
                                  <span className="text-brand-muted text-xs font-mono">{i + 1}</span>}
                              </td>
                              <td className="px-3 py-2 font-medium">{a.nombre_dropbox}</td>
                              <td className="px-3 py-2"><VitrinaBadge vitrina={a.vitrina} /></td>
                              <td className={`px-3 py-2 font-mono font-medium text-right ${SEMAFORO_CLS[s]}`}>
                                {fmtCOP(a.ticket_promedio)}
                              </td>
                              <td className="px-3 py-2 w-24">
                                <div className="w-full bg-brand-border rounded-full h-1 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${s === 'ok' ? 'bg-brand-teal' : s === 'warn' ? 'bg-brand-gold' : 'bg-brand-red'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-2 font-mono text-brand-muted text-right">{fmtM(a.ventas_neto)}</td>
                              <td className="px-3 py-2 font-mono text-brand-muted text-right">{a.vehiculos ?? '—'}</td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                  <p className="text-xs text-brand-muted px-3 py-2 border-t border-brand-border">
                    Excluye asesores de mostrador y asesores con neto negativo en el mes.
                  </p>
                </div>
              </div>
            )}

            {/* ══ TAB POR VITRINA ══ */}
            {tab === 'vitrina' && (
              <div className="space-y-8">
                {VITRINAS.map(vit => {
                  const vitData  = vitrinas.find(v => v.vitrina === vit)
                  const asesVit  = asesores
                    .filter(a => a.vitrina === vit)
                    .sort((a, b) => (b.ventas_neto ?? 0) - (a.ventas_neto ?? 0))
                  const sinVeh   = asesVit.filter(a => !a.solo_accesorios && !a.vehiculos)

                  return (
                    <div key={vit}>
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="font-title font-bold text-brand-text">{vit}</h3>
                        <SemaforoBadge pct={vitData?.pct_meta_ventas ?? null} />
                        <div className="flex gap-4 text-xs text-brand-muted">
                          <span>Ventas <span className="font-mono text-brand-text">{fmtM(vitData?.ventas_neto)}</span></span>
                          <span>Veh <span className="font-mono text-brand-text">{vitData?.vehiculos ?? '—'}/{vitData?.meta_vehiculos ?? '—'} ({fmtPct(vitData?.pct_meta_vehiculos)})</span></span>
                          <span>Comisiones <span className="font-mono text-brand-text">{fmtM(vitData?.comisiones)}</span></span>
                          <span>Facturas <span className="font-mono text-brand-text">{fmtNum(vitData?.facturas)}</span></span>
                        </div>
                      </div>
                      <div className="border border-brand-border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <TablaHeader cols={[
                            { label: '#', right: true },
                            { label: 'Asesor' },
                            { label: 'Ventas',   right: true },
                            { label: 'Ticket',   right: true },
                            { label: 'vs obj.',  right: false },
                            { label: 'Veh',      right: true },
                            { label: 'Fact',     right: true },
                            { label: 'Comisión', right: true },
                          ]} />
                          <tbody>
                            {asesVit.map((a, i) => {
                              const obj = vitData?.ticket_objetivo ?? 2600000
                              const s   = a.solo_accesorios
                                ? 'ok'
                                : semaforoTicket(a.ticket_promedio, obj)
                              const pct = a.ticket_promedio
                                ? Math.min((a.ticket_promedio / obj) * 100, 100)
                                : 0
                              return (
                                <tr key={`${a.nombre_dropbox}-${a.vitrina}`}
                                    className={`border-t border-brand-border hover:bg-brand-surface/50 ${
                                      a.solo_accesorios ? 'bg-emerald-900/5' : ''
                                    }`}>
                                  <td className="px-3 py-2 text-right">
                                    {i < 3 ? <RankBadge rank={i + 1} /> :
                                      <span className="text-brand-muted text-xs font-mono">{i + 1}</span>}
                                  </td>
                                  <td className="px-3 py-2 font-medium">
                                    {a.nombre_dropbox}
                                    {a.solo_accesorios && (
                                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300">Mostrador</span>
                                    )}
                                  </td>
                                  <td className={`px-3 py-2 font-mono font-medium text-right ${a.ventas_neto < 0 ? 'text-brand-red' : ''}`}>
                                    {fmtM(a.ventas_neto)}
                                  </td>
                                  <td className={`px-3 py-2 font-mono text-right ${a.solo_accesorios ? 'text-brand-muted' : SEMAFORO_CLS[s]}`}>
                                    {a.solo_accesorios ? '—' : fmtCOP(a.ticket_promedio)}
                                  </td>
                                  <td className="px-3 py-2 w-20">
                                    {!a.solo_accesorios && (
                                      <div className="w-full bg-brand-border rounded-full h-1 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${s === 'ok' ? 'bg-brand-teal' : s === 'warn' ? 'bg-brand-gold' : 'bg-brand-red'}`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-brand-muted text-right">{a.vehiculos ?? '—'}</td>
                                  <td className="px-3 py-2 font-mono text-brand-muted text-right">{a.facturas}</td>
                                  <td className="px-3 py-2 font-mono text-brand-muted text-right">{fmtM(a.comisiones)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={2} className="px-3 py-2 font-medium text-brand-text">Total {vit}</td>
                              <td className="px-3 py-2 font-mono font-medium text-brand-text text-right">{fmtM(vitData?.ventas_neto)}</td>
                              <td className="px-3 py-2 font-mono text-brand-muted text-right text-xs">{fmtPct(vitData?.pct_meta_ventas)} meta</td>
                              <td />
                              <td className="px-3 py-2 font-mono font-medium text-brand-text text-right">
                                {vitData?.vehiculos ?? '—'}<span className="text-brand-muted">/{vitData?.meta_vehiculos ?? '—'}</span>
                              </td>
                              <td className="px-3 py-2 font-mono text-brand-muted text-right">{fmtNum(vitData?.facturas)}</td>
                              <td className="px-3 py-2 font-mono font-medium text-brand-text text-right">{fmtM(vitData?.comisiones)}</td>
                            </tr>
                          </tfoot>
                        </table>
                        {sinVeh.length > 0 && (
                          <p className="text-xs text-brand-muted px-3 py-2 border-t border-brand-border">
                            Sin vehículos en {MESES[mes - 1]} (desfase de facturación): {sinVeh.map(a => a.nombre_dropbox).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ══ TAB COMPARATIVO ══ */}
            {tab === 'comparativo' && (
              <TabComparativo
                actual={resumen}
                mesAnterior={resumenMesAnt}
                anioAnterior={resumenAnioAnt}
                vitrinasAct={vitrinas}
                vitrinasMesAnt={vitrinasMesAnt}
                vitrinasAnioAnt={vitrinasAnioAnt}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
