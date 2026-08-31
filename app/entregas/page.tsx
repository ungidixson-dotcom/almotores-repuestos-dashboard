'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  LogOut, RefreshCw, Package, Truck, CheckCircle2,
  AlertTriangle, Clock, Filter, ChevronDown, X,
  MapPin, Calendar, Hash, User, Building2, Search,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type EntregaItem = {
  item_id: number
  orden_id: number
  descripcion: string
  referencia: string
  cantidad: number
  calidad: string
  valor_total_con_dcto: number | null
  fecha_limite_entrega: string
  estado_item: string
  item_observaciones: string | null
  dias_habiles_restantes: number
  semaforo: 'verde' | 'amarillo' | 'rojo' | 'completado'
  numero_orden: string
  plataforma_aseguradora: string
  numero_siniestro: string | null
  fecha_registro_oc: string
  placa: string
  marca: string
  linea: string | null
  modelo_anio: number | null
  taller_nombre: string
  taller_ciudad: string
  estado_orden: string
  pdf_fuente: string | null
  aseguradora: string | null
  asesor: string | null
  ultimo_hito: string | null
  fecha_ultimo_hito: string | null
  numero_guia: string | null
  item_creado_en: string
  item_actualizado_en: string
}

// ── Constantes ────────────────────────────────────────────────────────────────

const ESTADO_LABELS: Record<string, string> = {
  pendiente_reserva:  'Pendiente reserva',
  reservado:          'Reservado',
  pedido_importadora: 'Pedido a importadora',
  pedido_confirmado:  'Pedido confirmado',
  en_almacen:         'En almacén',
  despachado:         'Despachado',
  entregado_taller:   'Entregado en taller',
  descarga_asesor:    'Descarga asesor',
  descarga_taller:    'Descarga taller',
  completado:         'Completado',
  cancelado:          'Cancelado',
}

const ESTADO_PIPELINE_ORDEN = [
  'pendiente_reserva','reservado','pedido_importadora','pedido_confirmado',
  'en_almacen','despachado','entregado_taller','descarga_asesor','descarga_taller','completado',
]

const SEMAFORO_CONFIG = {
  verde:      { bg: 'bg-emerald-500/15', text: 'text-emerald-400',  border: 'border-emerald-500/30', dot: 'bg-emerald-400', label: 'En tiempo'  },
  amarillo:   { bg: 'bg-yellow-500/15',  text: 'text-yellow-400',   border: 'border-yellow-500/30',  dot: 'bg-yellow-400',  label: 'En riesgo'  },
  rojo:       { bg: 'bg-red-500/15',     text: 'text-red-400',      border: 'border-red-500/30',     dot: 'bg-red-500',     label: 'Vencido'    },
  completado: { bg: 'bg-brand-surface',  text: 'text-brand-muted',  border: 'border-brand-border',   dot: 'bg-brand-muted', label: 'Completado' },
}

const fmtFecha = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

// ── Sub-componentes ───────────────────────────────────────────────────────────

function SemaforoBadge({ semaforo, dias }: { semaforo: EntregaItem['semaforo']; dias: number }) {
  const cfg = SEMAFORO_CONFIG[semaforo]
  const diasLabel =
    semaforo === 'completado' ? 'Completado' :
    dias > 0  ? `${dias} día${dias !== 1 ? 's' : ''}` :
    dias === 0 ? 'Vence hoy' :
    `${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''} vencido`

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot} ${semaforo === 'rojo' ? 'animate-pulse' : ''}`} />
      {diasLabel}
    </span>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const idx = ESTADO_PIPELINE_ORDEN.indexOf(estado)
  const pct = idx >= 0 ? Math.round((idx / (ESTADO_PIPELINE_ORDEN.length - 1)) * 100) : 0
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-brand-subtle">{ESTADO_LABELS[estado] ?? estado}</span>
      <div className="h-1 w-full bg-brand-border rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-brand-teal transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ItemCard({ item }: { item: EntregaItem }) {
  const cfg = SEMAFORO_CONFIG[item.semaforo]
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${cfg.border} bg-brand-surface`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-brand-text font-medium text-sm leading-tight">{item.descripcion}</p>
          <p className="text-brand-muted text-xs font-mono mt-0.5">{item.referencia}</p>
        </div>
        <SemaforoBadge semaforo={item.semaforo} dias={item.dias_habiles_restantes} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-brand-subtle"><Hash size={11} className="shrink-0" /><span className="font-mono truncate">{item.placa}</span></div>
        <div className="flex items-center gap-1.5 text-brand-subtle"><Building2 size={11} className="shrink-0" /><span className="truncate">{item.aseguradora ?? '—'}</span></div>
        <div className="flex items-center gap-1.5 text-brand-subtle"><MapPin size={11} className="shrink-0" /><span className="truncate">{item.taller_ciudad}</span></div>
        <div className="flex items-center gap-1.5 text-brand-subtle"><Calendar size={11} className="shrink-0" /><span className="font-mono">{fmtFecha(item.fecha_limite_entrega)}</span></div>
        <div className="flex items-center gap-1.5 text-brand-subtle"><User size={11} className="shrink-0" /><span className="truncate">{item.asesor ?? '—'}</span></div>
        {item.numero_guia && (
          <div className="flex items-center gap-1.5 text-brand-teal"><Truck size={11} className="shrink-0" /><span className="font-mono truncate">{item.numero_guia}</span></div>
        )}
      </div>
      <EstadoBadge estado={item.estado_item} />
      <p className="text-xs text-brand-muted truncate">{item.taller_nombre}</p>
    </div>
  )
}

