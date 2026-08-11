'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Receipt, FolderOpen, ChevronDown, ChevronRight,
  LayoutGrid, Package, RefreshCw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// Mapeo ruta → dashboard key en user_dashboards
const ROUTE_DASHBOARD: Record<string, string> = {
  '/dashboard':                                                          'subastas',
  '/dashboard/resumen-mensual':                                          'resumen_mensual',
  '/dashboard/aseguradoras':                                             'aseguradoras',
  '/dashboard/asesores':                                                 'asesores',
  '/dashboard/facturacion/general':                                      'facturacion_general',
  '/dashboard/facturacion/canales/accesorios':                           'facturacion_accesorios',
  '/dashboard/facturacion/canales/accesorios/comisiones':                'facturacion_accesorios',
  '/dashboard/facturacion/canales/accesorios/ventas-asesor':             'facturacion_accesorios',
  '/dashboard/facturacion/canales/accesorios/ticket-promedio':           'facturacion_accesorios',
  '/dashboard/facturacion/canales/taller':                               'facturacion_taller',
  '/dashboard/facturacion/canales/mostrador':                            'facturacion_mostrador',
  '/dashboard/facturacion/canales/mayoristas':                           'facturacion_mayoristas',
  '/dashboard/facturacion/canales/subastas':                             'subastas',
  '/dashboard/facturacion/canales/colision':                             'facturacion_colision',
  '/dashboard/inventario':                                          'inventario',
}


// ── Tipos (3 niveles) ─────────────────────────────────────────────────────────
interface NavLeaf  { type: 'leaf';  label: string; href: string }
interface NavSubGroup { type: 'subgroup'; label: string; children: NavLeaf[] }
interface NavGroup {
  type: 'group'
  label: string
  href?: string
  children: Array<NavLeaf | NavSubGroup>
}
interface NavSection {
  label: string
  icon: React.ReactNode
  href?: string
  children?: Array<NavLeaf | NavGroup>
}

