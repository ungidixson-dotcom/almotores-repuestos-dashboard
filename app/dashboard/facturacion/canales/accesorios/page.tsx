'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Package, TrendingUp, ShoppingBag, Building2, Percent } from 'lucide-react'
import { KpiCard, Panel, fmtCOP, fmtM } from '@/components/dashboard-ui'

type FilaAccesorio = {
  fecha_cierre: string | null
  sede: string | null
  denominacion: string | null
  cantidad: number | null
  neto: number | null
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function FacturacionAccesoriosPage() {
  const [filas, setFilas] = useState<FilaAccesorio[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroSede, setFiltroSede] = useState('todas')
  const [filtroMes, setFiltroMes] = useState('todos')

  useEffect(() => {
    async function fetchData() {
      let all: FilaAccesorio[] = []
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data, error } = await supabase
          .from('facturas_accesorios')
          .select('fecha_cierre,sede,denominacion,cantidad,neto')
          .range(from, from + pageSize - 1)
        if (error || !data || data.length === 0) break
        all = all.concat(data as FilaAccesorio[])
        if (data.length < pageSize) break
        from += pageSize
      }
      setFilas(all)
      setLoading(false)
    }
    fetchData()
  }, [])

  const sedes = useMemo(() => {
    const s = filas.map(f => f.sede).filter((s): s is string => !!s)
    return ['todas', ...Array.from(new Set(s)).sort()]
  }, [filas])

  const mesesDisponibles = useMemo(() => {
    const map: Record<string, { label: string; orden: number }> = {}
    filas.forEach(f => {
      if (!f.fecha_cierre) return
      const d = new Date(f.fecha_cierre)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map[key]) map[key] = { label: `${MESES[d.getMonth()]} ${d.getFullYear()}`, orden: d.getFullYear() * 12 + d.getMonth() }
    })
    return Object.entries(map)
      .sort((a, b) => b[1].orden - a[1].orden)
      .map(([key, v]) => ({ key, label: v.label }))
  }, [filas])

  const ff = useMemo(
    () => filas.filter(f => {
      if (filtroSede !== 'todas' && f.sede !== filtroSede) return false
      if (filtroMes !== 'todos' && f.fecha_cierre) {
        const d = new Date(f.fecha_cierre)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (key !== filtroMes) return false
      }
      return true
    }),
    [filas, filtroSede, filtroMes]
  )

  const kpis = useMemo(() => {
    const ventas = ff.filter(f => (f.cantidad || 0) > 0)
    const totalNeto = ventas.reduce((a, f) => a + (f.neto || 0), 0)
    const numVentas = ventas.length
    const ticketProm = numVentas ? totalNeto / numVentas : 0
    const articulosUnicos = new Set(ventas.map(f => f.denominacion)).size
    return { totalNeto, numVentas, ticketProm, articulosUnicos }
  }, [ff])

  const porMes = useMemo(() => {
    const map: Record<string, { total: number; orden: number; label: string }> = {}
    ff.filter(f => (f.cantidad || 0) > 0 && f.fecha_cierre).forEach(f => {
      const d = new Date(f.fecha_cierre!)
      const orden = d.getFullYear() * 12 + d.getMonth()
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const label = `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
      if (!map[key]) map[key] = { total: 0, orden, label }
      map[key].total += f.neto || 0
    })
    return Object.values(map)
      .sort((a, b) => a.orden - b.orden)
      .map(({ label, total }) => ({ mes: label, total }))
  }, [ff])

  const porArticulo = useMemo(() => {
    const map: Record<string, number> = {}
    ff.filter(f => (f.cantidad || 0) > 0).forEach(f => {
      const key = f.denominacion || 'Sin descripción'
      map[key] = (map[key] || 0) + (f.neto || 0)
    })
    return Object.entries(map)
      .map(([articulo, total]) => ({ articulo, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [ff])

  const porSede = useMemo(() => {
    const map: Record<string, number> = {}
    ff.filter(f => (f.cantidad || 0) > 0).forEach(f => {
      const key = f.sede || 'Sin sede'
      map[key] = (map[key] || 0) + (f.neto || 0)
    })
    return Object.entries(map).map(([sede, total]) => ({ sede, total })).sort((a, b) => b.total - a.total)
  }, [ff])

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-brand-subtle font-mono text-sm">Cargando datos de Accesorios…</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-title text-2xl font-bold text-brand-text">Facturación · Accesorios</h1>
          <p className="text-brand-subtle text-sm mt-1">Datos sincronizados desde Google Sheet — 2023 a 2026</p>
        </div>
        <Link
          href="/dashboard/facturacion/canales/accesorios/comisiones"
          className="shrink-0 flex items-center gap-2 text-xs font-mono text-brand-gold hover:text-brand-text border border-brand-gold/40 hover:border-brand-gold rounded-lg px-3 py-2 transition-colors"
        >
          <Percent size={13} /> Ver Ventas vs Comisiones →
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 p-4 bg-brand-surface border border-brand-border rounded-xl">
        <span className="font-mono text-xs text-brand-muted self-center mr-2 uppercase tracking-wider">Filtrar por</span>
        <label className="flex items-center gap-2">
          <span className="text-xs text-brand-subtle">Sede</span>
          <select
            value={filtroSede}
            onChange={e => setFiltroSede(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal"
          >
            {sedes.map(s => <option key={s} value={s}>{s === 'todas' ? 'Todas' : s}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs text-brand-subtle">Mes de facturación</span>
          <select
            value={filtroMes}
            onChange={e => setFiltroMes(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal"
          >
            <option value="todos">Todos</option>
            {mesesDisponibles.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
        {(filtroSede !== 'todas' || filtroMes !== 'todos') && (
          <button
            onClick={() => { setFiltroSede('todas'); setFiltroMes('todos') }}
            className="ml-auto text-xs font-mono text-brand-muted hover:text-brand-red transition-colors border border-brand-border rounded-lg px-3 py-1.5"
          >
            × Limpiar filtros
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard icon={<TrendingUp size={15} />}  label="Total facturado" value={fmtM(kpis.totalNeto)} accent="teal" hint={fmtCOP(kpis.totalNeto)} />
        <KpiCard icon={<ShoppingBag size={15} />} label="Número de ventas" value={kpis.numVentas} accent="gold" />
        <KpiCard icon={<Package size={15} />}     label="Artículos únicos" value={kpis.articulosUnicos} accent="blue" />
        <KpiCard icon={<Building2 size={15} />}   label="Ticket promedio" value={fmtM(kpis.ticketProm)} accent="muted" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Facturación mensual" sub="Neto total por mes de cierre">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={porMes} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={{ stroke: '#2A3340' }} tickLine={false} />
              <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtM(v)} />
              <Tooltip
                contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#EAF0F6' }}
                formatter={(v: number) => fmtCOP(v)}
              />
              <Bar dataKey="total" fill="#4FD1C5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Facturación por sede" sub="Comparativo entre sedes">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={porSede} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtM(v)} />
              <YAxis type="category" dataKey="sede" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={{ stroke: '#2A3340' }} tickLine={false} width={90} />
              <Tooltip
                contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#EAF0F6' }}
                formatter={(v: number) => fmtCOP(v)}
              />
              <Bar dataKey="total" fill="#E8A33D" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Top artículos" sub="Los 8 artículos con mayor facturación neta en el periodo filtrado">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-6">Artículo</th>
                <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-6">Total facturado</th>
              </tr>
            </thead>
            <tbody>
              {porArticulo.map(a => (
                <tr key={a.articulo} className="border-b border-brand-border/40 hover:bg-brand-bg/50 transition-colors">
                  <td className="py-3 pr-6 text-brand-text">{a.articulo}</td>
                  <td className="py-3 pr-6 font-mono text-brand-teal font-semibold">{fmtCOP(a.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
