'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Receipt, Package, RefreshCw, Menu, X } from 'lucide-react'
import { ExpandChevron } from '@/components/ui/ExpandChevron'
import { CanalIcon, CANAL_COLOR, esCanal } from '@/components/ui/CanalIcon'
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
  '/informe-accesorios':                                                 'facturacion_accesorios',
  '/dashboard/facturacion/canales/taller':                               'facturacion_taller',
  '/dashboard/facturacion/canales/mostrador':                            'facturacion_mostrador',
  '/dashboard/facturacion/canales/mayoristas':                           'facturacion_mayoristas',
  '/dashboard/facturacion/canales/subastas':                             'subastas',
  '/dashboard/facturacion/canales/colision':                             'facturacion_colision',
  '/dashboard/inventario':                                               'inventario',
}

// ── Tipos (3 niveles) ─────────────────────────────────────────────────────────
interface NavLeaf     { type: 'leaf';     label: string; href: string }
interface NavSubGroup { type: 'subgroup'; label: string; children: NavLeaf[] }
interface NavGroup    { type: 'group';    label: string; href?: string; children: Array<NavLeaf | NavSubGroup> }
interface NavSection  { label: string; icon: React.ReactNode; href?: string; children?: Array<NavLeaf | NavGroup> }

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
          { type: 'leaf', label: 'Informe mensual',    href: `/informe-accesorios/${new Date().getFullYear()}/${new Date().getMonth() + 1}` },
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

// ── Icono de un ítem del menú: los canales llevan su icono y color oficiales ──
function IconoItem({ label }: { label: string }) {
  if (esCanal(label)) return <CanalIcon canal={label} size={16} color={CANAL_COLOR[label]} />
  return <span className="w-4 shrink-0" aria-hidden="true" />
}

