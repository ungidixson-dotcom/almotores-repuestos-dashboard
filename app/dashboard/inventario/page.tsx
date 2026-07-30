'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Download, Search, ChevronUp, ChevronDown, ShoppingCart, X, Filter, AlertTriangle } from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface FilaPedido {
  almacen:               string
  sede:                  string
  referencia:            string
  descripcion:           string
  clase:                 string
  modelo:                string | null
  stock_real:            number
  costo_medio:           number
  fecha_ult_salida:      string | null
  promedio_9m:           number
  movil_ponderado:       number
  frecuencia:            number
  moda:                  number
  promedio_4m:           number
  reforzar:              boolean
  cond1_considerar:      boolean
  cond2_reforzar:        boolean
  cond3_pedir:           boolean
  cond4_solicitar:       boolean
  condiciones_cumplidas: number
  accion_sugerida:       string
  cantidad_sugerida:     number
  es_obsoleto:           boolean
  accion_manual:         string | null
  motivo_override:       string | null
}

type Accion   = 'Concretar' | 'Recomendar' | 'Observar' | 'Descartar'
type OrdenCol = 'referencia' | 'descripcion' | 'modelo' | 'stock_real' | 'promedio_9m' |
                'promedio_4m' | 'cantidad_sugerida' | 'frecuencia' | 'cobertura'

// ── Constantes ─────────────────────────────────────────────────────────────────
const SEDES     = ['Todas', 'Norte', 'Pasoancho', 'Sede 39']
const ALMACENES = ['Todos', '11', '11J', '12', '13', '15']
const CLASES    = ['Todas', 'A', 'B', 'C']
const ACCIONES: Accion[] = ['Concretar', 'Recomendar', 'Observar', 'Descartar']

const COLOR_ACCION: Record<string, string> = {
  Concretar:  '#4FD1C5',
  Recomendar: '#68D391',
  Observar:   '#E8A33D',
  Descartar:  '#5B6472',
}
const BG_ACCION: Record<string, string> = {
  Concretar:  'bg-teal-500/20 text-teal-300 border-teal-500/40',
  Recomendar: 'bg-green-500/20 text-green-300 border-green-500/40',
  Observar:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  Descartar:  'bg-brand-border/60 text-brand-muted border-brand-border',
}

// ── Utilidades ─────────────────────────────────────────────────────────────────
const fmtCOP = (v: number) => `$${Math.round(v).toLocaleString('es-CO')}`
const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`
const rowKey  = (f: FilaPedido) => `${f.almacen}__${f.referencia}`

// Normaliza "GENERAL" / "General" → "General" para comparar
const normModelo = (m: string | null) => (m ?? '').trim()

// Meses de cobertura al ritmo del promedio 9M
const cobMeses = (f: FilaPedido): number =>
  f.promedio_9m > 0 ? f.stock_real / f.promedio_9m : (f.stock_real > 0 ? 99 : 0)

function cobColor(m: number): string {
  if (m === 0)  return 'text-brand-muted'
  if (m < 0.5)  return 'text-red-400 font-semibold'
  if (m < 1)    return 'text-orange-400'
  if (m < 2)    return 'text-yellow-400'
  if (m < 4)    return 'text-green-400'
  return 'text-brand-muted'
}

// ── Componentes base ───────────────────────────────────────────────────────────
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-brand-border bg-brand-surface p-5 ${className}`}>
      {children}
    </div>
  )
}

