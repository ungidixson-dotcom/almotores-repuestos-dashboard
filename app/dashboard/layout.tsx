'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Receipt, FolderOpen, Calendar, Shield, User,
  ChevronDown, ChevronRight, LayoutGrid,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface NavLeaf  { type: 'leaf';  label: string; href: string }
interface NavGroup { type: 'group'; label: string; href?: string; children: NavLeaf[] }
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
      { type: 'leaf',  label: 'Facturación General', href: '/dashboard/facturacion/general' },
      {
        type: 'group', label: 'Accesorios', href: '/dashboard/facturacion/canales/accesorios',
        children: [
          { type: 'leaf', label: 'Facturación',      href: '/dashboard/facturacion/canales/accesorios' },
          { type: 'leaf', label: 'Comisiones',        href: '/dashboard/facturacion/canales/accesorios/comisiones' },
          { type: 'leaf', label: 'Ventas por asesor', href: '/dashboard/facturacion/canales/accesorios/ventas-asesor' },
        ],
      },
      { type: 'leaf', label: 'Taller',     href: '/dashboard/facturacion/canales/taller' },
      { type: 'leaf', label: 'Mostrador',  href: '/dashboard/facturacion/canales/mostrador' },
      { type: 'leaf', label: 'Mayoristas', href: '/dashboard/facturacion/canales/mayoristas' },
      {
        type: 'group', label: 'Subastas', href: '/dashboard/facturacion/canales/subastas',
        children: [
          { type: 'leaf', label: 'Facturación',       href: '/dashboard/facturacion/canales/subastas' },
          { type: 'leaf', label: 'Torre de Control',  href: '/dashboard' },
        ],
      },
      { type: 'leaf', label: 'Colisión',  href: '/dashboard/facturacion/canales/colision' },
    ],
  },
  { label: 'Resumen Mensual', icon: <Calendar size={16} />, href: '/dashboard/resumen-mensual' },
  { label: 'Aseguradoras',    icon: <Shield size={16} />,   href: '/dashboard/aseguradoras' },
  { label: 'Asesores',        icon: <User size={16} />,     href: '/dashboard/asesores' },
]

// ── Layout ────────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ Facturación: true })
  const [openGroups,   setOpenGroups]   = useState<Record<string, boolean>>({
    Accesorios: true, Subastas: true,
  })

  const toggleSection = (label: string) =>
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }))
  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const isActive = (href: string) => pathname === href

  const leafIsActive = (children: NavLeaf[]) =>
    children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))

  const sectionIsActive = (children?: Array<NavLeaf | NavGroup>) =>
    children?.some(c =>
      c.type === 'leaf'
        ? pathname === c.href
        : c.children.some(sub => pathname === sub.href || pathname.startsWith(sub.href + '/'))
    )

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
            {NAV.map(section => (
              <li key={section.label}>
                {section.children ? (
                  <>
                    {/* Sección con hijos */}
                    <button
                      onClick={() => toggleSection(section.label)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                        ${sectionIsActive(section.children)
                          ? 'text-brand-teal'
                          : 'text-brand-subtle hover:text-brand-text hover:bg-brand-bg'}`}
                    >
                      <span className="flex items-center gap-2">{section.icon}{section.label}</span>
                      {openSections[section.label] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {openSections[section.label] && (
                      <ul className="mt-1 ml-4 pl-3 border-l border-brand-border space-y-0.5">
                        {section.children.map(child => {
                          if (child.type === 'leaf') {
                            return (
                              <li key={child.href}>
                                <Link
                                  href={child.href}
                                  className={`block px-3 py-1.5 rounded-lg text-xs font-mono transition-colors
                                    ${isActive(child.href)
                                      ? 'bg-brand-teal/10 text-brand-teal border border-brand-teal/30'
                                      : 'text-brand-subtle hover:text-brand-text hover:bg-brand-bg'}`}
                                >
                                  {child.label}
                                </Link>
                              </li>
                            )
                          }

                          // Sub-grupo (Accesorios, Subastas)
                          const groupActive = leafIsActive(child.children)
                          return (
                            <li key={child.label}>
                              <button
                                onClick={() => toggleGroup(child.label)}
                                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono transition-colors
                                  ${groupActive
                                    ? 'text-brand-teal'
                                    : 'text-brand-subtle hover:text-brand-text hover:bg-brand-bg'}`}
                              >
                                <span>{child.label}</span>
                                {openGroups[child.label]
                                  ? <ChevronDown size={11} />
                                  : <ChevronRight size={11} />}
                              </button>

                              {openGroups[child.label] && (
                                <ul className="mt-0.5 ml-3 pl-3 border-l border-brand-border/50 space-y-0.5">
                                  {child.children.map(leaf => (
                                    <li key={leaf.href}>
                                      <Link
                                        href={leaf.href}
                                        className={`block px-3 py-1.5 rounded-lg text-xs font-mono transition-colors
                                          ${isActive(leaf.href)
                                            ? 'bg-brand-teal/10 text-brand-teal border border-brand-teal/30'
                                            : 'text-brand-muted hover:text-brand-text hover:bg-brand-bg'}`}
                                      >
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
                  </>
                ) : (
                  // Ítem directo sin hijos
                  <Link
                    href={section.href!}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                      ${isActive(section.href!)
                        ? 'bg-brand-teal/10 text-brand-teal border border-brand-teal/30'
                        : 'text-brand-subtle hover:text-brand-text hover:bg-brand-bg'}`}
                  >
                    {section.icon}{section.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-brand-border shrink-0">
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
