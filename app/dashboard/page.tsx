'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { LogOut, TrendingUp, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'

const COLORES_ESTADO: Record<string, string> = {
  'Autorizada Completa': '#4FD1C5',
  'Autorizada parcial':  '#E8A33D',
  'NO Autorizada':       '#E5484D',
  'Subasta no aplicada': '#5B6472',
}

const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`

type Subasta = {
  id: number; placa: string; marca: string
  aseguradora_id: number; asesor_id: number
  estado_subasta: string; fecha_subasta: string
  valor_subastado: number; valor_autorizado: number
  estado_autorizacion: string; ciudad_destino: string
  mes_subasta: string; anio: number
  estado_radicacion_factura: string
  aseguradoras: { nombre_corto: string } | null
  asesores: { nombre: string } | null
}

type Factura = {
  id: number; placa: string; aseguradora_id: number
  est_radicacion: string; fecha_radicado: string
  base_imp: number; mes: string
  aseguradoras: { nombre_corto: string } | null
  asesores: { nombre: string } | null
}

export default function Dashboard() {
  const router = useRouter()
  const [subastas, setSubastas] = useState<Subasta[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroAsesor, setFiltroAsesor] = useState('todos')
  const [filtroAseguradora, setFiltroAseguradora] = useState('todas')
  const [filtroMes, setFiltroMes] = useState('todos')

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: s }, { data: f }] = await Promise.all([
        supabase.from('subastas')
          .select('*, aseguradoras(nombre_corto), asesores(nombre)')
          .order('fecha_subasta', { ascending: false }),
        supabase.from('facturas')
          .select('*, aseguradoras(nombre_corto), asesores(nombre)')
          .order('fecha', { ascending: false }),
      ])
      setSubastas((s as Subasta[]) || [])
      setFacturas((f as Factura[]) || [])
      setLoading(false)
    }
    fetchData()
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const asesores = useMemo(() =>
    ['todos', ...new Set(subastas.map(s => s.asesores?.nombre).filter(Boolean) as string[])],
    [subastas])
  const aseguradoras = useMemo(() =>
    ['todas', ...new Set(subastas.map(s => s.aseguradoras?.nombre_corto).filter(Boolean) as string[])],
    [subastas])
  const meses = useMemo(() =>
    ['todos', ...new Set(subastas.map(s => s.mes_subasta).filter(Boolean) as string[])],
    [subastas])

  const sf = useMemo(() => subastas.filter(s => {
    const asesor = s.asesores?.nombre
    const aseg   = s.aseguradoras?.nombre_corto
    return (filtroAsesor === 'todos' || asesor === filtroAsesor)
        && (filtroAseguradora === 'todas' || aseg === filtroAseguradora)
        && (filtroMes === 'todos' || s.mes_subasta === filtroMes)
  }), [subastas, filtroAsesor, filtroAseguradora, filtroMes])

  const kpis = useMemo(() => {
    const resueltas = sf.filter(s => s.estado_autorizacion && s.estado_autorizacion !== 'NULL')
    const ganadas   = sf.filter(s => ['Autorizada Completa','Autorizada parcial'].includes(s.estado_autorizacion))
    const sinRasp   = sf.filter(s => !s.estado_autorizacion || s.estado_autorizacion === 'NULL')
    const tasaAuth  = resueltas.length ? (ganadas.length / resueltas.length) * 100 : 0
    const valorSub  = sf.reduce((a, s) => a + (s.valor_subastado || 0), 0)
    const valorAut  = ganadas.reduce((a, s) => a + (s.valor_autorizado || 0), 0)
    const convValor = valorSub ? (valorAut / valorSub) * 100 : 0

    // Cruce con facturas: subastas ganadas sin factura radicada
    const placasGanadas = new Set(ganadas.map(s => s.placa).filter(Boolean))
    const placasFacturadas = new Set(facturas.filter(f => f.est_radicacion === 'Radicada').map(f => f.placa))
    const sinFactura = [...placasGanadas].filter(p => !placasFacturadas.has(p)).length

    return { total: sf.length, tasaAuth, valorSub, valorAut, convValor, sinRespuesta: sinRasp.length, sinFactura }
  }, [sf, facturas])

  const porAsesor = useMemo(() => {
    const map: Record<string, { nombre: string; ganadas: number; resueltas: number; valorAut: number }> = {}
    sf.forEach(s => {
      const n = s.asesores?.nombre || 'Sin asesor'
      if (!map[n]) map[n] = { nombre: n, ganadas: 0, resueltas: 0, valorAut: 0 }
      if (s.estado_autorizacion) map[n].resueltas++
      if (['Autorizada Completa','Autorizada parcial'].includes(s.estado_autorizacion)) {
        map[n].ganadas++
        map[n].valorAut += s.valor_autorizado || 0
      }
    })
    return Object.values(map)
      .map(a => ({ ...a, tasa: a.resueltas ? (a.ganadas / a.resueltas) * 100 : 0 }))
      .sort((a, b) => b.valorAut - a.valorAut)
  }, [sf])

  const porEstado = useMemo(() => {
    const map: Record<string, number> = {}
    sf.forEach(s => {
      const k = s.estado_autorizacion || 'Sin respuesta'
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [sf])

  const porAseguradora = useMemo(() => {
    const map: Record<string, { nombre: string; total: number; ganadas: number; resueltas: number }> = {}
    sf.forEach(s => {
      const n = s.aseguradoras?.nombre_corto || 'Otra'
      if (!map[n]) map[n] = { nombre: n, total: 0, ganadas: 0, resueltas: 0 }
      map[n].total++
      if (s.estado_autorizacion) map[n].resueltas++
      if (['Autorizada Completa','Autorizada parcial'].includes(s.estado_autorizacion)) map[n].ganadas++
    })
    return Object.values(map)
      .map(a => ({ ...a, tasa: a.resueltas ? (a.ganadas / a.resueltas) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [sf])

  const facturasRadicadas = useMemo(() =>
    facturas.filter(f => f.est_radicacion === 'Radicada').length, [facturas])
  const facturasAnuladas = useMemo(() =>
    facturas.filter(f => f.est_radicacion === 'Anulada').length, [facturas])
  const facturasPendientes = useMemo(() =>
    facturas.filter(f => ['Pendiente','pendiente'].includes(f.est_radicacion)).length, [facturas])

  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center">
      <div className="text-brand-subtle font-mono text-sm animate-pulse">Cargando datos reales...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-brand-bg p-6">
      {/* Header */}
      <header className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-mono text-xs tracking-widest text-brand-gold uppercase mb-1">
            Almotores KIA · Repuestos &amp; Accesorios
          </p>
          <h1 className="font-title text-3xl font-bold text-brand-text">Torre de Control · Subastas</h1>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-brand-subtle hover:text-brand-text text-sm font-mono border border-brand-border rounded-lg px-4 py-2 transition-colors"
        >
          <LogOut size={14} /> Salir
        </button>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { label: 'Asesor', value: filtroAsesor, set: setFiltroAsesor, opts: asesores },
          { label: 'Aseguradora', value: filtroAseguradora, set: setFiltroAseguradora, opts: aseguradoras },
          { label: 'Mes', value: filtroMes, set: setFiltroMes, opts: meses },
        ].map(f => (
          <label key={f.label} className="flex flex-col gap-1">
            <span className="font-mono text-xs text-brand-subtle uppercase tracking-wider">{f.label}</span>
            <select
              value={f.value}
              onChange={e => f.set(e.target.value)}
              className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text text-sm min-w-[160px] outline-none focus:border-brand-teal"
            >
              {f.opts.map(o => <option key={o} value={o}>{o === 'todos' || o === 'todas' ? 'Todos' : o}</option>)}
            </select>
          </label>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard icon={<TrendingUp size={16}/>} label="Subastas" value={kpis.total} accent="teal" />
        <KpiCard icon={<CheckCircle size={16}/>} label="Tasa autorización" value={fmtPct(kpis.tasaAuth)} accent="teal" />
        <KpiCard icon={<TrendingUp size={16}/>} label="Valor subastado" value={fmtCOP(kpis.valorSub)} accent="blue" small />
        <KpiCard icon={<CheckCircle size={16}/>} label="Valor autorizado" value={fmtCOP(kpis.valorAut)} accent="teal" small />
        <KpiCard icon={<Clock size={16}/>} label="Sin respuesta" value={kpis.sinRespuesta} accent="muted" />
        <KpiCard icon={<AlertTriangle size={16}/>} label="Sin facturar (placa)" value={kpis.sinFactura} accent="gold" />
      </div>

      {/* Fila de Facturas */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatBadge label="Facturas radicadas" value={facturasRadicadas} color="teal" />
        <StatBadge label="Facturas pendientes" value={facturasPendientes} color="gold" />
        <StatBadge label="Facturas anuladas" value={facturasAnuladas} color="red" />
      </div>

      {/* Gráficas fila 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Valor autorizado por asesor" sub="Subastas ganadas en el periodo filtrado">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porAsesor} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false} />
              <XAxis dataKey="nombre" tick={{ fill: '#8AA4C8', fontSize: 11, fontFamily: 'IBM Plex Sans' }} axisLine={{ stroke: '#2A3340' }} tickLine={false} />
              <YAxis tick={{ fill: '#8AA4C8', fontSize: 10, fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1e6).toFixed(0)}M`} />
              <Tooltip
                contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontFamily: 'IBM Plex Sans', fontSize: 12 }}
                formatter={(v: number) => [fmtCOP(v), 'Valor autorizado']}
              />
              <Bar dataKey="valorAut" radius={[6,6,0,0]} fill="#4FD1C5" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Estado de subastas" sub="Distribución del periodo filtrado">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={porEstado} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3}>
                {porEstado.map((e, i) => (
                  <Cell key={i} fill={COLORES_ESTADO[e.name] || '#8AA4C8'} stroke="#0F1419" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontFamily: 'IBM Plex Sans', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontFamily: 'IBM Plex Sans', fontSize: 12, color: '#8AA4C8' }} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Tabla aseguradoras */}
      <Panel title="Ranking por aseguradora" sub="Volumen de subastas y tasa de autorización">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Aseguradora','Subastas','Ganadas','Tasa autorización'].map(h => (
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porAseguradora.map(a => (
                <tr key={a.nombre} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                  <td className="py-3 pr-4 text-brand-text">{a.nombre}</td>
                  <td className="py-3 pr-4 font-mono text-brand-subtle">{a.total}</td>
                  <td className="py-3 pr-4 font-mono text-brand-teal">{a.ganadas}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-brand-border rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${a.tasa}%`, background: a.tasa >= 40 ? '#4FD1C5' : '#E8A33D' }}
                        />
                      </div>
                      <span className="font-mono text-xs text-brand-subtle">{fmtPct(a.tasa)}</span>
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
}

function KpiCard({ icon, label, value, accent, small }: {
  icon: React.ReactNode; label: string; value: string | number; accent: string; small?: boolean
}) {
  const border = { teal: 'border-t-brand-teal', gold: 'border-t-brand-gold', blue: 'border-t-blue-400', red: 'border-t-brand-red', muted: 'border-t-brand-muted' }[accent] || ''
  return (
    <div className={`bg-brand-surface border border-brand-border border-t-2 ${border} rounded-xl p-4`}>
      <div className="flex items-center gap-2 text-brand-subtle mb-2">{icon}<span className="text-xs">{label}</span></div>
      <div className={`font-title font-bold text-brand-text ${small ? 'text-lg' : 'text-2xl'}`}>{value}</div>
    </div>
  )
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  const cls = { teal: 'text-brand-teal', gold: 'text-brand-gold', red: 'text-brand-red' }[color] || ''
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 flex justify-between items-center">
      <span className="text-brand-subtle text-sm">{label}</span>
      <span className={`font-mono font-bold text-xl ${cls}`}>{value}</span>
    </div>
  )
}

function Panel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
      <h3 className="font-title text-base font-semibold text-brand-text">{title}</h3>
      <p className="text-xs text-brand-subtle mb-4">{sub}</p>
      {children}
    </div>
  )
}
