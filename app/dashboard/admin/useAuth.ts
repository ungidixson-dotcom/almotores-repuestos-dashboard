'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth, esAdmin, DASHBOARDS_DISPONIBLES } from '@/lib/useAuth'
import {
  Users, UserPlus, Shield, Eye, Briefcase, ChevronDown,
  ChevronUp, Check, X, ToggleLeft, ToggleRight, ArrowLeft,
  AlertCircle, Loader2,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Rol = 'admin' | 'gerente' | 'asesor' | 'viewer'

interface UsuarioDashboard {
  dashboard: string
}

interface Usuario {
  id:               string
  nombre:           string
  rol:              Rol
  activo:           boolean
  creado_en:        string
  user_dashboards:  UsuarioDashboard[]
}

interface FormNuevo {
  nombre:     string
  email:      string
  password:   string
  rol:        Rol
  dashboards: string[]
}

// ── Constantes ────────────────────────────────────────────────────────────────

const ROL_LABELS: Record<Rol, string> = {
  admin:   'Administrador',
  gerente: 'Gerente',
  asesor:  'Asesor',
  viewer:  'Visor',
}

const ROL_ICONS: Record<Rol, React.ReactNode> = {
  admin:   <Shield   size={13}/>,
  gerente: <Briefcase size={13}/>,
  asesor:  <Users    size={13}/>,
  viewer:  <Eye      size={13}/>,
}

const ROL_COLORS: Record<Rol, string> = {
  admin:   'text-brand-gold   bg-brand-gold/10   border-brand-gold/30',
  gerente: 'text-brand-teal   bg-brand-teal/10   border-brand-teal/30',
  asesor:  'text-brand-subtle bg-brand-subtle/10 border-brand-subtle/30',
  viewer:  'text-brand-text   bg-brand-border    border-brand-border',
}

const GRUPOS = ['Principal', 'Facturación', 'Análisis']

const EDGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-users`

// ── Componente principal ──────────────────────────────────────────────────────

export default function AdminPage() {
  const router              = useRouter()
  const { perfil, cargando } = useAuth()
  const [usuarios,    setUsuarios]    = useState<Usuario[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [exito,       setExito]       = useState<string | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando,    setEditando]    = useState<Usuario | null>(null)
  const [procesando,  setProcesando]  = useState<string | null>(null)  // user_id en proceso

  const [form, setForm] = useState<FormNuevo>({
    nombre: '', email: '', password: '', rol: 'viewer', dashboards: [],
  })

  // ── Redirigir si no es admin ───────────────────────────────────────────────
  useEffect(() => {
    if (!cargando && !esAdmin(perfil)) {
      router.push('/dashboard')
    }
  }, [perfil, cargando, router])

  // ── Obtener token de sesión ────────────────────────────────────────────────
  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  // ── Llamar Edge Function ───────────────────────────────────────────────────
  async function callEdge(body: Record<string, unknown>) {
    const token = await getToken()
    const res = await fetch(EDGE_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Error desconocido')
    return data
  }

  // ── Cargar usuarios ────────────────────────────────────────────────────────
  const cargarUsuarios = useCallback(async () => {
    try {
      setLoadingData(true)
      const data = await callEdge({ accion: 'listar' })
      setUsuarios(data.usuarios ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar usuarios')
    } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => {
    if (esAdmin(perfil)) cargarUsuarios()
  }, [perfil, cargarUsuarios])

  // ── Crear usuario ──────────────────────────────────────────────────────────
  async function handleCrear(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setExito(null)
    setProcesando('nuevo')
    try {
      await callEdge({ accion: 'crear', ...form })
      setExito(`Usuario ${form.nombre} creado correctamente.`)
      setForm({ nombre: '', email: '', password: '', rol: 'viewer', dashboards: [] })
      setMostrarForm(false)
      await cargarUsuarios()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al crear usuario')
    } finally {
      setProcesando(null)
    }
  }

  // ── Activar / Desactivar usuario ───────────────────────────────────────────
  async function toggleActivo(u: Usuario) {
    setError(null)
    setProcesando(u.id)
    try {
      await callEdge({ accion: 'actualizar', user_id: u.id, activo: !u.activo })
      setExito(`Usuario ${u.nombre} ${!u.activo ? 'activado' : 'desactivado'}.`)
      await cargarUsuarios()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al actualizar usuario')
    } finally {
      setProcesando(null)
    }
  }

  // ── Guardar edición de dashboards ──────────────────────────────────────────
  async function handleGuardarEdicion() {
    if (!editando) return
    setError(null)
    setProcesando(editando.id)
    try {
      await callEdge({
        accion:     'actualizar',
        user_id:    editando.id,
        nombre:     editando.nombre,
        rol:        editando.rol,
        dashboards: editando.user_dashboards.map(d => d.dashboard),
      })
      setExito(`Permisos de ${editando.nombre} actualizados.`)
      setEditando(null)
      await cargarUsuarios()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al actualizar permisos')
    } finally {
      setProcesando(null)
    }
  }

  // ── Toggle dashboard en form nuevo ────────────────────────────────────────
  function toggleDashboardForm(id: string) {
    setForm(f => ({
      ...f,
      dashboards: f.dashboards.includes(id)
        ? f.dashboards.filter(d => d !== id)
        : [...f.dashboards, id],
    }))
  }

  // ── Toggle dashboard en edición ───────────────────────────────────────────
  function toggleDashboardEdicion(id: string) {
    if (!editando) return
    const existe = editando.user_dashboards.some(d => d.dashboard === id)
    setEditando({
      ...editando,
      user_dashboards: existe
        ? editando.user_dashboards.filter(d => d.dashboard !== id)
        : [...editando.user_dashboards, { dashboard: id }],
    })
  }

  if (cargando || !esAdmin(perfil)) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 size={24} className="text-brand-teal animate-spin"/>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-brand-subtle hover:text-brand-text transition-colors"
            >
              <ArrowLeft size={18}/>
            </button>
            <div>
              <h1 className="font-title text-2xl font-bold text-brand-text">
                Gestión de usuarios
              </h1>
              <p className="text-brand-subtle text-sm mt-0.5">
                {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} registrado{usuarios.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setMostrarForm(f => !f); setError(null); setExito(null) }}
            className="flex items-center gap-2 bg-brand-teal text-brand-bg font-semibold text-sm px-4 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            <UserPlus size={15}/>
            Nuevo usuario
            {mostrarForm ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          </button>
        </div>

        {/* Alertas */}
        {error && (
          <div className="flex items-center gap-2 bg-brand-red/10 border border-brand-red/30 text-brand-red rounded-xl px-4 py-3 mb-4 text-sm">
            <AlertCircle size={15}/> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X size={14}/></button>
          </div>
        )}
        {exito && (
          <div className="flex items-center gap-2 bg-brand-teal/10 border border-brand-teal/30 text-brand-teal rounded-xl px-4 py-3 mb-4 text-sm">
            <Check size={15}/> {exito}
            <button onClick={() => setExito(null)} className="ml-auto"><X size={14}/></button>
          </div>
        )}

        {/* Formulario nuevo usuario */}
        {mostrarForm && (
          <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 mb-6">
            <h2 className="font-title text-base font-semibold text-brand-text mb-4">
              Crear nuevo usuario
            </h2>
            <form onSubmit={handleCrear} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="Nombre completo">
                  <input
                    required
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej: Carlos García"
                    className={inputCls}
                  />
                </Campo>
                <Campo label="Correo electrónico">
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="correo@almotores.com.co"
                    className={inputCls}
                  />
                </Campo>
                <Campo label="Contraseña (mínimo 8 caracteres)">
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                    className={inputCls}
                  />
                </Campo>
                <Campo label="Rol">
                  <select
                    value={form.rol}
                    onChange={e => setForm(f => ({ ...f, rol: e.target.value as Rol, dashboards: [] }))}
                    className={inputCls}
                  >
                    {(Object.keys(ROL_LABELS) as Rol[]).map(r => (
                      <option key={r} value={r}>{ROL_LABELS[r]}</option>
                    ))}
                  </select>
                </Campo>
              </div>

              {/* Dashboards — solo para viewer */}
              {form.rol === 'viewer' && (
                <div>
                  <p className="font-mono text-xs text-brand-subtle uppercase tracking-wider mb-3">
                    Dashboards que puede ver
                  </p>
                  <SelectorDashboards
                    seleccionados={form.dashboards}
                    onToggle={toggleDashboardForm}
                  />
                </div>
              )}

              {/* Info para otros roles */}
              {form.rol !== 'viewer' && (
                <div className="bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm text-brand-subtle">
                  {form.rol === 'admin'   && '⚡ Acceso total a todos los dashboards y gestión de usuarios.'}
                  {form.rol === 'gerente' && '📊 Acceso de lectura a todos los dashboards.'}
                  {form.rol === 'asesor'  && '📋 Acceso solo al dashboard de Subastas con sus propios datos.'}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={procesando === 'nuevo'}
                  className="flex items-center gap-2 bg-brand-teal text-brand-bg font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {procesando === 'nuevo'
                    ? <><Loader2 size={14} className="animate-spin"/> Creando...</>
                    : <><UserPlus size={14}/> Crear usuario</>
                  }
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarForm(false)}
                  className="text-sm text-brand-subtle hover:text-brand-text transition-colors px-4 py-2.5"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de usuarios */}
        {loadingData ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-brand-teal animate-spin"/>
          </div>
        ) : (
          <div className="space-y-3">
            {usuarios.map(u => (
              <div
                key={u.id}
                className={`bg-brand-surface border rounded-2xl p-5 transition-opacity ${
                  !u.activo ? 'opacity-50 border-brand-border' : 'border-brand-border'
                }`}
              >
                {/* Fila principal */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-brand-teal/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-brand-teal font-bold text-sm">
                        {u.nombre.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-brand-text truncate">{u.nombre}</p>
                      <p className="text-brand-muted text-xs font-mono">
                        {new Date(u.creado_en).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Badge rol */}
                    <span className={`flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border ${ROL_COLORS[u.rol]}`}>
                      {ROL_ICONS[u.rol]} {ROL_LABELS[u.rol]}
                    </span>

                    {/* Toggle activo */}
                    <button
                      onClick={() => toggleActivo(u)}
                      disabled={procesando === u.id || u.id === perfil?.id}
                      title={u.id === perfil?.id ? 'No puedes desactivarte a ti mismo' : u.activo ? 'Desactivar' : 'Activar'}
                      className="text-brand-subtle hover:text-brand-text transition-colors disabled:opacity-30"
                    >
                      {procesando === u.id
                        ? <Loader2 size={18} className="animate-spin"/>
                        : u.activo
                          ? <ToggleRight size={22} className="text-brand-teal"/>
                          : <ToggleLeft  size={22}/>
                      }
                    </button>

                    {/* Editar permisos */}
                    <button
                      onClick={() => setEditando(editando?.id === u.id ? null : u)}
                      className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
                        editando?.id === u.id
                          ? 'border-brand-teal text-brand-teal bg-brand-teal/10'
                          : 'border-brand-border text-brand-subtle hover:text-brand-text'
                      }`}
                    >
                      {editando?.id === u.id ? 'Cerrar' : 'Editar'}
                    </button>
                  </div>
                </div>

                {/* Dashboards asignados (solo viewer) */}
                {u.rol === 'viewer' && u.user_dashboards.length > 0 && editando?.id !== u.id && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {u.user_dashboards.map(d => {
                      const info = DASHBOARDS_DISPONIBLES.find(x => x.id === d.dashboard)
                      return (
                        <span key={d.dashboard} className="text-xs font-mono px-2 py-0.5 bg-brand-bg border border-brand-border rounded-md text-brand-subtle">
                          {info?.label ?? d.dashboard}
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Panel de edición inline */}
                {editando?.id === u.id && (
                  <div className="mt-4 pt-4 border-t border-brand-border">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <Campo label="Nombre">
                        <input
                          value={editando.nombre}
                          onChange={e => setEditando({ ...editando, nombre: e.target.value })}
                          className={inputCls}
                        />
                      </Campo>
                      <Campo label="Rol">
                        <select
                          value={editando.rol}
                          onChange={e => setEditando({ ...editando, rol: e.target.value as Rol, user_dashboards: [] })}
                          className={inputCls}
                        >
                          {(Object.keys(ROL_LABELS) as Rol[]).map(r => (
                            <option key={r} value={r}>{ROL_LABELS[r]}</option>
                          ))}
                        </select>
                      </Campo>
                    </div>

                    {editando.rol === 'viewer' && (
                      <div className="mb-4">
                        <p className="font-mono text-xs text-brand-subtle uppercase tracking-wider mb-3">
                          Dashboards asignados
                        </p>
                        <SelectorDashboards
                          seleccionados={editando.user_dashboards.map(d => d.dashboard)}
                          onToggle={toggleDashboardEdicion}
                        />
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={handleGuardarEdicion}
                        disabled={procesando === editando.id}
                        className="flex items-center gap-2 bg-brand-teal text-brand-bg font-semibold text-sm px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {procesando === editando.id
                          ? <><Loader2 size={13} className="animate-spin"/> Guardando...</>
                          : <><Check size={13}/> Guardar cambios</>
                        }
                      </button>
                      <button
                        onClick={() => setEditando(null)}
                        className="text-sm text-brand-subtle hover:text-brand-text transition-colors px-3 py-2"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

const inputCls = 'w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 text-brand-text text-sm outline-none focus:border-brand-teal transition-colors'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-mono text-xs text-brand-subtle uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function SelectorDashboards({
  seleccionados,
  onToggle,
}: {
  seleccionados: string[]
  onToggle:      (id: string) => void
}) {
  return (
    <div className="space-y-3">
      {GRUPOS.map(grupo => {
        const items = DASHBOARDS_DISPONIBLES.filter(d => d.grupo === grupo)
        return (
          <div key={grupo}>
            <p className="text-xs text-brand-muted font-mono mb-1.5">{grupo}</p>
            <div className="flex flex-wrap gap-2">
              {items.map(d => {
                const activo = seleccionados.includes(d.id)
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onToggle(d.id)}
                    className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
                      activo
                        ? 'bg-brand-teal/10 border-brand-teal/40 text-brand-teal'
                        : 'bg-brand-bg border-brand-border text-brand-subtle hover:text-brand-text'
                    }`}
                  >
                    {activo && <Check size={11}/>}
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
