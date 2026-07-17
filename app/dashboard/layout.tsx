'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Receipt, FolderOpen, Calendar, Shield, User,
  ChevronDown, ChevronRight, LayoutGrid,
} from 'lucide-react'

type NavItem  = { label: string; href: string; icon?: React.ReactNode }
type NavGroup = { label: string; icon: React.ReactNode; href?: string; children?: NavItem[] }

const CANALES: NavItem[] = [
  { label: 'Accesorios', href: '/dashboard/facturacion/canales/accesorios' },
  { label: 'Taller',     href: '/dashboard/facturacion/canales/taller' },
  { label: 'Mostrador',  href: '/dashboard/facturacion/canales/mostrador' },
  { label: 'Mayoristas', href: '/dashboard/facturacion/canales/mayoristas' },
  { label: 'Subastas',   href: '/dashboard/facturacion/canales/subastas' },
  { label: 'Colisión',   href: '/dashboard/facturacion/canales/colision' },
]

const NAV: NavGroup[] = [
  {
    label: 'Facturación', icon: <Receipt size={16} />,
    children: [
      { label: 'Facturación General', href: '/dashboard/facturacion/general' },
      ...CANALES.map(c => ({ label: c.label, href: c.href })),
    ],
  },
  { label: 'Resumen Mensual', icon: <Calendar size={16} />, href: '/dashboard/resumen-mensual' },
  { label: 'Aseguradoras',    icon: <Shield size={16} />,   href: '/dashboard/aseguradoras' },
  { label: 'Asesores',        icon: <User size={16} />,     href: '/dashboard/asesores' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Facturación: true })

  const toggleGroup   = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))
  const isActive      = (href?: string)        => href && pathname === href
  const isGroupActive = (children?: NavItem[]) => children?.some(c => pathname.startsWith(c.href))

  return (
    <div className="flex h-screen overflow-hidden bg-brand-bg text-brand-text font-sans">

      {/* ── SIDEBAR FIJO ─────────────────────────────────────────────── */}
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

        {/* Nav scrolleable */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <p className="font-mono text-[10px] text-brand-muted uppercase tracking-wider px-2 mb-2">Informes</p>
          <ul className="space-y-1">
            {NAV.map(item => (
              <li key={item.label}>
                {item.children ? (
                  <>
                    <button
                      onClick={() => toggleGroup(item.label)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                        ${isGroupActive(item.children) ? 'text-brand-teal' : 'text-brand-subtle hover:text-brand-text hover:bg-brand-bg'}`}
                    >
                      <span className="flex items-center gap-2">{item.icon}{item.label}</span>
                      {openGroups[item.label] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {openGroups[item.label] && (
                      <ul className="mt-1 ml-4 pl-3 border-l border-brand-border space-y-0.5">
                        {item.children.map(sub => (
                          <li key={sub.href}>
                            <Link
                              href={sub.href}
                              className={`block px-3 py-1.5 rounded-lg text-xs font-mono transition-colors
                                ${isActive(sub.href)
                                  ? 'bg-brand-teal/10 text-brand-teal border border-brand-teal/30'
                                  : 'text-brand-subtle hover:text-brand-text hover:bg-brand-bg'}`}
                            >
                              {sub.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href!}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                      ${isActive(item.href)
                        ? 'bg-brand-teal/10 text-brand-teal border border-brand-teal/30'
                        : 'text-brand-subtle hover:text-brand-text hover:bg-brand-bg'}`}
                  >
                    {item.icon}{item.label}
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

      {/* ── CONTENIDO SCROLLEABLE ────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>

    </div>
  )
}
