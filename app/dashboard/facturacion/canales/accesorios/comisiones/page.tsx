'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { ArrowLeft, TrendingUp, Percent, DollarSign, TrendingDown } from 'lucide-react'
import { KpiCard, Panel, fmtCOP, fmtM, fmtPct } from '@/components/dashboard-ui'

type FilaVC = {
  anio: number
  mes_num: number
  mes: string
  sede: string
  ventas: number | null
  comisiones: number | null
  datos_completos: boolean
}

type FilaCat = {
  anio: number
  mes: string
  categoria: string
  valor: number | null
}

const MESES_ORDEN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
// Las "categorías" que en realidad son sedes, para separarlas de los tipos de comisión reales
const SEDES_EN_CATEGORIA = new Set(['Norte', 'Pasoancho', 'Sede 39'])

export default function ComisionesVsVentasPage() {
  const [filasVC, setFilasVC] = useState<FilaVC[]>([])
  const [filasCat, setFilasCat] = useState<FilaCat[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroAnio, setFiltroAnio] = useState('todos')
  const [filtroSede, setFiltroSede] = useState('Todas')

  useEffect(() => {
    async function fetchData() {
      const [{ data: vc }, { data: cat }] = await Promise.all([
        supabase.from('ventas_comisiones_accesorios').select('anio,mes_num,mes,sede,ventas,comisiones,datos_completos'),
        supabase.from('comisiones_categoria').select('anio,mes,categoria,valor'),
      ])
      setFilasVC((vc as FilaVC[]) || [])
      setFilasCat((cat as FilaCat[]) || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  const anios = useMemo(() => {
    const a = Array.from(new Set(filasVC.map(f => f.anio))).sort()
    return ['todos', ...a.map(String)]
  }, [filasVC])

  const sedes = useMemo(() => {
    const s = Array.from(new Set(filasVC.map(f => f.sede))).filter(s => s !== 'Todas').sort()
    return ['Todas', ...s]
  }, [filasVC])

  const vcFiltrado = useMemo(() => filasVC.filter(f =>
    f.sede === filtroSede &&
    (filtroAnio === 'todos' || String(f.anio) === filtroAnio) &&
    f.datos_completos
  ), [filasVC, filtroSede, filtroAnio])

  const kpis = useMemo(() => {
    const totalVentas = vcFiltrado.reduce((a, f) => a + (f.ventas || 0), 0)
    const totalComisiones = vcFiltrado.reduce((a, f) => a + (f.comisiones || 0), 0)
    const pctComision = totalVentas ? (totalComisiones / totalVentas) * 100 : 0
    return { totalVentas, totalComisiones, pctComision }
  }, [vcFiltrado])

  const evolucionMensual = useMemo(() => {
    return vcFiltrado
      .slice()
      .sort((a, b) => a.anio * 12 + a.mes_num - (b.anio * 12 + b.mes_num))
      .map(f => ({
        periodo: `${f.mes.slice(0, 3)} ${String(f.anio).slice(2)}`,
        ventas: f.ventas || 0,
        comisiones: f.comisiones || 0,
        pct: f.ventas ? ((f.comisiones || 0) / f.ventas) * 100 : 0,
      }))
  }, [vcFiltrado])

  const porAnio = useMemo(() => {
    const map: Record<number, { ventas: number; comisiones: number }> = {}
    filasVC.filter(f => f.sede === filtroSede && f.datos_completos).forEach(f => {
      if (!map[f.anio]) map[f.anio] = { ventas: 0, comisiones: 0 }
      map[f.anio].ventas += f.ventas || 0
      map[f.anio].comisiones += f.comisiones || 0
    })
    return Object.entries(map)
      .map(([anio, v]) => ({ anio, ...v, pct: v.ventas ? (v.comisiones / v.ventas) * 100 : 0 }))
      .sort((a, b) => a.anio.localeCompare(b.anio))
  }, [filasVC, filtroSede])

  const porSede = useMemo(() => {
    const map: Record<string, { ventas: number; comisiones: number }> = {}
    filasVC.filter(f => f.sede !== 'Todas' && f.datos_completos && (filtroAnio === 'todos' || String(f.anio) === filtroAnio)).forEach(f => {
      if (!map[f.sede]) map[f.sede] = { ventas: 0, comisiones: 0 }
      map[f.sede].ventas += f.ventas || 0
      map[f.sede].comisiones += f.comisiones || 0
    })
    return Object.entries(map)
      .map(([sede, v]) => ({ sede, ...v, pct: v.ventas ? (v.comisiones / v.ventas) * 100 : 0 }))
      .sort((a, b) => b.ventas - a.ventas)
  }, [filasVC, filtroAnio])

  const porCategoria = useMemo(() => {
    const map: Record<string, number> = {}
    filasCat
      .filter(f => !SEDES_EN_CATEGORIA.has(f.categoria) && (filtroAnio === 'todos' || String(f.anio) === filtroAnio))
      .forEach(f => { map[f.categoria] = (map[f.categoria] || 0) + (f.valor || 0) })
    return Object.entries(map)
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total)
  }, [filasCat, filtroAnio])

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-brand-subtle font-mono text-sm">Cargando análisis de comisiones…</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <Link
        href="/dashboard/facturacion/canales/accesorios"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-brand-subtle hover:text-brand-teal mb-4 transition-colors"
      >
        <ArrowLeft size={13} /> Volver a Accesorios
      </Link>

      <div className="mb-6">
        <h1 className="font-title text-2xl font-bold text-brand-text">Ventas vs Comisiones Pagadas</h1>
        <p className="text-brand-subtle text-sm mt-1">Informe gerencial — Enero 2023 a Julio 2026 (mes en curso parcial)</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-6 p-4 bg-brand-surface border border-brand-border rounded-xl">
        <span className="font-mono text-xs text-brand-muted self-center mr-2 uppercase tracking-wider">Filtrar por</span>
        <label className="flex items-center gap-2">
          <span className="text-xs text-brand-subtle">Año</span>
          <select value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
            {anios.map(a => <option key={a} value={a}>{a === 'todos' ? 'Todos' : a}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs text-brand-subtle">Sede</span>
          <select value={filtroSede} onChange={e => setFiltroSede(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
            {sedes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <KpiCard icon={<TrendingUp size={15} />} label="Ventas del periodo" value={fmtM(kpis.totalVentas)} accent="teal" hint={fmtCOP(kpis.totalVentas)} />
        <KpiCard icon={<DollarSign size={15} />} label="Comisiones pagadas" value={fmtM(kpis.totalComisiones)} accent="gold" hint={fmtCOP(kpis.totalComisiones)} />
        <KpiCard icon={<Percent size={15} />} label="% Comisión / Venta" value={fmtPct(kpis.pctComision)} accent="blue" />
      </div>

      {/* Evolución mensual */}
      <div className="mb-4">
        <Panel title="Evolución mensual: Ventas vs Comisiones" sub={`Sede: ${filtroSede} · ${filtroAnio === 'todos' ? 'Todos los años' : filtroAnio}`}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={evolucionMensual} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false} />
              <XAxis dataKey="periodo" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={{ stroke: '#2A3340' }} tickLine={false}
                interval={Math.max(0, Math.floor(evolucionMensual.length / 15))} />
              <YAxis yAxisId="izq" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtM(v)} />
              <Tooltip
                contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#EAF0F6' }}
                formatter={(v: number, name: string) => [fmtCOP(v), name === 'ventas' ? 'Ventas' : 'Comisiones']}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#8AA4C8' }} />
              <Line yAxisId="izq" type="monotone" dataKey="ventas" stroke="#4FD1C5" strokeWidth={2.5} dot={false} name="Ventas" />
              <Line yAxisId="izq" type="monotone" dataKey="comisiones" stroke="#E8A33D" strokeWidth={2.5} dot={false} name="Comisiones" />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Comparativo anual" sub="Ventas, comisiones y % sobre venta por año (solo meses con datos completos)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Año', 'Ventas', 'Comisiones', '% Comisión/Venta'].map(h => (
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porAnio.map(a => (
                  <tr key={a.anio} className="border-b border-brand-border/40 hover:bg-brand-bg/50 transition-colors">
                    <td className="py-3 pr-6 text-brand-text font-medium">{a.anio}</td>
                    <td className="py-3 pr-6 font-mono text-brand-subtle">{fmtCOP(a.ventas)}</td>
                    <td className="py-3 pr-6 font-mono text-brand-gold font-semibold">{fmtCOP(a.comisiones)}</td>
                    <td className="py-3 pr-6 font-mono text-brand-teal">{fmtPct(a.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Comparativo por sede" sub={filtroAnio === 'todos' ? 'Todos los años' : `Año ${filtroAnio}`}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porSede} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false} />
              <XAxis dataKey="sede" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={{ stroke: '#2A3340' }} tickLine={false} />
              <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtM(v)} />
              <Tooltip
                contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, name: string) => [fmtCOP(v), name === 'ventas' ? 'Ventas' : 'Comisiones']}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#8AA4C8' }} />
              <Bar dataKey="ventas" fill="#4FD1C5" radius={[4, 4, 0, 0]} name="Ventas" />
              <Bar dataKey="comisiones" fill="#E8A33D" radius={[4, 4, 0, 0]} name="Comisiones" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Comisiones por tipo" sub="Incentivos, colisión y venta de extintores/aditivos — no incluye el prorrateo por sede">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={porCategoria} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtM(v)} />
            <YAxis type="category" dataKey="categoria" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={false} tickLine={false} width={160} />
            <Tooltip
              contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => fmtCOP(v)}
            />
            <Bar dataKey="total" fill="#8AA4C8" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  )
}
