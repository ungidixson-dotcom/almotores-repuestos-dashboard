'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ── Tipos ────────────────────────────────────────────────────────────────────

export type Rol = 'admin' | 'gerente' | 'asesor' | 'viewer'

export interface UserProfile {
  id:                   string
  nombre:               string
  rol:                  Rol
  activo:               boolean
  dashboards_asignados: string[]   // solo relevante para viewer
}

export interface AuthState {
  perfil:    UserProfile | null
  cargando:  boolean
  error:     string | null
}

// ── Dashboards disponibles en el sistema ─────────────────────────────────────
// Actualiza esta lista cuando agregues nuevos dashboards

export const DASHBOARDS_DISPONIBLES: { id: string; label: string; grupo: string }[] = [
  { id: 'subastas',               label: 'Subastas',             grupo: 'Principal'    },
  { id: 'resumen_mensual',        label: 'Resumen Mensual',      grupo: 'Principal'    },
  { id: 'facturacion_general',    label: 'Facturación General',  grupo: 'Facturación'  },
  { id: 'facturacion_accesorios', label: 'Accesorios',           grupo: 'Facturación'  },
  { id: 'facturacion_taller',     label: 'Taller',               grupo: 'Facturación'  },
  { id: 'facturacion_mostrador',  label: 'Mostrador',            grupo: 'Facturación'  },
  { id: 'facturacion_mayoristas', label: 'Mayoristas',           grupo: 'Facturación'  },
  { id: 'facturacion_colision',   label: 'Colisión',             grupo: 'Facturación'  },
  { id: 'aseguradoras',           label: 'Aseguradoras',         grupo: 'Análisis'     },
  { id: 'asesores',               label: 'Asesores',             grupo: 'Análisis'     },
]

// ── Helper: qué puede ver cada rol ───────────────────────────────────────────

export function puedeVerDashboard(perfil: UserProfile | null, dashboard: string): boolean {
  if (!perfil || !perfil.activo) return false
  if (perfil.rol === 'admin')   return true
  if (perfil.rol === 'gerente') return true
  if (perfil.rol === 'asesor')  return dashboard === 'subastas'
  if (perfil.rol === 'viewer')  return perfil.dashboards_asignados.includes(dashboard)
  return false
}

export function esAdmin(perfil: UserProfile | null): boolean {
  return perfil?.rol === 'admin' && perfil?.activo === true
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function useAuth(): AuthState {
  const [perfil,   setPerfil]   = useState<UserProfile | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function cargarPerfil() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          if (mounted) { setPerfil(null); setCargando(false) }
          return
        }

        // v_mi_perfil devuelve el perfil + dashboards asignados en una sola consulta
        const { data, error: perfilError } = await supabase
          .from('v_mi_perfil')
          .select('id, nombre, rol, activo, dashboards_asignados')
          .single()

        if (perfilError || !data) {
          if (mounted) {
            setError('No se encontró tu perfil de usuario. Contacta al administrador.')
            setPerfil(null)
            setCargando(false)
          }
          return
        }

        if (mounted) {
          setPerfil({
            id:                   data.id,
            nombre:               data.nombre,
            rol:                  data.rol as Rol,
            activo:               data.activo,
            dashboards_asignados: data.dashboards_asignados ?? [],
          })
          setCargando(false)
        }
      } catch (e) {
        if (mounted) {
          setError('Error al cargar el perfil.')
          setCargando(false)
        }
      }
    }

    cargarPerfil()

    // Escuchar cambios de sesión (logout, refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (mounted) { setPerfil(null); setCargando(false) }
      }
      if (event === 'SIGNED_IN') {
        cargarPerfil()
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { perfil, cargando, error }
}
