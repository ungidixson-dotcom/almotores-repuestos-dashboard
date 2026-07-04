# Almotores KIA · Torre de Control — Repuestos & Accesorios

Dashboard de análisis de subastas y facturación con aseguradoras.

## Stack
- **Next.js 14** (App Router)
- **Supabase** (base de datos + autenticación)
- **Recharts** (gráficas)
- **Tailwind CSS** (estilos)
- **Vercel** (despliegue)

## Instalación local

```bash
git clone https://github.com/ungidixson-dotcom/almotores-repuestos-dashboard.git
cd almotores-repuestos-dashboard
npm install
```

Crea el archivo `.env.local` en la raíz:

```env
NEXT_PUBLIC_SUPABASE_URL=https://vvguowdjmayausyicsqs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
```

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Despliegue en Vercel

1. Conecta el repo en [vercel.com/new](https://vercel.com/new)
2. En **Environment Variables** agrega:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy → obtienes tu URL pública

## Crear usuarios del equipo

En Supabase → **Authentication → Users → Invite user**
Ingresa el correo de cada miembro del equipo.
