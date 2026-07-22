'use client'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
  ReferenceLine,
} from 'recharts'
import { RefreshCw, Target, TrendingUp, TrendingDown, Car, ShoppingBag, AlertTriangle } from 'lucide-react'

// ── Constantes ────────────────────────────────────────────────────────────────
const META_TICKET = 2_200_000
const COLORES_SEDE: Record<string, string> = {
  'Norte':     '#4FD1C5',
  'Pasoancho': '#E8A33D',
  'Calle 9':   '#60A5FA',
}
const MESES_SHORT = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface FilaSede {
  sede: string; mes_num: number; mes: string
  vehiculos_con_accesorios: number; facturas: number
  neto_total: number; asesores_activos: number
}
interface FilaDiario {
  fecha: string; sede: string
  vehiculos_dia: number; facturas_dia: number; neto_dia: number
}
interface FilaAsesor {
  anio: number; mes_num: number; mes: string; sede: string
  asesor: string; neto_accesorios: number; facturas_accesorios: number
  vehiculos_vendidos: number; ticket_promedio: number | null; pct_vs_meta: number | null
}

// ── Utilidades ────────────────────────────────────────────────────────────────
const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
const fmtM = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${(n / 1e3).toFixed(0)}K`
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`

const colorTicket = (ticket: number | null): string => {
  if (!ticket) return '#5B6472'
  if (ticket >= META_TICKET) return '#4FD1C5'
  if (ticket >= META_TICKET * 0.8) return '#E8A33D'
  return '#E5484D'
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchDatos(anio: number, mes: number | null) {
  const [{ data: sede }, { data: diario }, { data: asesor }] = await Promise.all([
    supabase.from('v_comisiones_acc_sede')
      .select('sede,mes_num,mes,vehiculos_con_accesorios,facturas,neto_total,asesores_activos')
      .eq('anio', anio),
    supabase.from('v_comisiones_acc_diario')
      .select('fecha,sede,vehiculos_dia,facturas_dia,neto_dia')
      .gte('fecha', `${anio}-01-01`)
      .lte('fecha', `${anio}-12-31`)
      .order('fecha'),
    supabase.from('v_ticket_promedio')
      .select('anio,mes_num,mes,sede,asesor,neto_accesorios,facturas_accesorios,vehiculos_vendidos,ticket_promedio,pct_vs_meta')
      .eq('anio', anio),
  ])
  return {
    sede:   (sede   as FilaSede[]   ) || [],
    diario: (diario as FilaDiario[] ) || [],
    asesor: (asesor as FilaAsesor[] ) || [],
  }
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function TicketPromedioPage() {
  const router = useRouter()

  const [dataSede,   setDataSede]   = useState<FilaSede[]>([])
  const [dataDiario, setDataDiario] = useState<FilaDiario[]>([])
  const [dataAsesor, setDataAsesor] = useState<FilaAsesor[]>([])

  const [loading,   setLoading]   = useState(true)
  const [ultimaAct, setUltimaAct] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(1800)

  const hoy = new Date()
  const [filtroAnio, setFiltroAnio] = useState(hoy.getFullYear())
  const [filtroMes,  setFiltroMes]  = useState<number>(hoy.getMonth() + 1)
  const [filtroSede, setFiltroSede] = useState('Todas')

  const cargarDatos = useCallback(async (verificarAuth = false) => {
    if (verificarAuth) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
    }
    const datos = await fetchDatos(filtroAnio, filtroMes)
    setDataSede(datos.sede)
    setDataDiario(datos.diario)
    setDataAsesor(datos.asesor)
    setUltimaAct(new Date())
    setLoading(false)
  }, [filtroAnio, filtroMes, router])

  useEffect(() => { cargarDatos(true) }, [cargarDatos])

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { cargarDatos(false); return 1800 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [cargarDatos])

  // ── Meses disponibles ────────────────────────────────────────────────────
  const mesesDisponibles = useMemo(() => {
    const nums = Array.from(new Set(dataSede.map(r => r.mes_num))).sort((a, b) => a - b)
    return nums
  }, [dataSede])

  // ── Filtrado ─────────────────────────────────────────────────────────────
  const sedeF = useMemo(() =>
    dataSede.filter(r =>
      r.mes_num === filtroMes &&
      (filtroSede === 'Todas' || r.sede === filtroSede)
    ), [dataSede, filtroMes, filtroSede])

  const diarioF = useMemo(() => {
    const mesStr = String(filtroMes).padStart(2, '0')
    return dataDiario.filter(r =>
      r.fecha.startsWith(`${filtroAnio}-${mesStr}`) &&
      (filtroSede === 'Todas' || r.sede === filtroSede)
    )
  }, [dataDiario, filtroAnio, filtroMes, filtroSede])

  const asesorF = useMemo(() =>
    dataAsesor.filter(r =>
      r.mes_num === filtroMes &&
      (filtroSede === 'Todas' || r.sede === filtroSede)
    ).sort((a, b) => (b.ticket_promedio || 0) - (a.ticket_promedio || 0)),
  [dataAsesor, filtroMes, filtroSede])

  // ── KPIs globales del mes ────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const neto      = sedeF.reduce((a, r) => a + (r.neto_total || 0), 0)
    const vehiculos = sedeF.reduce((a, r) => a + (r.vehiculos_con_accesorios || 0), 0)
    const facturas  = sedeF.reduce((a, r) => a + (r.facturas || 0), 0)
    // Ticket: neto / vehiculos con accesorios (proxy hasta tener vehículos vendidos)
    const ticket    = vehiculos > 0 ? neto / vehiculos : 0
    return { neto, vehiculos, facturas, ticket }
  }, [sedeF])

  // ── Evolución mensual por sede ───────────────────────────────────────────
  const evolucionMensual = useMemo(() => {
    return mesesDisponibles.map(mesNum => {
      const entry: Record<string, number | string> = { mes: MESES_SHORT[mesNum] }
      const sedes = filtroSede === 'Todas' ? ['Norte', 'Pasoancho', 'Calle 9'] : [filtroSede]
      sedes.forEach(sede => {
        const row = dataSede.find(r => r.mes_num === mesNum && r.sede === sede)
        const neto      = row?.neto_total || 0
        const vehiculos = row?.vehiculos_con_accesorios || 0
        entry[sede] = vehiculos > 0 ? Math.round(neto / vehiculos) : 0
      })
      return entry
    })
  }, [dataSede, mesesDisponibles, filtroSede])

  // ── Acumulado diario del mes ─────────────────────────────────────────────
  const acumuladoDiario = useMemo(() => {
    // Agrupar por fecha sumando sedes si filtro = Todas
    const porFecha: Record<string, { neto: number; vehiculos: number }> = {}
    diarioF.forEach(r => {
      if (!porFecha[r.fecha]) porFecha[r.fecha] = { neto: 0, vehiculos: 0 }
      porFecha[r.fecha].neto      += r.neto_dia || 0
      porFecha[r.fecha].vehiculos += r.vehiculos_dia || 0
    })
    let netoAcum = 0; let vehAcum = 0
    return Object.entries(porFecha).sort(([a], [b]) => a.localeCompare(b)).map(([fecha, v]) => {
      netoAcum += v.neto; vehAcum += v.vehiculos
      return {
        dia:     parseInt(fecha.split('-')[2]),
        neto_dia: v.neto,
        ticket_dia: v.vehiculos > 0 ? Math.round(v.neto / v.vehiculos) : 0,
        ticket_acum: vehAcum > 0 ? Math.round(netoAcum / vehAcum) : 0,
      }
    })
  }, [diarioF])

  // ── Por sede (mes seleccionado) ──────────────────────────────────────────
  const porSede = useMemo(() =>
    ['Norte', 'Pasoancho', 'Calle 9'].map(sede => {
      const row = dataSede.find(r => r.mes_num === filtroMes && r.sede === sede)
      const neto      = row?.neto_total || 0
      const vehiculos = row?.vehiculos_con_accesorios || 0
      const ticket    = vehiculos > 0 ? Math.round(neto / vehiculos) : 0
      return { sede, neto, vehiculos, facturas: row?.facturas || 0, ticket,
        pctMeta: (ticket / META_TICKET) * 100 }
    }), [dataSede, filtroMes])

  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center flex-col gap-3">
      <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin"/>
      <p className="text-brand-subtle font-mono text-xs">Cargando ticket promedio...</p>
    </div>
  )

  const mesNombre = MESES_SHORT[filtroMes] || ''
  const sedes = filtroSede === 'Todas' ? ['Norte', 'Pasoancho', 'Calle 9'] : [filtroSede]

  return (
    <div className="min-h-screen bg-brand-bg">

      {/* TOP BAR */}
      <div className="border-b border-brand-border bg-brand-surface/50 px-6 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-brand-teal animate-pulse"/>
          <span className="font-mono text-xs text-brand-subtle uppercase tracking-widest">
            Almotores KIA · Ticket Promedio Accesorios
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { cargarDatos(false); setCountdown(1800) }}
            className="flex items-center gap-1.5 text-xs font-mono text-brand-subtle hover:text-brand-teal transition-colors border border-brand-border rounded-lg px-2.5 py-1">
            <RefreshCw size={12}/> Actualizar
          </button>
          <div className="flex items-center gap-1.5 text-xs font-mono text-brand-muted">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-teal animate-pulse"/>
            {`Auto en ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}`}
          </div>
          {ultimaAct && (
            <span className="text-brand-muted font-mono text-xs hidden md:block">
              {ultimaAct.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <div className="p-6">

        {/* TÍTULO */}
        <div className="mb-6">
          <h1 className="font-title text-2xl font-bold text-brand-text">Ticket Promedio · Accesorios</h1>
          <p className="text-brand-subtle text-sm mt-1">
            Meta: {fmtCOP(META_TICKET)} por vehículo · {filtroAnio}
          </p>
        </div>

        {/* FILTROS */}
        <div className="flex flex-wrap gap-2 mb-6 p-4 bg-brand-surface border border-brand-border rounded-xl">
          <span className="font-mono text-xs text-brand-muted self-center mr-2 uppercase tracking-wider">Ver</span>

          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Sede</span>
            <div className="flex rounded-lg border border-brand-border overflow-hidden">
              {['Todas', 'Norte', 'Pasoancho', 'Calle 9'].map(s => (
                <button key={s} onClick={() => setFiltroSede(s)}
                  className={`px-3 py-1.5 text-xs font-mono transition-colors
                    ${filtroSede === s
                      ? 'text-black font-semibold'
                      : 'text-brand-subtle hover:text-brand-text'}`}
                  style={filtroSede === s && s !== 'Todas' ? { background: COLORES_SEDE[s] } : filtroSede === s ? { background: '#4FD1C5' } : {}}>
                  {s}
                </button>
              ))}
            </div>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Mes</span>
            <select value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))}
              className="bg-brand-bg border border-brand-teal/50 rounded-lg px-3 py-1.5 text-brand-teal text-sm font-mono font-semibold outline-none">
              {mesesDisponibles.map(m => (
                <option key={m} value={m}>{MESES_SHORT[m]}</option>
              ))}
            </select>
          </label>
        </div>

        {/* ALERTA META */}
        {kpis.ticket > 0 && kpis.ticket < META_TICKET && (
          <div className="mb-4 p-4 bg-brand-red/5 border border-brand-red/30 rounded-xl flex items-center gap-3">
            <AlertTriangle size={16} className="text-brand-red shrink-0"/>
            <p className="text-sm text-brand-red font-mono">
              Ticket promedio actual <strong>{fmtCOP(kpis.ticket)}</strong> está{' '}
              <strong>{fmtPct(((META_TICKET - kpis.ticket) / META_TICKET) * 100)}</strong> por debajo de la meta.
              Se necesitan <strong>{fmtCOP(META_TICKET - kpis.ticket)}</strong> más por vehículo.
            </p>
          </div>
        )}
        {kpis.ticket >= META_TICKET && kpis.ticket > 0 && (
          <div className="mb-4 p-4 bg-brand-teal/5 border border-brand-teal/30 rounded-xl flex items-center gap-3">
            <Target size={16} className="text-brand-teal shrink-0"/>
            <p className="text-sm text-brand-teal font-mono">
              ✅ Meta superada — ticket promedio <strong>{fmtCOP(kpis.ticket)}</strong> ({fmtPct(((kpis.ticket - META_TICKET) / META_TICKET) * 100)} sobre la meta)
            </p>
          </div>
        )}

        {/* KPIs GLOBALES */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiCard icon={<ShoppingBag size={15}/>} label={`Neto accesorios ${mesNombre}`}
            value={fmtCOP(kpis.neto)} accent="teal" small/>
          <KpiCard icon={<Car size={15}/>} label="Vehículos con accesorios"
            value={kpis.vehiculos.toString()} accent="blue"
            hint="placas únicas con factura"/>
          <KpiCard icon={<Target size={15}/>} label="Ticket promedio"
            value={fmtCOP(kpis.ticket)}
            accent={kpis.ticket >= META_TICKET ? 'teal' : kpis.ticket >= META_TICKET * 0.8 ? 'gold' : 'red'}
            hint={`Meta: ${fmtCOP(META_TICKET)}`}/>
          <KpiCard icon={<TrendingUp size={15}/>} label="% vs Meta"
            value={fmtPct((kpis.ticket / META_TICKET) * 100)}
            accent={kpis.ticket >= META_TICKET ? 'teal' : 'red'}/>
        </div>

        {/* TARJETAS POR SEDE */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {porSede.map(s => (
            <button key={s.sede} onClick={() => setFiltroSede(filtroSede === s.sede ? 'Todas' : s.sede)}
              className={`rounded-xl border p-5 text-left transition-all ${
                filtroSede === s.sede
                  ? 'border-opacity-60 bg-opacity-10'
                  : 'border-brand-border bg-brand-surface hover:border-opacity-50'
              }`}
              style={filtroSede === s.sede ? { borderColor: COLORES_SEDE[s.sede], background: `${COLORES_SEDE[s.sede]}10` } : {}}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: COLORES_SEDE[s.sede] }}/>
                  <p className="font-title font-semibold text-brand-text">{s.sede}</p>
                </div>
                {filtroSede === s.sede && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono text-black"
                    style={{ background: COLORES_SEDE[s.sede] }}>Activo</span>
                )}
              </div>
              <p className="font-mono text-[10px] text-brand-muted mb-0.5">Ticket promedio</p>
              <p className="font-title font-bold text-2xl mb-1" style={{ color: colorTicket(s.ticket) }}>
                {s.ticket > 0 ? fmtCOP(s.ticket) : '—'}
              </p>
              {/* Barra vs meta */}
              <div className="h-1.5 bg-brand-border rounded-full overflow-hidden mb-2">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(s.pctMeta, 100)}%`, background: colorTicket(s.ticket) }}/>
              </div>
              <div className="flex justify-between text-[10px] font-mono text-brand-muted mb-2">
                <span>{fmtPct(s.pctMeta)} de la meta</span>
                <span>Meta: {fmtM(META_TICKET)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-brand-border/50">
                <div>
                  <p className="font-mono text-[10px] text-brand-muted">Neto</p>
                  <p className="font-mono text-xs text-brand-subtle font-semibold">{fmtM(s.neto)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-brand-muted">Vehículos</p>
                  <p className="font-mono text-xs text-brand-subtle font-semibold">{s.vehiculos}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* GRÁFICAS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

          {/* Evolución mensual del ticket */}
          <Panel title="Ticket promedio mensual" sub={`Neto accesorios / vehículos con accesorios · ${filtroAnio}`}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={evolucionMensual} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                <XAxis dataKey="mes" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={{ stroke: '#2A3340' }} tickLine={false}/>
                <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => v ? fmtM(v) : ''}/>
                <ReferenceLine y={META_TICKET} stroke="#E5484D" strokeDasharray="4 2"
                  label={{ value: 'Meta', fill: '#E5484D', fontSize: 10, position: 'right' }}/>
                <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [fmtCOP(v), '']}/>
                <Legend wrapperStyle={{ fontSize: 11, color: '#8AA4C8' }}/>
                {sedes.map(sede => (
                  <Line key={sede} type="monotone" dataKey={sede}
                    stroke={COLORES_SEDE[sede]} strokeWidth={2.5}
                    dot={{ fill: COLORES_SEDE[sede], r: 4, strokeWidth: 0 }} connectNulls/>
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          {/* Ticket diario acumulado del mes */}
          <Panel title={`Ticket acumulado diario — ${mesNombre} ${filtroAnio}`}
            sub="Línea roja = meta $2.200.000">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={acumuladoDiario} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                <XAxis dataKey="dia" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={{ stroke: '#2A3340' }} tickLine={false}/>
                <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => v ? fmtM(v) : ''}/>
                <ReferenceLine y={META_TICKET} stroke="#E5484D" strokeDasharray="4 2"/>
                <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => [fmtCOP(v), name === 'ticket_acum' ? 'Ticket acumulado' : 'Ticket del día']}/>
                <Line type="monotone" dataKey="ticket_acum" name="ticket_acum"
                  stroke="#4FD1C5" strokeWidth={2.5} dot={false}/>
                <Line type="monotone" dataKey="ticket_dia" name="ticket_dia"
                  stroke="#8AA4C8" strokeWidth={1} strokeDasharray="3 2" dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* NETO DIARIO POR DÍA */}
        <div className="mb-4">
          <Panel title={`Facturación diaria accesorios — ${mesNombre} ${filtroAnio}`}
            sub="Valor neto facturado por día">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={acumuladoDiario} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                <XAxis dataKey="dia" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={{ stroke: '#2A3340' }} tickLine={false}/>
                <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => v ? fmtM(v) : ''}/>
                <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [fmtCOP(v), 'Neto del día']}/>
                <Bar dataKey="neto_dia" name="Neto del día" radius={[4, 4, 0, 0]}>
                  {acumuladoDiario.map((_, i) => (
                    <Cell key={i} fill={filtroSede !== 'Todas' ? COLORES_SEDE[filtroSede] : '#4FD1C5'}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* TABLA POR ASESOR */}
        {asesorF.length > 0 && (
          <Panel title="Ticket promedio por asesor" sub="Requiere cargar vehículos vendidos en comisiones_acc_vehiculos">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border">
                    {['Asesor','Sede','Neto accesorios','Vehículos vendidos','Ticket promedio','% vs Meta'].map(h => (
                      <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {asesorF.map((a, i) => (
                    <tr key={`${a.asesor}-${i}`} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                      <td className="py-3 pr-4 text-brand-text font-medium">{a.asesor}</td>
                      <td className="py-3 pr-4">
                        <span className="font-mono text-xs px-2 py-0.5 rounded-full"
                          style={{ color: COLORES_SEDE[a.sede], background: `${COLORES_SEDE[a.sede]}15` }}>
                          {a.sede}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-teal font-semibold">{fmtCOP(a.neto_accesorios)}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">
                        {a.vehiculos_vendidos > 0 ? a.vehiculos_vendidos : <span className="text-brand-muted">Sin datos</span>}
                      </td>
                      <td className="py-3 pr-4 font-mono text-sm font-bold" style={{ color: colorTicket(a.ticket_promedio) }}>
                        {a.ticket_promedio ? fmtCOP(a.ticket_promedio) : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        {a.pct_vs_meta ? (
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-brand-border rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{
                                width: `${Math.min(a.pct_vs_meta, 100)}%`,
                                background: colorTicket(a.ticket_promedio)
                              }}/>
                            </div>
                            <span className="font-mono text-xs" style={{ color: colorTicket(a.ticket_promedio) }}>
                              {fmtPct(a.pct_vs_meta)}
                            </span>
                          </div>
                        ) : <span className="text-brand-muted font-mono text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {asesorF.every(a => !a.vehiculos_vendidos) && (
              <p className="text-center text-brand-muted font-mono text-xs mt-4 p-3 bg-brand-bg rounded-lg">
                💡 El ticket por asesor se activa cuando cargues los vehículos vendidos en la tabla <code>comisiones_acc_vehiculos</code>
              </p>
            )}
          </Panel>
        )}

      </div>
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, accent, small, hint }: {
  icon: React.ReactNode; label: string; value: string
  accent: string; small?: boolean; hint?: string
}) {
  const bc: Record<string, string> = { teal: '#4FD1C5', gold: '#E8A33D', blue: '#60A5FA', red: '#E5484D', subtle: '#5B6472' }
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 relative overflow-hidden">
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: bc[accent] || '#4FD1C5' }}/>
      <div className="flex items-center gap-2 text-brand-subtle mb-2">{icon}<span className="text-xs">{label}</span></div>
      <div className={`font-title font-bold text-brand-text ${small ? 'text-lg' : 'text-2xl'}`}>{value}</div>
      {hint && <p className="text-brand-muted text-xs mt-1 font-mono">{hint}</p>}
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