function Badge({ accion }: { accion: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-mono font-medium ${
      BG_ACCION[accion] ?? 'bg-brand-border text-brand-muted border-brand-border'
    }`}>
      {accion}
    </span>
  )
}

function KpiCard({ label, value, sub, color = 'text-brand-teal' }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <Panel>
      <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">{label}</p>
      <p className={`text-2xl font-bold font-title ${color}`}>{value}</p>
      {sub && <p className="text-xs text-brand-subtle mt-1">{sub}</p>}
    </Panel>
  )
}

function Cond({ ok }: { ok: boolean }) {
  return <span className={`text-xs font-mono ${ok ? 'text-green-400' : 'text-brand-muted'}`}>{ok ? '✓' : '✗'}</span>
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function InventarioPage() {
  const [filas,     setFilas]     = useState<FilaPedido[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [ultimaAct, setUltimaAct] = useState<Date | null>(null)

  // Filtros
  const [sede,          setSede]          = useState('Todas')
  const [almacen,       setAlmacen]       = useState('Todos')
  const [clase,         setClase]         = useState('Todas')
  const [modeloFiltro,  setModeloFiltro]  = useState('')
  const [accionesSel,   setAccionesSel]   = useState<Set<Accion>>(new Set(['Concretar', 'Recomendar', 'Observar'] as Accion[]))
  const [buscar,        setBuscar]        = useState('')
  const [soloStock,     setSoloStock]     = useState(false)
  const [soloObsoletos, setSoloObsoletos] = useState(false)
  const [soloUrgentes,  setSoloUrgentes]  = useState(false)

  // Tabla
  const [orden,  setOrden]  = useState<OrdenCol>('cantidad_sugerida')
  const [desc,   setDesc]   = useState(true)
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 50

  // Selección
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())

  // Override modal
  const [overrideRef,    setOverrideRef]    = useState<FilaPedido | null>(null)
  const [overrideAccion, setOverrideAccion] = useState<'Pedir' | 'No Pedir'>('Pedir')
  const [overrideMotivo, setOverrideMotivo] = useState('')
  const [guardando,      setGuardando]      = useState(false)
  const [saveError,      setSaveError]      = useState('')

  // ── Carga ──────────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, error: err } = await supabase.from('v_pedido_sugerido').select('*')
      if (err) throw err
      setFilas((data ?? []) as FilaPedido[])
      setUltimaAct(new Date())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'intente de nuevo'
      setError(`Error: ${msg}`)
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Escape cierra modal
  useEffect(() => {
    if (!overrideRef) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOverrideRef(null); setSaveError('') }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [overrideRef])

  // ── Lista dinámica de modelos desde los datos ──────────────────────────────
  const modelos = useMemo(() =>
    ['', ...Array.from(new Set(
      filas
        .map(f => normModelo(f.modelo))
        .filter(m => m && m.toUpperCase() !== 'GENERAL' && m.toUpperCase() !== 'GENERAL ')
        .sort()
    ))],
  [filas])

  const totalGeneral = useMemo(() =>
    filas.filter(f => !f.modelo || f.modelo.toUpperCase().trim() === 'GENERAL').length,
  [filas])

  // ── Toggle acción ──────────────────────────────────────────────────────────
  const toggleAccion = (a: Accion) => {
    setAccionesSel(prev => {
      const next = new Set(prev)
      next.has(a) ? next.delete(a) : next.add(a)
      return next
    })
    setPagina(1)
  }

  const filtrosLocales = sede !== 'Todas' || almacen !== 'Todos' || clase !== 'Todas' || buscar !== '' || modeloFiltro !== ''

  // ── Filtrar ────────────────────────────────────────────────────────────────
  const filasFiltradas = useMemo(() => {
    const q = buscar.toLowerCase()
    return filas.filter(f => {
      if (sede    !== 'Todas' && f.sede    !== sede)    return false
      if (almacen !== 'Todos' && f.almacen !== almacen) return false
      if (clase   !== 'Todas' && f.clase   !== clase)   return false
      if (!accionesSel.has(f.accion_sugerida as Accion)) return false
      if (soloStock     && f.stock_real > 0)  return false
      if (soloObsoletos && !f.es_obsoleto)    return false
      if (soloUrgentes  && !(cobMeses(f) < 1 && ['Concretar', 'Recomendar'].includes(f.accion_sugerida))) return false
      if (modeloFiltro  && normModelo(f.modelo).toLowerCase() !== modeloFiltro.toLowerCase()) return false
      if (q && !f.referencia.toLowerCase().includes(q) &&
               !f.descripcion.toLowerCase().includes(q) &&
               !(f.modelo ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [filas, sede, almacen, clase, accionesSel, buscar, soloStock, soloObsoletos, soloUrgentes, modeloFiltro])

  // ── Ordenar ────────────────────────────────────────────────────────────────
  const filasOrdenadas = useMemo(() => {
    return [...filasFiltradas].sort((a, b) => {
      const get = (f: FilaPedido): number | string =>
        orden === 'cobertura'
          ? cobMeses(f)
          : (f[orden as keyof FilaPedido] as number | string ?? 0)
      const va = get(a), vb = get(b)
      if (typeof va === 'string')
        return desc ? vb.toString().localeCompare(va.toString()) : va.toString().localeCompare(vb.toString())
      return desc ? (vb as number) - (va as number) : (va as number) - (vb as number)
    })
  }, [filasFiltradas, orden, desc])

  // ── Paginación ─────────────────────────────────────────────────────────────
  const totalPaginas = Math.ceil(filasOrdenadas.length / POR_PAGINA)
  const filasPagina  = filasOrdenadas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  // ── Selección ──────────────────────────────────────────────────────────────
  const toggleSeleccion = (f: FilaPedido) => {
    const k = rowKey(f)
    setSeleccion(prev => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  }

  const togglePagina = () => {
    const keys = filasPagina.map(rowKey)
    const todasSel = keys.every(k => seleccion.has(k))
    setSeleccion(prev => {
      const next = new Set(prev)
      keys.forEach(k => todasSel ? next.delete(k) : next.add(k))
      return next
    })
  }

  const seleccionarTodosFiltrados = () =>
    setSeleccion(new Set(filasOrdenadas.map(rowKey)))

  const limpiarSeleccion = () => setSeleccion(new Set())

  const filasSeleccionadas = useMemo(
    () => filas.filter(f => seleccion.has(rowKey(f))),
    [filas, seleccion]
  )

  const resumenPedido = useMemo(() => ({
    refs:     filasSeleccionadas.length,
    unidades: filasSeleccionadas.reduce((s, f) => s + f.cantidad_sugerida, 0),
    valor:    filasSeleccionadas.reduce((s, f) => s + f.cantidad_sugerida * f.costo_medio, 0),
  }), [filasSeleccionadas])

  // ── KPIs globales ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const ap = filas.filter(f => ['Concretar', 'Recomendar'].includes(f.accion_sugerida))
    return {
      concretar:   filas.filter(f => f.accion_sugerida === 'Concretar').length,
      recomendar:  filas.filter(f => f.accion_sugerida === 'Recomendar').length,
      observar:    filas.filter(f => f.accion_sugerida === 'Observar').length,
      obsoletos:   filas.filter(f => f.es_obsoleto).length,
      urgentes:    filas.filter(f => cobMeses(f) < 1 && ['Concretar', 'Recomendar'].includes(f.accion_sugerida)).length,
      refs_pedir:  ap.length,
      uds_pedir:   ap.reduce((s, f) => s + f.cantidad_sugerida, 0),
      valor_pedir: ap.reduce((s, f) => s + f.cantidad_sugerida * f.costo_medio, 0),
    }
  }, [filas])

  // KPIs de la vista filtrada
  const kpisVista = useMemo(() => {
    if (!filtrosLocales) return null
    const ap = filasFiltradas.filter(f => ['Concretar', 'Recomendar'].includes(f.accion_sugerida))
    return {
      concretar:   filasFiltradas.filter(f => f.accion_sugerida === 'Concretar').length,
      refs_pedir:  ap.length,
      uds_pedir:   ap.reduce((s, f) => s + f.cantidad_sugerida, 0),
      valor_pedir: ap.reduce((s, f) => s + f.cantidad_sugerida * f.costo_medio, 0),
    }
  }, [filasFiltradas, filtrosLocales])

  // ── Guardar override ───────────────────────────────────────────────────────
  const guardarOverride = async () => {
    if (!overrideRef) return
    setGuardando(true); setSaveError('')
    try {
      await supabase.from('inventario_override').upsert({
        almacen:        overrideRef.almacen,
        referencia:     overrideRef.referencia,
        accion_manual:  overrideAccion,
        motivo:         overrideMotivo || null,
        usuario:        'jefe_repuestos',
        actualizado_en: new Date().toISOString(),
      }, { onConflict: 'almacen,referencia' })
      setOverrideRef(null); setOverrideMotivo('')
      await cargar()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'intente de nuevo'
      setSaveError(`Error guardando: ${msg}`)
    }
    setGuardando(false)
  }

  // ── Descargar (respeta filtros activos) ───────────────────────────────────
  const descargar = (soloSeleccion = false) => {
    const cols = [
      'Almacen', 'Sede', 'Referencia', 'Descripcion', 'Modelo', 'Clase',
      'Stock_Real', 'Cob_Meses', 'Prom_9M', 'Movil_Ponderado', 'Prom_4M', 'Frecuencia',
      'Cond1', 'Cond2', 'Cond3', 'Cond4', 'Condiciones',
      'Accion_Sugerida', 'Cantidad_Sugerida', 'Costo_Medio', 'Valor_Estimado',
      'Override', 'Motivo',
    ]

    const base = soloSeleccion
      ? filasSeleccionadas
      : filasFiltradas.filter(f => ['Concretar', 'Recomendar'].includes(f.accion_sugerida))

    if (base.length === 0) { alert('No hay referencias para descargar.'); return }

    const esc = (v: string) => `"${(v ?? '').toString().replace(/"/g, '""')}"`

    const rows = base.map(f => {
      const cob = cobMeses(f)
      return [
        f.almacen, f.sede, f.referencia, esc(f.descripcion), esc(f.modelo ?? ''), f.clase,
        f.stock_real,
        cob >= 99 ? '' : cob.toFixed(2),
        f.promedio_9m, f.movil_ponderado, f.promedio_4m, f.frecuencia,
        f.cond1_considerar ? 1 : 0, f.cond2_reforzar ? 1 : 0,
        f.cond3_pedir ? 1 : 0, f.cond4_solicitar ? 1 : 0,
        f.condiciones_cumplidas,
        f.accion_sugerida, f.cantidad_sugerida,
        Math.round(f.costo_medio),
        Math.round(f.cantidad_sugerida * f.costo_medio),
        f.accion_manual ?? '', esc(f.motivo_override ?? ''),
      ].join(',')
    })

    const csv  = [cols.join(','), ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `pedido_${soloSeleccion ? 'seleccion' : 'sugerido'}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Header columna ordenable ───────────────────────────────────────────────
  function ColHeader({ col, label }: { col: OrdenCol; label: string }) {
    const activo = orden === col
    return (
      <th
        className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-3 whitespace-nowrap cursor-pointer hover:text-brand-text transition-colors"
        onClick={() => { if (activo) setDesc(d => !d); else { setOrden(col); setDesc(true) } }}
      >
        <span className="flex items-center gap-1">
          {label}
          {activo ? (desc ? <ChevronDown size={12}/> : <ChevronUp size={12}/>) : null}
        </span>
      </th>
    )
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
        <p className="text-brand-subtle text-sm font-mono">Calculando pedido sugerido...</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-title text-brand-text">Planeación de Inventario</h1>
          <p className="text-sm text-brand-subtle mt-0.5">
            Pedido sugerido · Motor multicriteria · {filas.length.toLocaleString('es-CO')} referencias evaluadas
            {modelos.length > 1 && (
              <span className="ml-2 text-brand-muted">· {modelos.length - 1} modelos de vehículo · {totalGeneral.toLocaleString('es-CO')} refs generales</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={cargar} disabled={loading}
            className="flex items-center gap-2 bg-brand-teal/20 hover:bg-brand-teal/30 border border-brand-teal/40 text-brand-teal rounded-lg px-4 py-2 text-sm font-mono transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
            Actualizar
          </button>
          <button onClick={() => descargar(false)}
            className="flex items-center gap-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-400 rounded-lg px-4 py-2 text-sm font-mono transition-colors">
            <Download size={14}/>
            Descargar pedido{filtrosLocales && ' (filtrado)'}
          </button>
          {ultimaAct && (
            <span className="text-xs text-brand-subtle font-mono">
              Act: {ultimaAct.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-400 text-sm font-mono">{error}</div>
      )}

      {/* ── KPIs globales ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard label="Concretar"        value={kpis.concretar}  color="text-brand-teal" sub="pedir urgente"/>
        <KpiCard label="Recomendar"       value={kpis.recomendar} color="text-green-400"  sub="pedir pronto"/>
        <KpiCard label="Observar"         value={kpis.observar}   color="text-yellow-400" sub="vigilar"/>
        <KpiCard label="Obsoletos"        value={kpis.obsoletos}  color="text-red-400"    sub="+12 meses sin salida"/>
        <KpiCard label="Refs a pedir"     value={kpis.refs_pedir} color="text-brand-teal"/>
        <KpiCard label="Unidades a pedir" value={kpis.uds_pedir.toLocaleString('es-CO')} color="text-green-400"/>
        <KpiCard label="Valor estimado"   value={`$${(kpis.valor_pedir / 1e6).toFixed(1)}M`} color="text-brand-gold" sub="a costo medio"/>
      </div>

      {/* ── Banner urgentes ── */}
      {kpis.urgentes > 0 && !soloUrgentes && (
        <button
          onClick={() => { setSoloUrgentes(true); setPagina(1) }}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-red-500/40 bg-red-500/5 hover:bg-red-500/10 transition-colors text-xs font-mono group">
          <span className="flex items-center gap-2 text-red-400">
            <AlertTriangle size={14} className="shrink-0"/>
            <span className="font-semibold">{kpis.urgentes} referencias con cobertura crítica</span>
            <span className="text-red-400/60 hidden sm:inline">— stock se agota en menos de 4 semanas · acción: Concretar o Recomendar</span>
          </span>
          <span className="text-red-400 font-semibold group-hover:underline shrink-0">Ver urgentes →</span>
        </button>
      )}

      {/* ── KPIs vista filtrada ── */}
      {kpisVista && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-brand-teal/20 bg-brand-teal/5 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-brand-teal font-semibold uppercase tracking-wider">
            <Filter size={11}/> Vista filtrada
          </span>
          <span className="text-brand-subtle">
            <span className="text-brand-teal font-bold">{kpisVista.concretar}</span> concretar ·{' '}
            <span className="text-brand-teal font-bold">{kpisVista.refs_pedir}</span> refs a pedir ·{' '}
            <span className="text-green-400 font-bold">{kpisVista.uds_pedir.toLocaleString('es-CO')}</span> uds ·{' '}
            <span className="text-brand-gold font-bold">${(kpisVista.valor_pedir / 1e6).toFixed(2)}M</span>
          </span>
        </div>
      )}

      {/* ── Panel pedido seleccionado ── */}
      {seleccion.size > 0 && (
        <Panel className="border-brand-teal/40 bg-brand-teal/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShoppingCart size={18} className="text-brand-teal"/>
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-brand-teal mb-0.5">Pedido seleccionado</p>
                <p className="text-sm font-mono text-brand-text">
                  <span className="font-bold text-brand-teal">{resumenPedido.refs}</span> referencias ·{' '}
                  <span className="font-bold text-green-400">{resumenPedido.unidades.toLocaleString('es-CO')}</span> unidades ·{' '}
                  <span className="font-bold text-brand-gold">{fmtCOP(resumenPedido.valor)}</span> valor estimado
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => descargar(true)}
                className="flex items-center gap-2 bg-brand-teal text-black rounded-lg px-4 py-2 text-sm font-mono font-semibold hover:bg-brand-teal/80 transition-colors">
                <Download size={14}/>
                Descargar selección
              </button>
              <button onClick={limpiarSeleccion}
                className="flex items-center gap-2 border border-brand-border text-brand-subtle hover:text-brand-text rounded-lg px-3 py-2 text-sm font-mono transition-colors">
                <X size={14}/>
                Limpiar
              </button>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-brand-teal/20 flex flex-wrap gap-2">
            {filasSeleccionadas.slice(0, 20).map(f => (
              <span key={rowKey(f)}
                className="inline-flex items-center gap-1.5 bg-brand-bg border border-brand-border rounded-lg px-2 py-1 text-xs font-mono text-brand-text">
                <span className="text-brand-muted">Alm{f.almacen}</span>
                <span className="font-semibold">{f.referencia}</span>
                <span className="text-brand-teal">{f.cantidad_sugerida} uds</span>
                <button onClick={() => toggleSeleccion(f)} className="text-brand-muted hover:text-red-400 ml-1">×</button>
              </span>
            ))}
            {filasSeleccionadas.length > 20 && (
              <span className="text-xs font-mono text-brand-muted py-1">+{filasSeleccionadas.length - 20} más...</span>
            )}
          </div>
        </Panel>
      )}

      {/* ── Filtros ── */}
      <Panel>
        <div className="flex flex-wrap items-center gap-4">

          {/* Acciones */}
          <div className="flex gap-2">
            {ACCIONES.map(a => (
              <button key={a} onClick={() => toggleAccion(a)}
                className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                  accionesSel.has(a) ? 'border-current font-semibold' : 'border-brand-border text-brand-muted'
                }`}
                style={accionesSel.has(a)
                  ? { color: COLOR_ACCION[a], borderColor: COLOR_ACCION[a] + '60', background: COLOR_ACCION[a] + '15' }
                  : {}}>
                {a}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-brand-border"/>

          {/* Sede */}
          <div className="flex rounded-lg border border-brand-border overflow-hidden">
            {SEDES.map(s => (
              <button key={s} onClick={() => { setSede(s); setAlmacen('Todos'); setPagina(1) }}
                className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                  sede === s ? 'bg-brand-teal text-black font-semibold' : 'text-brand-subtle hover:text-brand-text'
                }`}>{s}</button>
            ))}
          </div>

          {/* Almacén */}
          <div className="flex rounded-lg border border-brand-border overflow-hidden">
            {ALMACENES.map(a => (
              <button key={a} onClick={() => { setAlmacen(a); setSede('Todas'); setPagina(1) }}
                className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                  almacen === a ? 'bg-brand-gold text-black font-semibold' : 'text-brand-subtle hover:text-brand-text'
                }`}>{a === 'Todos' ? 'Todos' : `Alm ${a}`}</button>
            ))}
          </div>

          {/* Clase */}
          <div className="flex rounded-lg border border-brand-border overflow-hidden">
            {CLASES.map(c => (
              <button key={c} onClick={() => { setClase(c); setPagina(1) }}
                className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                  clase === c ? 'bg-brand-subtle text-black font-semibold' : 'text-brand-subtle hover:text-brand-text'
                }`}>{c}</button>
            ))}
          </div>

          <div className="w-px h-6 bg-brand-border"/>

          {/* Modelo de vehículo */}
          {modelos.length > 1 && (
            <div className="relative">
              <select
                value={modeloFiltro}
                onChange={e => { setModeloFiltro(e.target.value); setPagina(1) }}
                className={`pl-3 pr-7 py-1.5 text-xs font-mono rounded-lg border transition-colors appearance-none cursor-pointer focus:outline-none ${
                  modeloFiltro
                    ? 'bg-brand-gold/15 border-brand-gold/50 text-brand-gold font-semibold'
                    : 'bg-brand-bg border-brand-border text-brand-subtle'
                }`}>
                <option value="">Todos los modelos</option>
                {modelos.filter(Boolean).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none"/>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={soloStock}
              onChange={e => { setSoloStock(e.target.checked); setPagina(1) }}
              className="w-3.5 h-3.5 accent-brand-teal"/>
            <span className="text-xs font-mono text-brand-subtle">Sin stock</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={soloObsoletos}
              onChange={e => { setSoloObsoletos(e.target.checked); setPagina(1) }}
              className="w-3.5 h-3.5 accent-red-400"/>
            <span className="text-xs font-mono text-brand-subtle">Solo obsoletos</span>
          </label>

          <button
            onClick={() => { setSoloUrgentes(u => !u); setPagina(1) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
              soloUrgentes
                ? 'bg-red-500/20 border-red-500/50 text-red-400 font-semibold'
                : 'border-brand-border text-brand-muted hover:text-red-400 hover:border-red-500/40'
            }`}>
            <AlertTriangle size={11}/>
            Urgentes{kpis.urgentes > 0 ? ` (${kpis.urgentes})` : ''}
          </button>

          <div className="relative ml-auto">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted"/>
            <input type="text" placeholder="Buscar ref, descripción o modelo..."
              value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(1) }}
              className="pl-8 pr-3 py-1.5 text-xs font-mono bg-brand-bg border border-brand-border rounded-lg text-brand-text focus:outline-none focus:border-brand-teal w-64"/>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span className="text-xs font-mono text-brand-subtle">
            Mostrando {filasFiltradas.length.toLocaleString('es-CO')} de {filas.length.toLocaleString('es-CO')} referencias
            {seleccion.size > 0 && <span className="ml-3 text-brand-teal">· {seleccion.size} seleccionadas</span>}
          </span>
          {filasOrdenadas.length > POR_PAGINA && seleccion.size < filasOrdenadas.length && (
            <button onClick={seleccionarTodosFiltrados}
              className="text-xs font-mono text-brand-teal hover:underline transition-colors">
              Seleccionar todos los {filasOrdenadas.length.toLocaleString('es-CO')} filtrados
            </button>
          )}
        </div>
      </Panel>

      {/* ── Tabla ── */}
      <Panel className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                <th className="py-3 pl-4 pr-2 w-8">
                  <input type="checkbox"
                    checked={filasPagina.length > 0 && filasPagina.every(f => seleccion.has(rowKey(f)))}
                    onChange={togglePagina}
                    className="w-3.5 h-3.5 accent-brand-teal"/>
                </th>
                <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider py-3 pr-3 whitespace-nowrap">Sede/Alm</th>
                <ColHeader col="referencia"        label="Referencia"/>
                <ColHeader col="descripcion"       label="Descripción"/>
                <ColHeader col="modelo"            label="Modelo"/>
                <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-3 whitespace-nowrap">Clase</th>
                <ColHeader col="stock_real"        label="Stock"/>
                <ColHeader col="cobertura"         label="Cob."/>
                <ColHeader col="promedio_9m"       label="Prom 9M"/>
                <ColHeader col="promedio_4m"       label="Prom 4M"/>
                <ColHeader col="frecuencia"        label="Frec."/>
                <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-3 whitespace-nowrap">C1 C2 C3 C4</th>
                <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-3 whitespace-nowrap">Acción</th>
                <ColHeader col="cantidad_sugerida" label="Pedir"/>
                <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-3 whitespace-nowrap">Valor</th>
                <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-5 whitespace-nowrap">Override</th>
              </tr>
            </thead>
            <tbody>
              {filasPagina.map((f, i) => {
                const sel = seleccion.has(rowKey(f))
                const cob = cobMeses(f)
                const modeloDisplay = normModelo(f.modelo)
                const esGeneral = !modeloDisplay || modeloDisplay.toUpperCase() === 'GENERAL'
                return (
                  <tr key={`${f.almacen}-${f.referencia}-${i}`}
                    className={`border-b border-brand-border/40 transition-colors cursor-pointer ${
                      sel ? 'bg-brand-teal/5 border-brand-teal/20' : 'hover:bg-brand-surface/50'
                    } ${f.es_obsoleto ? 'opacity-60' : ''}`}
                    onClick={() => toggleSeleccion(f)}>

                    <td className="py-2.5 pl-4 pr-2" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={sel} onChange={() => toggleSeleccion(f)}
                        className="w-3.5 h-3.5 accent-brand-teal"/>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-brand-subtle whitespace-nowrap">
                      {f.sede}<br/><span className="text-brand-muted">Alm {f.almacen}</span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-brand-text font-semibold whitespace-nowrap">{f.referencia}</td>
                    <td className="py-2.5 pr-3 text-xs text-brand-subtle max-w-[180px] truncate" title={f.descripcion}>{f.descripcion}</td>
                    {/* Modelo de vehículo */}
                    <td className="py-2.5 pr-3">
                      {esGeneral
                        ? <span className="text-xs font-mono text-brand-muted">—</span>
                        : (
                          <button
                            onClick={e => { e.stopPropagation(); setModeloFiltro(modeloDisplay); setPagina(1) }}
                            className="text-xs font-mono px-1.5 py-0.5 rounded bg-brand-gold/15 text-brand-gold border border-brand-gold/30 hover:bg-brand-gold/25 transition-colors whitespace-nowrap"
                            title={`Filtrar por ${modeloDisplay}`}>
                            {modeloDisplay}
                          </button>
                        )
                      }
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        f.clase === 'A' ? 'bg-brand-teal/20 text-brand-teal' :
                        f.clase === 'B' ? 'bg-brand-gold/20 text-brand-gold' :
                        'bg-brand-border text-brand-muted'
                      }`}>{f.clase}</span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs">
                      <span className={f.stock_real === 0 ? 'text-red-400 font-semibold' : 'text-brand-text'}>{f.stock_real}</span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs">
                      {f.promedio_9m === 0
                        ? <span className="text-brand-muted" title="Sin demanda registrada">—</span>
                        : <span className={cobColor(cob)} title="Meses de cobertura (stock ÷ prom 9M)">
                            {cob >= 99 ? '99+' : cob.toFixed(1)}m
                          </span>
                      }
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-brand-subtle">{f.promedio_9m}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-brand-subtle">{f.promedio_4m}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-brand-subtle">{fmtPct(f.frecuencia)}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs">
                      <span className="flex gap-1.5">
                        <Cond ok={f.cond1_considerar}/>
                        <Cond ok={f.cond2_reforzar}/>
                        <Cond ok={f.cond3_pedir}/>
                        <Cond ok={f.cond4_solicitar}/>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3"><Badge accion={f.accion_sugerida}/></td>
                    <td className="py-2.5 pr-3 font-mono text-xs">
                      {f.cantidad_sugerida > 0
                        ? <span className="text-brand-teal font-semibold">{f.cantidad_sugerida}</span>
                        : <span className="text-brand-muted">—</span>}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-brand-subtle">
                      {f.costo_medio > 0 && f.cantidad_sugerida > 0
                        ? fmtCOP(f.cantidad_sugerida * f.costo_medio)
                        : '—'}
                    </td>
                    <td className="py-2.5 pr-5" onClick={e => e.stopPropagation()}>
                      {f.accion_manual ? (
                        <button onClick={() => {
                          setOverrideRef(f)
                          setOverrideAccion(f.accion_manual as 'Pedir' | 'No Pedir')
                          setOverrideMotivo(f.motivo_override ?? '')
                          setSaveError('')
                        }}
                          className={`text-xs font-mono px-2 py-0.5 rounded border ${
                            f.accion_manual === 'Pedir'
                              ? 'border-green-500/40 text-green-400'
                              : 'border-red-500/40 text-red-400'
                          }`}>
                          {f.accion_manual}
                        </button>
                      ) : (
                        <button onClick={() => {
                          setOverrideRef(f)
                          setOverrideAccion('Pedir')
                          setOverrideMotivo('')
                          setSaveError('')
                        }}
                          className="text-xs font-mono text-brand-muted hover:text-brand-subtle border border-transparent hover:border-brand-border rounded px-2 py-0.5 transition-colors">
                          + marcar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalPaginas > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-brand-border">
            <span className="text-xs font-mono text-brand-subtle">
              Página {pagina} de {totalPaginas} · {filasFiltradas.length} referencias
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                className="px-3 py-1 text-xs font-mono border border-brand-border rounded hover:border-brand-teal text-brand-subtle disabled:opacity-30 transition-colors">
                ← Anterior
              </button>
              <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
                className="px-3 py-1 text-xs font-mono border border-brand-border rounded hover:border-brand-teal text-brand-subtle disabled:opacity-30 transition-colors">
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </Panel>

      {/* ── Modal override ── */}
      {overrideRef && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => { setOverrideRef(null); setSaveError('') }}
        >
          <div
            className="bg-brand-surface border border-brand-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold font-title text-brand-text mb-1">Decisión manual</h3>
            <p className="text-xs font-mono text-brand-subtle mb-4">
              {overrideRef.referencia} · {overrideRef.descripcion.slice(0, 50)}
            </p>
            <div className="flex gap-3 mb-4">
              {(['Pedir', 'No Pedir'] as const).map(op => (
                <button key={op} onClick={() => setOverrideAccion(op)}
                  className={`flex-1 py-2 rounded-lg text-sm font-mono border transition-colors ${
                    overrideAccion === op
                      ? op === 'Pedir'
                        ? 'bg-green-500/20 border-green-500/50 text-green-400 font-semibold'
                        : 'bg-red-500/20 border-red-500/50 text-red-400 font-semibold'
                      : 'border-brand-border text-brand-subtle'
                  }`}>{op}</button>
              ))}
            </div>
            <textarea
              placeholder="Motivo (opcional)..."
              value={overrideMotivo}
              onChange={e => setOverrideMotivo(e.target.value)}
              rows={3}
              className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-brand-text focus:outline-none focus:border-brand-teal resize-none mb-4"
            />
            {saveError && (
              <p className="text-red-400 text-xs font-mono mb-3">{saveError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setOverrideRef(null); setSaveError('') }}
                className="flex-1 py-2 rounded-lg text-sm font-mono border border-brand-border text-brand-subtle hover:text-brand-text transition-colors">
                Cancelar
              </button>
              <button onClick={guardarOverride} disabled={guardando}
                className="flex-1 py-2 rounded-lg text-sm font-mono bg-brand-teal/20 border border-brand-teal/50 text-brand-teal hover:bg-brand-teal/30 font-semibold transition-colors disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Motor: Promedio 9M · Móvil ponderado · Frecuencia · Moda · Promedio 4M · 4 condiciones · Stock real · Cobertura
      </p>
    </div>
  )
}