function ItemRow({ item }: { item: EntregaItem }) {
  return (
    <tr className="border-b border-brand-border hover:bg-white/[0.02] transition-colors">
      <td className="px-3 py-3 w-4">
        <span className={`block w-2.5 h-2.5 rounded-full ${SEMAFORO_CONFIG[item.semaforo].dot} ${item.semaforo === 'rojo' ? 'animate-pulse' : ''}`} />
      </td>
      <td className="px-3 py-3 font-mono text-sm text-brand-text font-semibold whitespace-nowrap">{item.placa}</td>
      <td className="px-3 py-3 max-w-[220px]">
        <p className="text-sm text-brand-text truncate" title={item.descripcion}>{item.descripcion}</p>
        <p className="text-xs text-brand-muted font-mono">{item.referencia}</p>
      </td>
      <td className="px-3 py-3 text-sm text-brand-subtle whitespace-nowrap hidden lg:table-cell">{item.aseguradora ?? '—'}</td>
      <td className="px-3 py-3 text-sm text-brand-subtle whitespace-nowrap hidden xl:table-cell">{item.asesor ?? '—'}</td>
      <td className="px-3 py-3 hidden xl:table-cell">
        <p className="text-sm text-brand-subtle truncate max-w-[160px]" title={item.taller_nombre}>{item.taller_nombre}</p>
        <p className="text-xs text-brand-muted">{item.taller_ciudad}</p>
      </td>
      <td className="px-3 py-3 text-sm font-mono text-brand-subtle whitespace-nowrap hidden md:table-cell">{fmtFecha(item.fecha_limite_entrega)}</td>
      <td className="px-3 py-3"><SemaforoBadge semaforo={item.semaforo} dias={item.dias_habiles_restantes} /></td>
      <td className="px-3 py-3 min-w-[160px] hidden md:table-cell"><EstadoBadge estado={item.estado_item} /></td>
      <td className="px-3 py-3 text-sm font-mono text-brand-teal whitespace-nowrap hidden lg:table-cell">
        {item.numero_guia ?? <span className="text-brand-border">—</span>}
      </td>
      <td className="px-3 py-3 text-xs font-mono text-brand-muted whitespace-nowrap hidden lg:table-cell">{item.numero_orden}</td>
    </tr>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function EntregasPage() {
  const router = useRouter()
  const [items,   setItems]   = useState<EntregaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null)

  const [busqueda,          setBusqueda]          = useState('')
  const [filtroSemaforo,    setFiltroSemaforo]    = useState('todos')
  const [filtroAsesor,      setFiltroAsesor]      = useState('todos')
  const [filtroAseguradora, setFiltroAseguradora] = useState('todas')
  const [filtroEstado,      setFiltroEstado]      = useState('activos')
  const [filtroMarca,       setFiltroMarca]       = useState('todas')
  const [showFiltros,       setShowFiltros]       = useState(false)

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setError(null)
    const { data, error: err } = await supabase
      .from('v_entregas_panel')
      .select(
        'item_id,orden_id,descripcion,referencia,cantidad,calidad,' +
        'valor_total_con_dcto,fecha_limite_entrega,estado_item,item_observaciones,' +
        'dias_habiles_restantes,semaforo,numero_orden,plataforma_aseguradora,' +
        'numero_siniestro,fecha_registro_oc,placa,marca,linea,modelo_anio,' +
        'taller_nombre,taller_ciudad,estado_orden,pdf_fuente,' +
        'aseguradora,asesor,ultimo_hito,fecha_ultimo_hito,numero_guia,' +
        'item_creado_en,item_actualizado_en'
      )
      .order('fecha_limite_entrega', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setItems((data as unknown as EntregaItem[]) ?? [])
    setUltimaActualizacion(new Date())
    setLoading(false)
  }, [router])

  useEffect(() => { fetchData() }, [fetchData])

  const asesoresOpciones    = useMemo(() => Array.from(new Set(items.map(i => i.asesor).filter(Boolean) as string[])).sort(), [items])
  const aseguradorasOpciones = useMemo(() => Array.from(new Set(items.map(i => i.aseguradora).filter(Boolean) as string[])).sort(), [items])
  const marcasOpciones      = useMemo(() => Array.from(new Set(items.map(i => i.marca).filter(Boolean))).sort(), [items])

  const itemsFiltrados = useMemo(() => items.filter(item => {
    if (filtroEstado === 'activos'    && item.estado_orden !== 'activa')       return false
    if (filtroEstado === 'completados' && item.estado_item !== 'completado')    return false
    if (filtroEstado === 'cancelados'  && item.estado_item !== 'cancelado')     return false
    if (filtroSemaforo    !== 'todos'  && item.semaforo     !== filtroSemaforo) return false
    if (filtroAsesor      !== 'todos'  && item.asesor       !== filtroAsesor)   return false
    if (filtroAseguradora !== 'todas'  && item.aseguradora  !== filtroAseguradora) return false
    if (filtroMarca       !== 'todas'  && item.marca        !== filtroMarca)    return false
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim()
      if (![item.placa, item.descripcion, item.referencia, item.numero_orden, item.taller_nombre, item.numero_guia ?? '']
        .some(v => v.toLowerCase().includes(q))) return false
    }
    return true
  }), [items, filtroEstado, filtroSemaforo, filtroAsesor, filtroAseguradora, filtroMarca, busqueda])

  const kpis = useMemo(() => {
    const activos    = items.filter(i => i.estado_orden === 'activa' && i.estado_item !== 'cancelado')
    return {
      total:      activos.length,
      verde:      activos.filter(i => i.semaforo === 'verde').length,
      amarillo:   activos.filter(i => i.semaforo === 'amarillo').length,
      rojo:       activos.filter(i => i.semaforo === 'rojo').length,
      despachados: activos.filter(i => ['despachado','entregado_taller','descarga_asesor','descarga_taller'].includes(i.estado_item)).length,
      completado: items.filter(i => i.estado_item === 'completado').length,
    }
  }, [items])

  const hayFiltros = filtroSemaforo !== 'todos' || filtroAsesor !== 'todos' || filtroAseguradora !== 'todas' || filtroMarca !== 'todas' || filtroEstado !== 'activos' || busqueda.trim() !== ''

  function limpiar() {
    setBusqueda(''); setFiltroSemaforo('todos'); setFiltroAsesor('todos')
    setFiltroAseguradora('todas'); setFiltroMarca('todas'); setFiltroEstado('activos')
  }

  async function handleLogout() { await supabase.auth.signOut(); router.push('/login') }

  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
        <p className="text-brand-muted text-sm font-mono">Cargando entregas…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md text-center">
        <AlertTriangle className="text-red-400 mx-auto mb-3" size={32} />
        <p className="text-red-400 font-mono text-sm">{error}</p>
        <button onClick={fetchData} className="mt-4 text-xs text-brand-subtle underline">Reintentar</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-brand-bg/95 backdrop-blur border-b border-brand-border">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-title text-base sm:text-lg font-bold text-brand-text leading-tight">Torre de Control · Entregas</h1>
            <p className="text-brand-muted text-xs font-mono hidden sm:block">Canal Subastas — Seguimiento de repuestos</p>
          </div>
          <div className="flex items-center gap-3">
            {ultimaActualizacion && (
              <span className="text-brand-muted font-mono text-xs hidden md:block">
                {ultimaActualizacion.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={fetchData} className="flex items-center gap-1.5 text-xs font-mono text-brand-subtle hover:text-brand-teal transition-colors border border-brand-border rounded-lg px-2.5 py-1.5">
              <RefreshCw size={12} /> Actualizar
            </button>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs font-mono text-brand-subtle hover:text-brand-text transition-colors">
              <LogOut size={13} /> Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Activos',     value: kpis.total,       icon: Package,       color: 'text-brand-subtle' },
            { label: 'En tiempo',   value: kpis.verde,       icon: CheckCircle2,  color: 'text-emerald-400'  },
            { label: 'En riesgo',   value: kpis.amarillo,    icon: Clock,         color: 'text-yellow-400'   },
            { label: 'Vencidos',    value: kpis.rojo,        icon: AlertTriangle, color: 'text-red-400'      },
            { label: 'Despachados', value: kpis.despachados, icon: Truck,         color: 'text-brand-teal'   },
            { label: 'Completados', value: kpis.completado,  icon: CheckCircle2,  color: 'text-brand-gold'   },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-brand-surface border border-brand-border rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-brand-muted text-xs">{label}</span>
                <Icon size={14} className={color} />
              </div>
              <p className={`font-title text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
              <input
                type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Placa, repuesto, referencia, guía…"
                className="w-full bg-brand-surface border border-brand-border rounded-lg pl-9 pr-3 py-2 text-sm text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-teal transition-colors font-mono"
              />
              {busqueda && <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text"><X size={13} /></button>}
            </div>
            <button
              onClick={() => setShowFiltros(f => !f)}
              className={`flex items-center gap-2 text-xs font-mono px-3 py-2 rounded-lg border transition-colors ${showFiltros || hayFiltros ? 'bg-brand-teal/10 border-brand-teal/40 text-brand-teal' : 'bg-brand-surface border-brand-border text-brand-subtle hover:text-brand-text'}`}
            >
              <Filter size={13} /> Filtros
              <ChevronDown size={12} className={`transition-transform ${showFiltros ? 'rotate-180' : ''}`} />
            </button>
            {hayFiltros && <button onClick={limpiar} className="text-xs text-brand-muted hover:text-red-400 transition-colors flex items-center gap-1"><X size={12} /> Limpiar</button>}
            <span className="ml-auto text-xs text-brand-muted font-mono hidden sm:block">{itemsFiltrados.length} ítem{itemsFiltrados.length !== 1 ? 's' : ''}</span>
          </div>

          {showFiltros && (
            <div className="bg-brand-surface border border-brand-border rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: 'Estado', value: filtroEstado, set: setFiltroEstado, opts: [['activos','Activos'],['completados','Completados'],['cancelados','Cancelados'],['todos','Todos']] },
                { label: 'Semáforo', value: filtroSemaforo, set: setFiltroSemaforo, opts: [['todos','Todos'],['rojo','🔴 Vencidos'],['amarillo','🟡 En riesgo'],['verde','🟢 En tiempo'],['completado','✅ Completados']] },
              ].map(({ label, value, set, opts }) => (
                <div key={label} className="flex flex-col gap-1">
                  <label className="text-xs text-brand-muted">{label}</label>
                  <select value={value} onChange={e => set(e.target.value)} className="bg-brand-bg border border-brand-border rounded-lg px-2 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-teal">
                    {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-brand-muted">Asesor</label>
                <select value={filtroAsesor} onChange={e => setFiltroAsesor(e.target.value)} className="bg-brand-bg border border-brand-border rounded-lg px-2 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-teal">
                  <option value="todos">Todos</option>
                  {asesoresOpciones.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-brand-muted">Aseguradora</label>
                <select value={filtroAseguradora} onChange={e => setFiltroAseguradora(e.target.value)} className="bg-brand-bg border border-brand-border rounded-lg px-2 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-teal">
                  <option value="todas">Todas</option>
                  {aseguradorasOpciones.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-brand-muted">Marca</label>
                <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)} className="bg-brand-bg border border-brand-border rounded-lg px-2 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-teal">
                  <option value="todas">Todas</option>
                  {marcasOpciones.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Tabla / Tarjetas */}
        {itemsFiltrados.length === 0 ? (
          <div className="bg-brand-surface border border-brand-border rounded-xl p-12 text-center">
            <Package size={32} className="text-brand-border mx-auto mb-3" />
            <p className="text-brand-muted text-sm">
              {hayFiltros ? 'Sin resultados para los filtros aplicados.' : 'No hay ítems de entrega registrados aún.'}
            </p>
            {hayFiltros && <button onClick={limpiar} className="mt-3 text-xs text-brand-teal underline">Limpiar filtros</button>}
          </div>
        ) : (
          <>
            <div className="hidden md:block bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-brand-border">
                      {['','Placa','Repuesto','Aseguradora','Asesor','Taller','Fecha límite','SLA','Estado','Guía','OC'].map((h, i) => (
                        <th key={i} className={`px-3 py-3 text-xs text-brand-muted font-mono ${[3,4,5,9,10].includes(i) ? 'hidden lg:table-cell' : ''} ${[4,5].includes(i) ? 'hidden xl:table-cell' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itemsFiltrados.map(item => <ItemRow key={item.item_id} item={item} />)}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="md:hidden flex flex-col gap-3">
              {itemsFiltrados.map(item => <ItemCard key={item.item_id} item={item} />)}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

