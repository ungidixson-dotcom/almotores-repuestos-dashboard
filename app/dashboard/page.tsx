'use client'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts'
import {
  LogOut, TrendingUp, CheckCircle, Clock, Timer,
  FileCheck, FileX, FileClock, Calendar, Target, RefreshCw,
} from 'lucide-react'

// ── Constantes ───────────────────────────────────────────────────────────────
const ESTADOS_GANADOS   = ['Autorizada Completa', 'Autorizada parcial'] as const
const ESTADOS_RESUELTOS = ['Autorizada Completa', 'Autorizada parcial', 'NO Autorizada'] as const

const COLORES_ESTADO: Record<string, string> = {
  'Autorizada Completa': '#4FD1C5',
  'Autorizada parcial':  '#E8A33D',
  'NO Autorizada':       '#E5484D',
  'Subasta no aplicada': '#5B6472',
  'Sin respuesta':       '#8AA4C8',
}
const COLORES_CIUDADES = [
  '#4FD1C5','#E8A33D','#8AA4C8','#E5484D',
  '#60A5FA','#A78BFA','#34D399','#F87171','#FBBF24','#6EE7B7',
]

// Festivos Colombia 2026 (lunes–sábado = hábil, domingos + festivos = inhábil)
const FESTIVOS_2026 = new Set([
  '2026-01-01','2026-01-12','2026-03-23','2026-04-02','2026-04-03',
  '2026-05-01','2026-05-18','2026-06-08','2026-06-15','2026-06-29',
  '2026-07-20','2026-08-07','2026-08-17','2026-10-12','2026-11-02',
  '2026-11-16','2026-12-08','2026-12-25',
])

// ── Utilidades ───────────────────────────────────────────────────────────────
function diasHabiles(
  year: number,
  month: number,
): { total: number; transcurridos: number; restantes: number } {
  const hoy    = new Date()
  const diaHoy = (hoy.getFullYear() === year && hoy.getMonth() === month - 1)
    ? hoy.getDate()
    : new Date(year, month, 0).getDate()

  let total = 0
  let transcurridos = 0
  const diasMes = new Date(year, month, 0).getDate()

  for (let d = 1; d <= diasMes; d++) {
    const dow  = new Date(year, month - 1, d).getDay()
    const fStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (dow !== 0 && !FESTIVOS_2026.has(fStr)) {
      total++
      if (d <= diaHoy) transcurridos++
    }
  }
  return { total, transcurridos, restantes: total - transcurridos }
}

/**
 * Cuenta cuántos días hábiles hay entre el día 1 del mes y una fecha dada (inclusive).
 * Se usa para calcular el ritmo real basado en max_fecha_subasta.
 */
function diasHabilesHasta(year: number, month: number, diaMax: number): number {
  let count = 0
  for (let d = 1; d <= diaMax; d++) {
    const dow  = new Date(year, month - 1, d).getDay()
    const fStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (dow !== 0 && !FESTIVOS_2026.has(fStr)) count++
  }
  return count
}

const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`
const fmtM   = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${(n / 1e3).toFixed(0)}K`

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Aseguradora    { id: number; nombre_corto: string }
interface Asesor         { id: number; nombre: string }
interface ResumenMensual {
  anio: number
  mes: string
  orden: number
  total_subastas: number
  ganadas: number
  no_autorizadas: number
  valor_autorizado: number
  valor_subastado: number
  max_fecha_subasta: string | null
}
interface KpiRow {
  anio: number
  mes_subasta: string
  marca: string
  aseguradora_id: number
  asesor_id: number
  estado_autorizacion: string
  ciudad_destino: string
  total: number
  valor_subastado: number
  valor_autorizado: number
  tiempo_promedio: number
}
interface Factura {
  id: number
  placa: string
  marca: string
  aseguradora_id: number
  asesor_id: number
  est_radicacion: string
  fecha_radicado: string
  base_imp: number
  mes: string
}
interface PipelineAnio {
  anio: number | null
  total: number
  pend_auth: number
  en_pedido: number
  por_facturar: number
  por_radicar: number
  completadas: number
}

// ── Fetch centralizado ───────────────────────────────────────────────────────
interface DatosApp {
  kpiRows:      KpiRow[]
  facturas:     Factura[]
  aseguradoras: Aseguradora[]
  asesores:     Asesor[]
  resumenMensual:   ResumenMensual[]
  mesesDisponibles: Array<{ anio: number; mes: string; orden: number }>
  pipelineData:     PipelineAnio[]
}

