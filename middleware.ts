import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Mapeo ruta → dashboard key
const ROUTE_DASHBOARD: Record<string, string> = {
  '/dashboard':                                                'subastas',
  '/dashboard/resumen-mensual':                               'resumen_mensual',
  '/dashboard/aseguradoras':                                  'aseguradoras',
  '/dashboard/asesores':                                      'asesores',
  '/dashboard/facturacion/general':                           'facturacion_general',
  '/dashboard/facturacion/canales/accesorios':                'facturacion_accesorios',
  '/dashboard/facturacion/canales/accesorios/comisiones':     'facturacion_accesorios',
  '/dashboard/facturacion/canales/accesorios/ventas-asesor':  'facturacion_accesorios',
  '/dashboard/facturacion/canales/accesorios/ticket-promedio':'facturacion_accesorios',
  '/dashboard/facturacion/canales/taller':                    'facturacion_taller',
  '/dashboard/facturacion/canales/mostrador':                 'facturacion_mostrador',
  '/dashboard/facturacion/canales/mayoristas':                'facturacion_mayoristas',
  '/dashboard/facturacion/canales/subastas':                  'subastas',
  '/dashboard/facturacion/canales/colision':                  'facturacion_colision',
  '/dashboard/inventario':                                    'inventario',
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /entregas se protege en el propio componente (client-side auth check)
  // No pasar por middleware para evitar timeout en Edge Runtime
  if (!pathname.startsWith('/dashboard')) return NextResponse.next()

  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: any }[]) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: perfil } = await supabase
    .from('user_profiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (perfil?.rol === 'admin') return response

  const dashboardKey = ROUTE_DASHBOARD[pathname]
  if (dashboardKey) {
    const { data: acceso } = await supabase
      .from('user_dashboards')
      .select('dashboard')
      .eq('user_id', user.id)
      .eq('dashboard', dashboardKey)
      .single()

    if (!acceso) {
      return NextResponse.redirect(new URL('/dashboard/facturacion/general', request.url))
    }
  }

  return response
}

export const config = {
  // /entregas queda fuera del matcher — la página maneja su propio auth
  matcher: ['/dashboard/:path*'],
}