// ── Estructura de navegación ──────────────────────────────────────────────────
const NAV: NavSection[] = [
  {
    label: 'Facturación', icon: <Receipt size={16} />,
    children: [
      { type: 'leaf', label: 'Facturación General', href: '/dashboard/facturacion/general' },
      {
        type: 'group', label: 'Accesorios',
        children: [
          { type: 'leaf', label: 'Facturación',       href: '/dashboard/facturacion/canales/accesorios' },
          { type: 'leaf', label: 'Comisiones',         href: '/dashboard/facturacion/canales/accesorios/comisiones' },
          { type: 'leaf', label: 'Ventas por asesor',  href: '/dashboard/facturacion/canales/accesorios/ventas-asesor' },
          { type: 'leaf', label: 'Ticket promedio',    href: '/dashboard/facturacion/canales/accesorios/ticket-promedio' },
        ],
      },
      { type: 'leaf', label: 'Taller',     href: '/dashboard/facturacion/canales/taller' },
      { type: 'leaf', label: 'Mostrador',  href: '/dashboard/facturacion/canales/mostrador' },
      { type: 'leaf', label: 'Mayoristas', href: '/dashboard/facturacion/canales/mayoristas' },
      {
        type: 'group', label: 'Subastas',
        children: [
          { type: 'leaf', label: 'Facturación', href: '/dashboard/facturacion/canales/subastas' },
          {
            type: 'subgroup', label: 'Torre de Control',
            children: [
              { type: 'leaf', label: 'Subastas',        href: '/dashboard' },
              { type: 'leaf', label: 'Resumen Mensual',  href: '/dashboard/resumen-mensual' },
              { type: 'leaf', label: 'Aseguradoras',     href: '/dashboard/aseguradoras' },
              { type: 'leaf', label: 'Asesores',         href: '/dashboard/asesores' },
            ],
          },
        ],
      },
      { type: 'leaf', label: 'Colisión', href: '/dashboard/facturacion/canales/colision' },
    ],
  },
  {
    label: 'Inventario', icon: <Package size={16} />,
    children: [
      { type: 'leaf', label: 'Pedido Sugerido', href: '/dashboard/inventario' },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function hasActivePath(items: Array<NavLeaf | NavGroup | NavSubGroup>, pathname: string): boolean {
  return items.some(item => {
    if (item.type === 'leaf')     return pathname === item.href
    if (item.type === 'group')    return hasActivePath(item.children, pathname)
    if (item.type === 'subgroup') return item.children.some(c => pathname === c.href)
    return false
  })
}

// ── Layout ────────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [openSections,  setOpenSections]  = useState<Record<string, boolean>>({
    Facturación: true, Inventario: true,
  })
  const [openGroups,    setOpenGroups]    = useState<Record<string, boolean>>({
    Accesorios: true, Subastas: true,
  })
  const [openSubGroups, setOpenSubGroups] = useState<Record<string, boolean>>({
    'Torre de Control': true,
  })

  const [syncing,    setSyncing]    = useState(false)
  const [syncMsg,    setSyncMsg]    = useState('')
  const [dashboards,    setDashboards]    = useState<string[]>([])
  const [esAdmin,      setEsAdmin]      = useState(false)
  const [permisosListos, setPermisosListos] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const cargarPermisos = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: perfil } = await supabase
        .from('user_profiles')
        .select('rol')
        .eq('id', user.id)
        .single()

      if (perfil?.rol === 'admin') {
        setEsAdmin(true)
        setPermisosListos(true)
        return
      }

      const { data: dashes } = await supabase
        .from('user_dashboards')
        .select('dashboard')
        .eq('user_id', user.id)

      setDashboards((dashes ?? []).map((d: any) => d.dashboard))
      setPermisosListos(true)
    }
    cargarPermisos()
  }, [router])

  const tieneAcceso = (ruta: string): boolean => {
    if (!permisosListos) return false  // ocultar todo mientras carga
    if (esAdmin) return true
    const key = ROUTE_DASHBOARD[ruta]
    if (!key) return true  // rutas no mapeadas son accesibles
    return dashboards.includes(key)
  }

  const sincronizarDropbox = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/sync-dropbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      if (data.ok) setSyncMsg('✅ Sync iniciado')
      else setSyncMsg('❌ Error')
    } catch { setSyncMsg('❌ Error') }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 4000)
  }

  const toggle = (map: Record<string, boolean>, set: (v: Record<string, boolean>) => void, key: string) =>
    set({ ...map, [key]: !map[key] })

  const isActive = (href: string) => pathname === href

  return (
    <div className="flex h-screen overflow-hidden bg-brand-bg text-brand-text font-sans">

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 bg-brand-surface border-r border-brand-border flex flex-col h-screen">

        {/* Logo */}
        <div className="p-5 border-b border-brand-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-teal/15 border border-brand-teal/30 flex items-center justify-center">
              <LayoutGrid size={16} className="text-brand-teal" />
            </div>
            <div>
              <p className="font-title font-bold text-sm text-brand-text leading-tight">AlmotoresKIA</p>
              <p className="text-[10px] text-brand-muted font-mono tracking-wider">WORKSPACE</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <p className="font-mono text-[10px] text-brand-muted uppercase tracking-wider px-2 mb-2">Informes</p>
          <ul className="space-y-1">
            {NAV.map(section => {
              const secActive = section.children
                ? hasActivePath(section.children as any, pathname)
                : pathname === section.href

              return (
                <li key={section.label}>
                  {section.children ? (
                    <>
                      {/* Nivel 1 — sección */}
                      <button
                        onClick={() => toggle(openSections, setOpenSections, section.label)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                          ${secActive ? 'text-brand-teal' : 'text-brand-subtle hover:text-brand-text hover:bg-brand-bg'}`}
                      >
                        <span className="flex items-center gap-2">{section.icon}{section.label}</span>
                        {openSections[section.label] ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                      </button>

                      {openSections[section.label] && (
                        <ul className="mt-1 ml-4 pl-3 border-l border-brand-border space-y-0.5">
                          {section.children.map(child => {

                            // Nivel 2 — leaf
                            if (child.type === 'leaf') {
                              if (!tieneAcceso(child.href)) return null
                              return (
                              <li key={child.href}>
                                <Link href={child.href}
                                  className={`block px-3 py-1.5 rounded-lg text-xs font-mono transition-colors
                                    ${isActive(child.href)
                                      ? 'bg-brand-teal/10 text-brand-teal border border-brand-teal/30'
                                      : 'text-brand-subtle hover:text-brand-text hover:bg-brand-bg'}`}>
                                  {child.label}
                                </Link>
                              </li>
                              )
                            }

                            // Nivel 2 — group
                            const grpActive = hasActivePath(child.children as any, pathname)
                            return (
                              <li key={child.label}>
                                <button
                                  onClick={() => toggle(openGroups, setOpenGroups, child.label)}
                                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono transition-colors
                                    ${grpActive ? 'text-brand-teal' : 'text-brand-subtle hover:text-brand-text hover:bg-brand-bg'}`}
                                >
                                  <span>{child.label}</span>
                                  {openGroups[child.label] ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                                </button>

                                {openGroups[child.label] && (
                                  <ul className="mt-0.5 ml-3 pl-3 border-l border-brand-border/50 space-y-0.5">
                                    {child.children.map(item => {

                                      // Nivel 3 — leaf dentro de group
                                      if (item.type === 'leaf') {
                                        if (!tieneAcceso(item.href)) return null
                                        return (
                                        <li key={item.href}>
                                          <Link href={item.href}
                                            className={`block px-3 py-1.5 rounded-lg text-xs font-mono transition-colors
                                              ${isActive(item.href)
                                                ? 'bg-brand-teal/10 text-brand-teal border border-brand-teal/30'
                                                : 'text-brand-muted hover:text-brand-text hover:bg-brand-bg'}`}>
                                            {item.label}
                                          </Link>
                                        </li>
                                        )
                                      }

                                      // Nivel 3 — subgroup (Torre de Control)
                                      const subActive = item.children.some(c => pathname === c.href)
                                      return (
                                        <li key={item.label}>
                                          <button
                                            onClick={() => toggle(openSubGroups, setOpenSubGroups, item.label)}
                                            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono transition-colors
                                              ${subActive ? 'text-brand-teal' : 'text-brand-muted hover:text-brand-text hover:bg-brand-bg'}`}
                                          >
                                            <span>{item.label}</span>
                                            {openSubGroups[item.label] ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
                                          </button>

                                          {openSubGroups[item.label] && (
                                            <ul className="mt-0.5 ml-3 pl-3 border-l border-brand-border/30 space-y-0.5">
                                              {item.children.filter(leaf => tieneAcceso(leaf.href)).map(leaf => (
                                                <li key={leaf.href}>
                                                  <Link href={leaf.href}
                                                    className={`block px-3 py-1.5 rounded-lg text-[11px] font-mono transition-colors
                                                      ${isActive(leaf.href)
                                                        ? 'bg-brand-teal/10 text-brand-teal border border-brand-teal/30'
                                                        : 'text-brand-muted hover:text-brand-text hover:bg-brand-bg'}`}>
                                                    {leaf.label}
                                                  </Link>
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                        </li>
                                      )
                                    })}
                                  </ul>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </>
                  ) : (
                    <Link href={section.href!}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                        ${isActive(section.href!)
                          ? 'bg-brand-teal/10 text-brand-teal border border-brand-teal/30'
                          : 'text-brand-subtle hover:text-brand-text hover:bg-brand-bg'}`}
                    >
                      {section.icon}{section.label}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-brand-border shrink-0 space-y-2">
          <button onClick={sincronizarDropbox} disabled={syncing}
            className={`w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-mono transition-colors border ${
              syncing
                ? 'border-brand-border text-brand-muted cursor-not-allowed'
                : 'border-brand-teal/40 text-brand-teal hover:bg-brand-teal/10'
            }`}>
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''}/>
            {syncing ? 'Sincronizando...' : 'Sincronizar Dropbox'}
          </button>
          {syncMsg && (
            <p className="text-center text-[10px] font-mono text-brand-subtle">{syncMsg}</p>
          )}
          <div className="flex items-center gap-2">
            <FolderOpen size={13} className="text-brand-muted" />
            <p className="text-[10px] text-brand-muted font-mono">Repuestos & Accesorios</p>
          </div>
        </div>

      </aside>

      {/* ── CONTENIDO ───────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>

    </div>
  )
}