// ── Layout ────────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [openSections,  setOpenSections]  = useState<Record<string, boolean>>({ Facturación: true, Inventario: true })
  const [openGroups,    setOpenGroups]    = useState<Record<string, boolean>>({ Accesorios: true, Subastas: true })
  const [openSubGroups, setOpenSubGroups] = useState<Record<string, boolean>>({ 'Torre de Control': true })

  const [syncing,        setSyncing]        = useState(false)
  const [syncMsg,        setSyncMsg]        = useState('')
  const [dashboards,     setDashboards]     = useState<string[]>([])
  const [esAdmin,        setEsAdmin]        = useState(false)
  const [permisosListos, setPermisosListos] = useState(false)
  const router = useRouter()

  // Menú en celular: cajón lateral que se abre con el botón de la barra superior.
  const [menuAbierto, setMenuAbierto] = useState(false)
  const botonMenu = useRef<HTMLButtonElement>(null)
  const botonCerrar = useRef<HTMLButtonElement>(null)

  useEffect(() => { setMenuAbierto(false) }, [pathname])

  useEffect(() => {
    if (!menuAbierto) return
    // Esperar un cuadro: el cajón pasa de oculto a visible y solo entonces acepta el foco.
    const cuadro = requestAnimationFrame(() => botonCerrar.current?.focus())
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuAbierto(false); botonMenu.current?.focus() }
    }
    window.addEventListener('keydown', alTeclear)
    return () => { cancelAnimationFrame(cuadro); window.removeEventListener('keydown', alTeclear) }
  }, [menuAbierto])

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
    if (!permisosListos) return false
    if (esAdmin) return true
    const key = ROUTE_DASHBOARD[ruta]
    if (!key) return true
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
    <div className="flex h-dvh flex-col overflow-hidden bg-brand-bg text-brand-text font-sans md:flex-row">

      {/* ── BARRA SUPERIOR (solo celular) ───────────────────────────────── */}
      <header className="md:hidden shrink-0 flex items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] border-b border-brand-line bg-brand-sidebar">
        <button ref={botonMenu} type="button" onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú" aria-expanded={menuAbierto} aria-controls="menu-lateral"
          className="w-11 h-11 flex items-center justify-center rounded-[10px] border border-brand-line bg-[#161E28] text-brand-text">
          <Menu size={18} aria-hidden="true" />
        </button>
        <span className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-brand-text text-brand-bg flex items-center justify-center font-bold text-xs" aria-hidden="true">IZ</span>
          <span className="font-bold text-[15px]">Indizia</span>
        </span>
      </header>

      {/* Fondo oscuro detrás del menú abierto en celular */}
      {menuAbierto && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/60" aria-hidden="true" onClick={() => setMenuAbierto(false)} />
      )}

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside id="menu-lateral"
        className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] shrink-0 flex flex-col h-dvh bg-brand-sidebar border-r border-brand-line
          pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
          md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0 md:visible md:pt-0 md:pb-0
          ${menuAbierto
            ? 'translate-x-0 visible motion-safe:[transition:transform_300ms]'
            // Al cerrar, se oculta (y sale del orden de tabulación) cuando termina de deslizarse.
            : '-translate-x-full invisible motion-safe:[transition:transform_300ms,visibility_0s_300ms]'}`}>

        {/* Marca */}
        <div className="px-5 pt-6 pb-5 shrink-0 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-text text-brand-bg flex items-center justify-center font-bold text-[13px]" aria-hidden="true">IZ</div>
          <div className="leading-tight flex-1">
            <p className="font-bold text-[15px] text-brand-text">Indizia</p>
            <p className="text-xs text-brand-subtle">Repuestos y accesorios KIA</p>
          </div>
          <button ref={botonCerrar} type="button" onClick={() => { setMenuAbierto(false); botonMenu.current?.focus() }}
            aria-label="Cerrar menú"
            className="md:hidden w-11 h-11 -mr-2 flex items-center justify-center rounded-[10px] text-brand-soft hover:text-brand-text">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Navegación */}
        <nav aria-label="Informes" className="flex-1 overflow-y-auto px-3 pb-4">
          <ul className="space-y-4">
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
                        aria-expanded={!!openSections[section.label]}
                        className={`group w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] font-semibold transition-colors
                          ${secActive ? 'text-brand-text' : 'text-brand-subtle hover:text-brand-text'}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="inline-flex motion-safe:group-hover:animate-icon-nudge">{section.icon}</span>
                          {section.label}
                        </span>
                        <ExpandChevron open={!!openSections[section.label]} size={14} />
                      </button>

                      {openSections[section.label] && (
                        <ul className="mt-1 space-y-0.5">
                          {section.children.map(child => {

                            // Nivel 2 — leaf
                            if (child.type === 'leaf') {
                              if (!tieneAcceso(child.href)) return null
                              return (
                                <li key={child.href}>
                                  <Link href={child.href}
                                    aria-current={isActive(child.href) ? 'page' : undefined}
                                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors
                                      ${isActive(child.href)
                                        ? 'bg-brand-active text-brand-text font-semibold'
                                        : 'text-brand-soft hover:text-brand-text hover:bg-brand-active/60'}`}>
                                    <IconoItem label={child.label} />
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
                                  aria-expanded={!!openGroups[child.label]}
                                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors
                                    ${grpActive ? 'text-brand-text font-semibold' : 'text-brand-soft hover:text-brand-text hover:bg-brand-active/60'}`}
                                >
                                  <span className="flex items-center gap-2.5">
                                    <IconoItem label={child.label} />
                                    {child.label}
                                  </span>
                                  <ExpandChevron open={!!openGroups[child.label]} size={13} />
                                </button>

                                {openGroups[child.label] && (
                                  <ul className="mt-0.5 ml-[18px] pl-3 border-l border-brand-line space-y-0.5">
                                    {child.children.map(item => {

                                      // Nivel 3 — leaf dentro de group
                                      if (item.type === 'leaf') {
                                        if (!tieneAcceso(item.href)) return null
                                        return (
                                          <li key={item.href}>
                                            <Link href={item.href}
                                              aria-current={isActive(item.href) ? 'page' : undefined}
                                              className={`block px-2.5 py-1.5 rounded-lg text-[13px] transition-colors
                                                ${isActive(item.href)
                                                  ? 'bg-brand-active text-brand-text font-semibold'
                                                  : 'text-brand-subtle hover:text-brand-text hover:bg-brand-active/60'}`}>
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
                                            aria-expanded={!!openSubGroups[item.label]}
                                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] transition-colors
                                              ${subActive ? 'text-brand-text font-semibold' : 'text-brand-subtle hover:text-brand-text hover:bg-brand-active/60'}`}
                                          >
                                            <span>{item.label}</span>
                                            <ExpandChevron open={!!openSubGroups[item.label]} size={12} />
                                          </button>

                                          {openSubGroups[item.label] && (
                                            <ul className="mt-0.5 ml-2.5 pl-3 border-l border-brand-line space-y-0.5">
                                              {item.children.filter(leaf => tieneAcceso(leaf.href)).map(leaf => (
                                                <li key={leaf.href}>
                                                  <Link href={leaf.href}
                                                    aria-current={isActive(leaf.href) ? 'page' : undefined}
                                                    className={`block px-2.5 py-1.5 rounded-lg text-[13px] transition-colors
                                                      ${isActive(leaf.href)
                                                        ? 'bg-brand-active text-brand-text font-semibold'
                                                        : 'text-brand-subtle hover:text-brand-text hover:bg-brand-active/60'}`}>
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
                      aria-current={isActive(section.href!) ? 'page' : undefined}
                      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors
                        ${isActive(section.href!)
                          ? 'bg-brand-active text-brand-text font-semibold'
                          : 'text-brand-soft hover:text-brand-text hover:bg-brand-active/60'}`}
                    >
                      <span className="inline-flex motion-safe:group-hover:animate-icon-nudge">{section.icon}</span>
                      {section.label}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Pie */}
        <div className="p-4 border-t border-brand-line shrink-0 space-y-2">
          <button onClick={sincronizarDropbox} disabled={syncing}
            className={`w-full h-11 flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors border ${
              syncing
                ? 'border-brand-line text-brand-subtle cursor-not-allowed'
                : 'border-brand-line text-brand-text hover:bg-brand-active'
            }`}>
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} aria-hidden="true" />
            {syncing ? 'Sincronizando…' : 'Sincronizar Dropbox'}
          </button>
          {syncMsg && (
            <p role="status" className="text-center text-xs text-brand-subtle">{syncMsg}</p>
          )}
        </div>

      </aside>

      {/* ── CONTENIDO ───────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]">{children}</main>

    </div>
  )
}