async function fetchTodosDatos(): Promise<DatosApp> {
  const [
    { data: kpis },
    { data: f },
    { data: aseg },
    { data: ases },
    { data: resumen },
    { data: meses },
    { data: pipeline },
  ] = await Promise.all([
    supabase.from('v_kpis_subastas').select(
      'anio,mes_subasta,marca,aseguradora_id,asesor_id,estado_autorizacion,ciudad_destino,total,valor_subastado,valor_autorizado,tiempo_promedio'
    ),
    supabase.from('facturas').select(
      'id,placa,marca,aseguradora_id,asesor_id,est_radicacion,fecha_radicado,base_imp,mes'
    ).limit(2000),
    supabase.from('aseguradoras').select('id,nombre_corto'),
    supabase.from('asesores').select('id,nombre'),
    supabase.from('v_resumen_mensual').select(
      'anio,mes,orden,total_subastas,ganadas,no_autorizadas,valor_autorizado,valor_subastado,max_fecha_subasta'
    ),
    supabase.from('v_meses_disponibles').select('anio,mes,orden').order('anio').order('orden'),
    supabase.from('v_subastas_pipeline').select(
      'anio,total,pend_auth,en_pedido,por_facturar,por_radicar,completadas'
    ).order('anio'),
  ])
  return {
    kpiRows:          (kpis     as KpiRow[]        ) || [],
    facturas:         (f        as Factura[]        ) || [],
    aseguradoras:     (aseg     as Aseguradora[]    ) || [],
    asesores:         (ases     as Asesor[]         ) || [],
    resumenMensual:   (resumen  as ResumenMensual[] ) || [],
    mesesDisponibles: (meses    as Array<{ anio: number; mes: string; orden: number }>) || [],
    pipelineData:     (pipeline as PipelineAnio[]   ) || [],
  }
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter()

  const [kpiRows,          setKpiRows]          = useState<KpiRow[]>([])
  const [facturas,         setFacturas]          = useState<Factura[]>([])
  const [aseguradoras,     setAseguradoras]      = useState<Aseguradora[]>([])
  const [asesores,         setAsesores]          = useState<Asesor[]>([])
  const [resumenMensual,   setResumenMensual]    = useState<ResumenMensual[]>([])
  const [mesesDisponibles, setMesesDisponibles]  = useState<Array<{ anio: number; mes: string; orden: number }>>([])
  const [pipelineData,     setPipelineData]      = useState<PipelineAnio[]>([])

  const [loading,              setLoading]              = useState(true)
  const [ultimaActualizacion,  setUltimaActualizacion]  = useState<Date | null>(null)
  const [autoRefresh,          setAutoRefresh]          = useState(true)
  const [countdown,            setCountdown]            = useState(1800)

  // Filtros
  const [filtroAnio,        setFiltroAnio]        = useState(2026)
  const [filtroAsesor,      setFiltroAsesor]      = useState(0)
  const [filtroAseguradora, setFiltroAseguradora] = useState(0)
  const [filtroMes,         setFiltroMes]         = useState('todos')
  const [filtroMarca,       setFiltroMarca]       = useState('todas')

  // ── Mapas de lookup ──────────────────────────────────────────────────────
  const asegMap = useMemo(() => {
    const m: Record<number, string> = {}
    aseguradoras.forEach(a => { m[a.id] = a.nombre_corto })
    return m
  }, [aseguradoras])

  const asesMap = useMemo(() => {
    const m: Record<number, string> = {}
    asesores.forEach(a => { m[a.id] = a.nombre })
    return m
  }, [asesores])

  // ── Carga inicial ────────────────────────────────────────────────────────
  const cargarDatos = useCallback(async (verificarAuth = false) => {
    if (verificarAuth) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
    }
    const datos = await fetchTodosDatos()
    setKpiRows(datos.kpiRows)
    setFacturas(datos.facturas)
    setAseguradoras(datos.aseguradoras)
    setAsesores(datos.asesores)
    setResumenMensual(datos.resumenMensual)
    setMesesDisponibles(datos.mesesDisponibles)
    setPipelineData(datos.pipelineData)
    setUltimaActualizacion(new Date())
    setLoading(false)
  }, [router])

  useEffect(() => { cargarDatos(true) }, [cargarDatos])

  // ── Auto-refresh cada 30 minutos ─────────────────────────────────────────
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          cargarDatos(false)
          return 1800
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [autoRefresh, cargarDatos])

  const handleRefreshManual = () => {
    cargarDatos(false)
    setCountdown(1800)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ── Opciones de filtro ───────────────────────────────────────────────────
  const aniosDisponibles = useMemo(() =>
    Array.from(new Set(mesesDisponibles.map(m => m.anio))).sort((a, b) => b - a),
  [mesesDisponibles])

  const mesesDelAnio = useMemo(() => {
    const del_anio = mesesDisponibles
      .filter(m => m.anio === filtroAnio)
      .sort((a, b) => a.orden - b.orden)
      .map(m => m.mes)
    return ['todos', ...del_anio]
  }, [mesesDisponibles, filtroAnio])

  const marcas = useMemo(() => {
    const ms = kpiRows
      .filter(r => r.anio === filtroAnio)
      .map(r => r.marca)
      .filter((m): m is string => !!m && m.trim() !== '')
    return ['todas', ...Array.from(new Set(ms)).sort()]
  }, [kpiRows, filtroAnio])

  // ── Rows filtrados ───────────────────────────────────────────────────────
  const sf = useMemo(() => kpiRows.filter(r =>
    r.anio === filtroAnio &&
    (filtroAsesor      === 0       || r.asesor_id      === filtroAsesor)      &&
    (filtroAseguradora === 0       || r.aseguradora_id === filtroAseguradora) &&
    (filtroMes         === 'todos' || r.mes_subasta    === filtroMes)         &&
    (filtroMarca       === 'todas' || r.marca          === filtroMarca)
  ), [kpiRows, filtroAnio, filtroAsesor, filtroAseguradora, filtroMes, filtroMarca])

  const ff = useMemo(() => facturas.filter(f =>
    (filtroAsesor      === 0       || f.asesor_id      === filtroAsesor)      &&
    (filtroAseguradora === 0       || f.aseguradora_id === filtroAseguradora) &&
    (filtroMes         === 'todos' || f.mes            === filtroMes)         &&
    (filtroMarca       === 'todas' || f.marca          === filtroMarca)
  ), [facturas, filtroAsesor, filtroAseguradora, filtroMes, filtroMarca])

  // ── KPIs agregados ───────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total     = sf.reduce((a, r) => a + (r.total || 0), 0)
    const ganadas   = sf.filter(r => ESTADOS_GANADOS.includes(r.estado_autorizacion as typeof ESTADOS_GANADOS[number])).reduce((a, r) => a + (r.total || 0), 0)
    const resueltas = sf.filter(r => ESTADOS_RESUELTOS.includes(r.estado_autorizacion as typeof ESTADOS_RESUELTOS[number])).reduce((a, r) => a + (r.total || 0), 0)
    const sinResp   = sf.filter(r =>
      !ESTADOS_RESUELTOS.includes(r.estado_autorizacion as typeof ESTADOS_RESUELTOS[number]) &&
      r.estado_autorizacion !== 'Subasta no aplicada'
    ).reduce((a, r) => a + (r.total || 0), 0)
    const valorSub = sf.reduce((a, r) => a + (r.valor_subastado || 0), 0)
    const valorAut = sf.filter(r => ESTADOS_GANADOS.includes(r.estado_autorizacion as typeof ESTADOS_GANADOS[number])).reduce((a, r) => a + (r.valor_autorizado || 0), 0)
    const tiempos  = sf.filter(r => r.tiempo_promedio > 0).map(r => r.tiempo_promedio)
    const tiempoProm = tiempos.length
      ? (tiempos.reduce((a, b) => a + b, 0) / tiempos.length).toFixed(1)
      : '—'
    return {
      total, ganadas, resueltas, sinRespuesta: sinResp,
      tasaAuth:    resueltas ? (ganadas / resueltas) * 100 : 0,
      efectividad: total     ? (ganadas / total)     * 100 : 0,
      valorSub, valorAut,
      convValor:   valorSub  ? (valorAut / valorSub) * 100 : 0,
      tiempoProm,
    }
  }, [sf])

  const fKpis = useMemo(() => ({
    radicadas:  ff.filter(f => f.est_radicacion === 'Radicada').length,
    pendientes: ff.filter(f => ['Pendiente', 'pendiente'].includes(f.est_radicacion)).length,
    anuladas:   ff.filter(f => f.est_radicacion === 'Anulada').length,
  }), [ff])

  // ── Mes en curso (dinámico) ──────────────────────────────────────────────
  const mesActual = useMemo(() => {
    const hoy   = new Date()
    const year  = hoy.getFullYear()
    const month = hoy.getMonth() + 1
    const NOMBRES_MES = [
      '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ]
    const nombreMes = NOMBRES_MES[month]
    const dh = diasHabiles(year, month)

    // Buscar el resumen del mes actual en el año filtrado
    const resumenMes = resumenMensual.find(
      r => r.anio === filtroAnio && r.mes === nombreMes
    )

    const subastasAcum  = resumenMes?.total_subastas  || 0
    const valorAutAcum  = resumenMes?.valor_autorizado || 0
    const maxFecha      = resumenMes?.max_fecha_subasta || null

    // Días hábiles transcurridos hasta la última fecha con datos reales
    const diasConDatos = maxFecha
      ? diasHabilesHasta(year, month, new Date(maxFecha + 'T00:00:00').getDate())
      : 0

    const ritmo      = diasConDatos > 0 ? subastasAcum  / diasConDatos : 0
    const ritmoValor = diasConDatos > 0 ? valorAutAcum / diasConDatos  : 0

    return {
      nombre:          `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${year}`,
      total:           dh.total,
      transcurridos:   dh.transcurridos,
      restantes:       dh.restantes,
      subastasAcum,
      diasConDatos,
      ritmo,
      proySubastas:    Math.round(ritmo * dh.total),
      proyValor:       ritmoValor * dh.total,
      valorAutAcum,
      pctAvance:       dh.total > 0 ? (dh.transcurridos / dh.total) * 100 : 0,
    }
  }, [resumenMensual, filtroAnio])

  // ── Agregados por dimensión ──────────────────────────────────────────────
  const porAsesor = useMemo(() => {
    const map: Record<number, { id: number; total: number; ganadas: number; noAut: number; pendientes: number; valorAut: number }> = {}
    sf.forEach(r => {
      if (!r.asesor_id) return
      if (!map[r.asesor_id]) map[r.asesor_id] = { id: r.asesor_id, total: 0, ganadas: 0, noAut: 0, pendientes: 0, valorAut: 0 }
      map[r.asesor_id].total += r.total || 0
      if (ESTADOS_GANADOS.includes(r.estado_autorizacion as typeof ESTADOS_GANADOS[number])) {
        map[r.asesor_id].ganadas   += r.total || 0
        map[r.asesor_id].valorAut  += r.valor_autorizado || 0
      } else if (r.estado_autorizacion === 'NO Autorizada') {
        map[r.asesor_id].noAut += r.total || 0
      } else {
        map[r.asesor_id].pendientes += r.total || 0
      }
    })
    return Object.values(map).map(a => {
      const d = a.ganadas + a.noAut
      return {
        ...a,
        nombre:      asesMap[a.id] || `Asesor ${a.id}`,
        tasaAuth:    d      ? (a.ganadas / d)      * 100 : 0,
        efectividad: a.total ? (a.ganadas / a.total) * 100 : 0,
      }
    }).sort((a, b) => b.valorAut - a.valorAut)
  }, [sf, asesMap])

  const porEstado = useMemo(() => {
    const map: Record<string, number> = {}
    sf.forEach(r => {
      const k = r.estado_autorizacion || 'Sin respuesta'
      map[k] = (map[k] || 0) + (r.total || 0)
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [sf])

  const porAseguradora = useMemo(() => {
    const map: Record<number, { id: number; total: number; ganadas: number; resueltas: number }> = {}
    sf.forEach(r => {
      if (!r.aseguradora_id) return
      if (!map[r.aseguradora_id]) map[r.aseguradora_id] = { id: r.aseguradora_id, total: 0, ganadas: 0, resueltas: 0 }
      map[r.aseguradora_id].total += r.total || 0
      if (ESTADOS_RESUELTOS.includes(r.estado_autorizacion as typeof ESTADOS_RESUELTOS[number])) map[r.aseguradora_id].resueltas += r.total || 0
      if (ESTADOS_GANADOS.includes(r.estado_autorizacion as typeof ESTADOS_GANADOS[number]))    map[r.aseguradora_id].ganadas   += r.total || 0
    })
    return Object.values(map)
      .map(a => ({ ...a, nombre: asegMap[a.id] || `Aseg.${a.id}`, tasa: a.resueltas ? (a.ganadas / a.resueltas) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [sf, asegMap])

  const porCiudad = useMemo(() => {
    const map: Record<string, { total: number; ganadas: number }> = {}
    sf.forEach(r => {
      const c = r.ciudad_destino ? r.ciudad_destino.trim().toLowerCase() : 'sin ciudad'
      if (!map[c]) map[c] = { total: 0, ganadas: 0 }
      map[c].total += r.total || 0
      if (ESTADOS_GANADOS.includes(r.estado_autorizacion as typeof ESTADOS_GANADOS[number])) map[c].ganadas += r.total || 0
    })
    return Object.entries(map)
      .map(([ciudad, v]) => ({
        ciudad: ciudad.charAt(0).toUpperCase() + ciudad.slice(1),
        ...v,
        tasa: v.total ? (v.ganadas / v.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [sf])

  const porTiempo = useMemo(() => {
    const rangos: Record<string, number> = {
      '0-3 días': 0, '4-6 días': 0, '7-15 días': 0, '16-30 días': 0, '+30 días': 0,
    }
    sf.filter(r => r.tiempo_promedio > 0).forEach(r => {
      const d   = r.tiempo_promedio
      const key = d <= 3 ? '0-3 días' : d <= 6 ? '4-6 días' : d <= 15 ? '7-15 días' : d <= 30 ? '16-30 días' : '+30 días'
      rangos[key] += r.total || 0
    })
    return Object.entries(rangos).map(([rango, cantidad]) => ({ rango, cantidad }))
  }, [sf])

  // ── Pipeline del año filtrado ────────────────────────────────────────────
  const pipeline = useMemo(() => {
    const row = pipelineData.find(p => p.anio === filtroAnio)
    if (!row) return null
    const autorizadas = row.total - row.pend_auth
    return {
      total:        row.total,
      autorizadas,
      en_pedido:    row.en_pedido,
      por_facturar: row.por_facturar,
      por_radicar:  row.por_radicar,
      completadas:  row.completadas,
      pct_auth:     row.total  > 0 ? (autorizadas   / row.total)      * 100 : 0,
      pct_pedido:   autorizadas > 0 ? (row.en_pedido / autorizadas)    * 100 : 0,
      pct_facturar: row.en_pedido  > 0 ? (row.por_facturar / row.en_pedido) * 100 : 0,
      pct_radicar:  row.por_facturar + row.completadas > 0
        ? (row.completadas / (row.por_facturar + row.completadas)) * 100 : 0,
    }
  }, [pipelineData, filtroAnio])

  // ── Proyección anual (opera sobre el año filtrado) ───────────────────────
  const proyeccionMes = useMemo(() => {
    const MESES = [
      'Enero','Febrero','Marzo','Abril','Mayo','Junio',
      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
    ]
    const mapReal: Record<string, ResumenMensual> = {}
    resumenMensual
      .filter(r => r.anio === filtroAnio)
      .forEach(r => { if (r.mes) mapReal[r.mes.toLowerCase()] = r })

    const serie = MESES.map((mes, idx) => {
      const real = mapReal[mes.toLowerCase()]
      return {
        mes,
        orden:    idx + 1,
        valorAut: real ? real.valor_autorizado : null,
        ganadas:  real ? real.ganadas          : null,
        esReal:   !!real,
      }
    })

    const conDatos = serie.filter(s => s.valorAut !== null)
    let proyectado: number | null = null
    let siguienteMes = ''

    if (conDatos.length >= 2) {
      const valores = conDatos.map(s => s.valorAut as number)
      const n       = valores.length
      const prom    = valores.reduce((a, b) => a + b, 0) / n
      const tend    = (valores[n - 1] - valores[0]) / (n - 1)
      proyectado    = Math.max(0, prom + tend)
      const sig     = serie.find(s => !s.esReal && s.orden > (conDatos[conDatos.length - 1].orden))
      siguienteMes  = sig ? sig.mes : ''
      if (sig) serie[sig.orden - 1] = { ...serie[sig.orden - 1], valorAut: proyectado, esReal: false }
    }

    return { serie, proyectado, siguienteMes, historico: conDatos }
  }, [resumenMensual, filtroAnio])

  // ── Limpiar filtro de mes si cambia el año ───────────────────────────────
  useEffect(() => {
    setFiltroMes('todos')
    setFiltroMarca('todas')
  }, [filtroAnio])

  const hayFiltrosActivos =
    filtroAsesor !== 0 || filtroAseguradora !== 0 ||
    filtroMes !== 'todos' || filtroMarca !== 'todas'

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center flex-col gap-3">
      <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin"/>
      <p className="text-brand-subtle font-mono text-xs">Cargando datos...</p>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-brand-bg">

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <div className="border-b border-brand-border bg-brand-surface/50 px-6 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-brand-teal animate-pulse"/>
          <span className="font-mono text-xs text-brand-subtle uppercase tracking-widest">
            Almotores KIA · Repuestos &amp; Accesorios
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleRefreshManual}
            className="flex items-center gap-1.5 text-xs font-mono text-brand-subtle hover:text-brand-teal transition-colors border border-brand-border rounded-lg px-2.5 py-1"
            title="Actualizar ahora"
          >
            <RefreshCw size={12}/> Actualizar
          </button>
          <div className="flex items-center gap-1.5 text-xs font-mono text-brand-muted" title="Próxima actualización automática">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-teal animate-pulse"/>
            {`Auto en ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}`}
          </div>
          {ultimaActualizacion && (
            <span className="text-brand-muted font-mono text-xs hidden md:block">
              {ultimaActualizacion.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-brand-subtle hover:text-brand-text text-xs font-mono transition-colors"
          >
            <LogOut size={13}/> Salir
          </button>
        </div>
      </div>

      <div className="p-6">

        {/* ── TÍTULO ───────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="font-title text-2xl font-bold text-brand-text">Torre de Control · Subastas</h1>
          <p className="text-brand-subtle text-sm mt-1">
            Análisis histórico — {aniosDisponibles.join(', ')} · viendo {filtroAnio}
          </p>
        </div>

        {/* ── FILTROS ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-6 p-4 bg-brand-surface border border-brand-border rounded-xl">
          <span className="font-mono text-xs text-brand-muted self-center mr-2 uppercase tracking-wider">Filtrar por</span>

          {/* Año — siempre visible, primer filtro */}
          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Año</span>
            <select
              value={filtroAnio}
              onChange={e => setFiltroAnio(Number(e.target.value))}
              className="bg-brand-bg border border-brand-teal/50 rounded-lg px-3 py-1.5 text-brand-teal text-sm font-mono font-semibold outline-none focus:border-brand-teal"
            >
              {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>

          {/* Asesor */}
          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Asesor</span>
            <select
              value={filtroAsesor}
              onChange={e => setFiltroAsesor(Number(e.target.value))}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal"
            >
              <option value={0}>Todos</option>
              {asesores.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>

          {/* Aseguradora */}
          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Aseguradora</span>
            <select
              value={filtroAseguradora}
              onChange={e => setFiltroAseguradora(Number(e.target.value))}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal"
            >
              <option value={0}>Todas</option>
              {aseguradoras.map(a => <option key={a.id} value={a.id}>{a.nombre_corto}</option>)}
            </select>
          </label>

          {/* Mes — muestra solo los meses del año seleccionado */}
          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Mes</span>
            <select
              value={filtroMes}
              onChange={e => setFiltroMes(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal"
            >
              <option value="todos">Todos</option>
              {mesesDelAnio.filter(m => m !== 'todos').map(m => (
                <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
              ))}
            </select>
          </label>

          {/* Marca */}
          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Marca</span>
            <select
              value={filtroMarca}
              onChange={e => setFiltroMarca(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal"
            >
              <option value="todas">Todas</option>
              {marcas.filter(m => m !== 'todas').map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          {hayFiltrosActivos && (
            <button
              onClick={() => {
                setFiltroAsesor(0)
                setFiltroAseguradora(0)
                setFiltroMes('todos')
                setFiltroMarca('todas')
              }}
              className="ml-auto text-xs font-mono text-brand-muted hover:text-brand-red transition-colors border border-brand-border rounded-lg px-3 py-1.5"
            >
              × Limpiar filtros
            </button>
          )}
        </div>

        {/* ── MES EN CURSO ─────────────────────────────────────────────── */}
        <div className="mb-4 p-4 bg-gradient-to-r from-brand-surface to-brand-bg border border-brand-teal/30 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={15} className="text-brand-teal"/>
            <span className="font-mono text-xs text-brand-teal uppercase tracking-wider">
              Mes en curso · {mesActual.nombre}
            </span>
            {filtroAnio !== new Date().getFullYear() && (
              <span className="font-mono text-xs text-brand-gold ml-2">
                (proyección disponible solo para {new Date().getFullYear()})
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <MesCard label="Días hábiles totales"    value={mesActual.total}                   color="teal"/>
            <MesCard label="Días transcurridos"      value={mesActual.transcurridos}           color="subtle"/>
            <MesCard label="Días restantes"          value={mesActual.restantes}               color="gold"/>
            <MesCard label="Subastas acumuladas"     value={mesActual.subastasAcum}            color="teal"/>
            <MesCard label="Días hábiles con datos"  value={mesActual.diasConDatos}            color="subtle"/>
            <MesCard label="Proyección subastas"     value={mesActual.proySubastas}            color="gold" highlight/>
            <MesCard label="Proyección valor aut."   value={fmtM(mesActual.proyValor)}         color="gold" highlight small/>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs font-mono text-brand-muted mb-1">
              <span>Avance del mes</span>
              <span>{fmtPct(mesActual.pctAvance)}</span>
            </div>
            <div className="h-1.5 bg-brand-border rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-brand-teal transition-all" style={{ width: `${mesActual.pctAvance}%` }}/>
            </div>
          </div>
        </div>

        {/* ── KPIs PRINCIPALES ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
          <KpiCard icon={<TrendingUp size={15}/>}  label="Subastas"            value={kpis.total}               accent="teal"/>
          <KpiCard icon={<CheckCircle size={15}/>} label="Ganadas"             value={kpis.ganadas}             accent="teal"/>
          <KpiCard icon={<Target size={15}/>}      label="Tasa autorización"   value={fmtPct(kpis.tasaAuth)}    accent="teal" hint="ganadas / resueltas"/>
          <KpiCard icon={<TrendingUp size={15}/>}  label="Efectividad"         value={fmtPct(kpis.efectividad)} accent="gold" hint="ganadas / total"/>
          <KpiCard icon={<Clock size={15}/>}       label="Sin respuesta"       value={kpis.sinRespuesta}        accent="muted"/>
          <KpiCard icon={<Timer size={15}/>}       label="T. prom. suministro" value={`${kpis.tiempoProm} días`} accent="blue"/>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <KpiCard icon={<TrendingUp size={15}/>}  label="Valor subastado"  value={fmtCOP(kpis.valorSub)}  accent="blue" small/>
          <KpiCard icon={<CheckCircle size={15}/>} label="Valor autorizado" value={fmtCOP(kpis.valorAut)}  accent="teal" small/>
          <KpiCard icon={<TrendingUp size={15}/>}  label="Conversión en $"  value={fmtPct(kpis.convValor)} accent="gold"/>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatBadge icon={<FileCheck size={14}/>} label="Facturas radicadas"  value={fKpis.radicadas}  color="teal"/>
          <StatBadge icon={<FileClock size={14}/>} label="Facturas pendientes" value={fKpis.pendientes} color="gold"/>
          <StatBadge icon={<FileX size={14}/>}     label="Facturas anuladas"   value={fKpis.anuladas}   color="red"/>
        </div>

        {/* ── PIPELINE DE CONVERSIÓN ───────────────────────────────────── */}
        {pipeline && (
          <div className="mb-4 p-5 bg-brand-surface border border-brand-border rounded-xl">
            <h3 className="font-title text-base font-semibold text-brand-text mb-1">
              Pipeline de conversión · {filtroAnio}
            </h3>
            <p className="text-xs text-brand-subtle mb-5">
              Flujo acumulado del año — de subasta a factura radicada
            </p>
            <div className="flex items-stretch gap-2">

              {/* Etapa 1 — Total */}
              <PipelineEtapa
                label="Total subastas"
                value={pipeline.total}
                color="subtle"
              />

              <PipelineArrow pct={pipeline.pct_auth} label="autorizadas" />

              {/* Etapa 2 — Autorizadas */}
              <PipelineEtapa
                label="Autorizadas"
                value={pipeline.autorizadas}
                color="teal"
                pct={pipeline.pct_auth}
              />

              <PipelineArrow pct={pipeline.pct_pedido} label="en pedido" />

              {/* Etapa 3 — En pedido */}
              <PipelineEtapa
                label="En pedido"
                value={pipeline.en_pedido}
                color="blue"
                pct={pipeline.pct_pedido}
              />

              <PipelineArrow pct={null} label="" />

              {/* Etapa 4 — Por facturar */}
              <PipelineEtapa
                label="Por facturar"
                value={pipeline.por_facturar}
                color="gold"
                pct={null}
              />

              <PipelineArrow pct={null} label="" />

              {/* Etapa 5 — Por radicar */}
              <PipelineEtapa
                label="Por radicar"
                value={pipeline.por_radicar}
                color="gold"
                pct={null}
              />

              <PipelineArrow pct={null} label="" />

              {/* Etapa 6 — Completadas */}
              <PipelineEtapa
                label="Radicadas"
                value={pipeline.completadas}
                color="teal"
                pct={null}
              />
            </div>
          </div>
        )}

        {/* ── GRÁFICAS PRINCIPALES ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Panel title="Valor autorizado por asesor" sub="Subastas ganadas en el periodo filtrado">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={porAsesor} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                <XAxis dataKey="nombre" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={{ stroke: '#2A3340' }} tickLine={false}/>
                <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1e6).toFixed(0)}M`}/>
                <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [fmtCOP(v), 'Valor autorizado']}/>
                <Bar dataKey="valorAut" radius={[6, 6, 0, 0]} fill="#4FD1C5"/>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Estado de subastas" sub="Distribución del periodo filtrado">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={porEstado} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                  {porEstado.map((e, i) => <Cell key={i} fill={COLORES_ESTADO[e.name] || '#8AA4C8'} stroke="#0F1419" strokeWidth={2}/>)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}/>
                <Legend wrapperStyle={{ fontSize: 12, color: '#8AA4C8' }}/>
              </PieChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* ── PROYECCIÓN ANUAL ─────────────────────────────────────────── */}
        <div className="mb-4">
          <Panel
            title={`Valor autorizado por mes — ${filtroAnio}`}
            sub="Histórico real · punto dorado = proyección mes siguiente"
          >
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={proyeccionMes.serie} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                    <XAxis dataKey="mes" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={{ stroke: '#2A3340' }} tickLine={false} interval={0} angle={-30} textAnchor="end" height={40}/>
                    <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v ? `$${(v / 1e6).toFixed(0)}M` : ''}/>
                    <Tooltip
                      contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number, _: string, p: { payload?: { esReal?: boolean } }) => [
                        v ? fmtCOP(v) : '—',
                        p.payload?.esReal ? 'Real' : 'Proyectado',
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="valorAut"
                      stroke="#4FD1C5"
                      strokeWidth={2.5}
                      connectNulls={false}
                      dot={(p: { cx: number; cy: number; payload: { esReal: boolean; valorAut: number | null } }) => {
                        if (!p.payload.valorAut) return <circle key={p.cx} cx={0} cy={0} r={0}/>
                        return <circle key={p.cx} cx={p.cx} cy={p.cy} r={5} fill={p.payload.esReal ? '#4FD1C5' : '#E8A33D'} stroke="#0F1419" strokeWidth={2}/>
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-3 justify-center">
                {proyeccionMes.proyectado !== null && proyeccionMes.siguienteMes && (
                  <div className="bg-brand-bg border border-brand-gold/40 rounded-xl p-4">
                    <p className="font-mono text-xs text-brand-gold uppercase tracking-wider mb-1">Proyección {proyeccionMes.siguienteMes}</p>
                    <p className="font-title text-lg font-bold text-brand-text">{fmtCOP(proyeccionMes.proyectado)}</p>
                    <p className="text-brand-muted text-xs mt-1 font-mono">Tendencia lineal</p>
                  </div>
                )}
                <div className="bg-brand-bg border border-brand-teal/40 rounded-xl p-4">
                  <p className="font-mono text-xs text-brand-teal uppercase tracking-wider mb-1">{mesActual.nombre}</p>
                  <p className="font-title text-lg font-bold text-brand-text">{fmtCOP(mesActual.proyValor)}</p>
                  <p className="text-brand-muted text-xs mt-1 font-mono">
                    Ritmo: {mesActual.ritmo.toFixed(1)} sub/día · {mesActual.diasConDatos} días con datos · {mesActual.total} días hábiles
                  </p>
                </div>
                {proyeccionMes.historico.filter(h => h.mes).slice(-2).reverse().map(h => (
                  <div key={h.mes} className="bg-brand-bg border border-brand-border rounded-xl p-3">
                    <p className="font-mono text-xs text-brand-subtle">{h.mes}</p>
                    <p className="font-title text-sm font-bold text-brand-text">{fmtCOP(h.valorAut as number)}</p>
                    <p className="text-brand-muted text-xs">{h.ganadas} ganadas</p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>

        {/* ── CIUDADES + TIEMPO ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Panel title="Top ciudades destino" sub="Volumen de subastas por ciudad">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porCiudad} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" horizontal={false}/>
                <XAxis type="number" tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="ciudad" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={false} tickLine={false} width={80}/>
                <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}/>
                <Bar dataKey="total" radius={[0, 4, 4, 0]} name="Total subastas">
                  {porCiudad.map((_, i) => <Cell key={i} fill={COLORES_CIUDADES[i % COLORES_CIUDADES.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Tiempo máximo de suministro" sub="Distribución por rango de días">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porTiempo} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                <XAxis dataKey="rango" tick={{ fill: '#8AA4C8', fontSize: 11 }} axisLine={{ stroke: '#2A3340' }} tickLine={false}/>
                <YAxis tick={{ fill: '#8AA4C8', fontSize: 10 }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{ background: '#1B232D', border: '1px solid #2A3340', borderRadius: 8, fontSize: 12 }}/>
                <Bar dataKey="cantidad" radius={[6, 6, 0, 0]} fill="#8AA4C8" name="Subastas"/>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* ── TABLA ASESORES ───────────────────────────────────────────── */}
        <div className="mb-4">
          <Panel title="Efectividad por asesor" sub="Tasa autorización (ganadas/decididas) · Efectividad (ganadas/total)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border">
                    {['Asesor','Total','Ganadas','No autorizadas','Pendientes','Tasa autorización','Efectividad','Valor autorizado'].map(h => (
                      <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-6">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porAsesor.map(a => (
                    <tr key={a.id} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                      <td className="py-3 pr-6 text-brand-text font-medium">{a.nombre}</td>
                      <td className="py-3 pr-6 font-mono text-brand-subtle">{a.total}</td>
                      <td className="py-3 pr-6 font-mono text-brand-teal font-semibold">{a.ganadas}</td>
                      <td className="py-3 pr-6 font-mono text-brand-red">{a.noAut}</td>
                      <td className="py-3 pr-6 font-mono text-brand-subtle">{a.pendientes}</td>
                      <td className="py-3 pr-6">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-brand-border rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-brand-teal" style={{ width: `${a.tasaAuth}%` }}/>
                          </div>
                          <span className="font-mono text-xs text-brand-subtle">{fmtPct(a.tasaAuth)}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-6">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-brand-border rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${a.efectividad}%`, background: a.efectividad >= 30 ? '#4FD1C5' : '#E8A33D' }}/>
                          </div>
                          <span className="font-mono text-xs text-brand-subtle">{fmtPct(a.efectividad)}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-6 font-mono text-xs text-brand-subtle">{fmtCOP(a.valorAut)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {/* ── RANKING ASEGURADORAS ─────────────────────────────────────── */}
        <Panel title="Ranking por aseguradora" sub="Volumen de subastas y tasa de autorización (ganadas/resueltas)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Aseguradora','Total','Ganadas','Resueltas','Tasa autorización'].map(h => (
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porAseguradora.map(a => (
                  <tr key={a.id} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                    <td className="py-3 pr-6 text-brand-text">{a.nombre}</td>
                    <td className="py-3 pr-6 font-mono text-brand-subtle">{a.total}</td>
                    <td className="py-3 pr-6 font-mono text-brand-teal font-semibold">{a.ganadas}</td>
                    <td className="py-3 pr-6 font-mono text-brand-subtle">{a.resueltas}</td>
                    <td className="py-3 pr-6">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-brand-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${a.tasa}%`, background: a.tasa >= 40 ? '#4FD1C5' : '#E8A33D' }}/>
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
    </div>
  )
}

// ── Sub-componentes ──────────────────────────────────────────────────────────
function MesCard({ label, value, color, highlight, small }: {
  label: string; value: string | number; color: string; highlight?: boolean; small?: boolean
}) {
  const cls: Record<string, string> = { teal: 'text-brand-teal', gold: 'text-brand-gold', subtle: 'text-brand-subtle' }
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-brand-gold/10 border border-brand-gold/30' : 'bg-brand-bg border border-brand-border'}`}>
      <p className="font-mono text-xs text-brand-muted mb-1">{label}</p>
      <p className={`font-title font-bold ${small ? 'text-base' : 'text-xl'} ${cls[color] || 'text-brand-text'}`}>{value}</p>
    </div>
  )
}

function KpiCard({ icon, label, value, accent, small, hint }: {
  icon: React.ReactNode; label: string; value: string | number; accent: string; small?: boolean; hint?: string
}) {
  const bc: Record<string, string> = { teal: '#4FD1C5', gold: '#E8A33D', blue: '#60A5FA', red: '#E5484D', muted: '#5B6472' }
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 relative overflow-hidden">
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: bc[accent] || '#4FD1C5' }}/>
      <div className="flex items-center gap-2 text-brand-subtle mb-2">{icon}<span className="text-xs">{label}</span></div>
      <div className={`font-title font-bold text-brand-text ${small ? 'text-lg' : 'text-2xl'}`}>{value}</div>
      {hint && <p className="text-brand-muted text-xs mt-1 font-mono">{hint}</p>}
    </div>
  )
}

function StatBadge({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number; color: string
}) {
  const cls: Record<string, string> = { teal: 'text-brand-teal', gold: 'text-brand-gold', red: 'text-brand-red' }
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 flex justify-between items-center">
      <div className="flex items-center gap-2 text-brand-subtle text-sm">{icon}{label}</div>
      <span className={`font-mono font-bold text-xl ${cls[color] || ''}`}>{value}</span>
    </div>
  )
}

function Panel({ title, sub, children }: {
  title: string; sub: string; children: React.ReactNode
}) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
      <h3 className="font-title text-base font-semibold text-brand-text">{title}</h3>
      <p className="text-xs text-brand-subtle mb-4">{sub}</p>
      {children}
    </div>
  )
}

function PipelineEtapa({ label, value, color, pct }: {
  label: string
  value: number
  color: 'teal' | 'gold' | 'blue' | 'subtle'
  pct?: number | null
}) {
  const colorMap: Record<string, string> = {
    teal:   'text-brand-teal   border-brand-teal/30   bg-brand-teal/5',
    gold:   'text-brand-gold   border-brand-gold/30   bg-brand-gold/5',
    blue:   'text-blue-400     border-blue-400/30     bg-blue-400/5',
    subtle: 'text-brand-subtle border-brand-border    bg-brand-bg',
  }
  const textColor: Record<string, string> = {
    teal: 'text-brand-teal', gold: 'text-brand-gold',
    blue: 'text-blue-400',   subtle: 'text-brand-subtle',
  }
  return (
    <div className={`flex-1 min-w-0 border rounded-xl p-3 flex flex-col gap-1 ${colorMap[color]}`}>
      <p className="font-mono text-[10px] text-brand-muted uppercase tracking-wider leading-tight">{label}</p>
      <p className={`font-title font-bold text-2xl ${textColor[color]}`}>{value.toLocaleString('es-CO')}</p>
      {pct != null && (
        <p className="font-mono text-[10px] text-brand-muted">{pct.toFixed(1)}% del anterior</p>
      )}
    </div>
  )
}

function PipelineArrow({ pct, label }: { pct: number | null; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 shrink-0 w-8">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 10h12M12 6l4 4-4 4" stroke="#2A3340" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {pct != null && (
        <span className="font-mono text-[9px] text-brand-muted text-center leading-tight">
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  )
}
