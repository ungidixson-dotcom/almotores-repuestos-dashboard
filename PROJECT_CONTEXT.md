# Almotores KIA · Torre de Control — Repuestos & Accesorios
## Contexto para continuar en otro chat
## Última actualización: 2026-07-18

---

## Stack
- **Framework:** Next.js 14 (App Router)
- **Base de datos:** Supabase (PostgreSQL)
- **Estilos:** Tailwind CSS
- **Gráficas:** Recharts
- **Deploy:** Vercel
- **Repo:** https://github.com/ungidixson-dotcom/almotores-repuestos-dashboard
- **URL app:** https://almotores-repuestos-dashboard.vercel.app

---

## Supabase
- **Project ID:** vvguowdjmayausyicsqs
- **URL:** https://vvguowdjmayausyicsqs.supabase.co
- **Región:** us-west-2 (Oregon)

### Tablas principales
| Tabla | Descripción |
|---|---|
| `subastas` | ~17,900 registros — 2024, 2025, 2026 (hasta jul-2026) |
| `facturas` | ~986 registros — radicación de facturas (enero-julio 2026) |
| `aseguradoras` | 13 registros — catálogo maestro |
| `asesores` | 4 registros — Diego Aguirre, Jhon Miguel Garces, Carolina Quintana, Leonardo Mejia |
| `aseguradoras_variantes` | Mapeo de variantes de nombre → aseguradora normalizada |
| `facturas_taller` | Facturas del canal Taller |
| `facturas_mostrador` | Facturas del canal Mostrador |
| `facturas_credito` | Facturas a crédito |
| `presupuesto` | Presupuesto mensual por canal/sede/año |
| `tipo_clientes` | Clasificación Mayoristas |
| `user_profiles` | Perfiles de usuario (nombre, rol, activo) |
| `user_dashboards` | Dashboards asignados por usuario |

### Columnas clave de subastas
```
id, placa, marca, aseguradora_id, asesor_id, estado_subasta,
fecha_subasta, valor_subastado, descuento_otorgado,
tiempo_max_suministro_dias, ciudad_destino, estado_autorizacion,
fecha_autorizacion, estado_pedido, valor_autorizado, pct_autorizado,
motivo_no_ganada, estado_facturacion_oc, fecha_factura, numero_factura,
estado_desc_repuestos, estado_radicacion_factura, fecha_radicacion_factura,
mes_subasta, anio, fila_sheet (llave única para upsert desde Apps Script)
```

### Columnas clave de facturas
```
id, fila_excel (llave única para upsert), almacen, referencia, fecha, mes,
cuenta, aseguradora_id, prefijo, numero, factura_texto, base_imp,
asesor_id, placa, marca, est_radicacion, fecha_radicado, numero_radicacion,
estado_radicacion_rocio, fecha_notificacion, estado_factura,
estado_refacturacion, motivo
```

### Vistas — Subastas
| Vista | Descripción |
|---|---|
| `v_kpis_subastas` | Subastas agregadas por **anio**/mes/marca/asesor/aseguradora/estado |
| `v_resumen_mensual` | Totales por **anio**/mes — incluye `max_fecha_subasta` para ritmo dinámico |
| `v_meses_disponibles` | Lista de **anio**/mes con datos — usada para filtros del dashboard |
| `v_subastas_pipeline` | Pipeline anual: total → pend_auth → en_pedido → por_facturar → por_radicar → completadas |
| `v_subastas_por_aseguradora` | Subastas + autorizadas + facturadas + radicadas por aseguradora/mes/año |
| `v_subastas_por_asesor` | Ídem por asesor — incluye descuento_prom |
| `v_subastas_por_mes` | Evolución mensual completa con todos los estados |
| `v_subastas_facturacion` | Cruce subastas ↔ facturas por placa |
| `v_detalle_subastas` | Detalle registro a registro (sin aggregar) |

### Vistas — Facturación
| Vista | Descripción |
|---|---|
| `v_facturacion_general` | Neto + costo + beneficio + presupuesto + % avance — todos los canales |
| `v_accesorios_facturas` | Canal Accesorios (taller + mostrador) |
| `v_colision_facturas` | Canal Colisión |
| `v_mayoristas_det` | Canal Mayoristas |
| `v_mostrador_facturas` / `v_mostrador_det` | Canal Mostrador |
| `v_taller_facturas` | Canal Taller |
| `v_credito_facturas` | Facturas a crédito |

### ⚠️ Regla crítica sobre las vistas de subastas
Todas las vistas de subastas filtran `WHERE anio IS NOT NULL`. Los ~564 registros
con `anio = NULL` son placas sin subasta asignada aún — se excluyen de todo análisis.
Los 2 registros con `fecha_subasta` pero `anio = NULL` fueron corregidos el 2026-07-18.

### Índices únicos
- `subastas.fila_sheet` — para upsert desde Google Apps Script
- `facturas.fila_excel` — para upsert desde Office Script

---

## Estructura del proyecto
```
almotores-repuestos-dashboard/
├── app/
│   ├── globals.css
│   ├── layout.tsx                    ← fuentes, metadata (sin sidebar)
│   ├── page.tsx                      ← redirige a /login
│   ├── login/
│   │   └── page.tsx                  ← login con Supabase Auth
│   └── dashboard/
│       ├── layout.tsx                ← sidebar de navegación
│       ├── page.tsx                  ← Torre de Control · Subastas (v23)
│       ├── aseguradoras/
│       │   └── page.tsx              ← ⬜ pendiente construir
│       ├── asesores/
│       │   └── page.tsx              ⬜ pendiente construir
│       ├── resumen-mensual/
│       │   └── page.tsx              ⬜ pendiente construir
│       └── facturacion/
│           ├── general/              ← Facturación General (existente)
│           └── canales/
│               ├── accesorios/
│               ├── taller/
│               ├── mostrador/
│               ├── mayoristas/
│               ├── subastas/         ← Dashboard Facturación Subastas (existente)
│               └── colision/
├── lib/
│   └── supabase.ts                   ← cliente Supabase browser
├── component/ y components/          ← componentes compartidos
├── next.config.js
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

---

## Navegación del sidebar (app/dashboard/layout.tsx)
```
▼ Facturación
    Facturación General       → /dashboard/facturacion/general
    Accesorios                → /dashboard/facturacion/canales/accesorios
    Taller                    → /dashboard/facturacion/canales/taller
    Mostrador                 → /dashboard/facturacion/canales/mostrador
    Mayoristas                → /dashboard/facturacion/canales/mayoristas
    Subastas                  → /dashboard/facturacion/canales/subastas
    ↳ Torre de Control        → /dashboard
    Colisión                  → /dashboard/facturacion/canales/colision
  Resumen Mensual             → /dashboard/resumen-mensual
  Aseguradoras                → /dashboard/aseguradoras
  Asesores                    → /dashboard/asesores
```

---

## Torre de Control · Subastas — /dashboard/page.tsx (v23)

### Qué hace
Dashboard operativo de subastas con filtros multi-año. Muestra:
- Mes en curso: días hábiles, avance, proyección basada en ritmo real
- KPIs: total, ganadas, tasa autorización, efectividad, sin respuesta, tiempo promedio
- Valores: subastado, autorizado, conversión en $
- Facturas: radicadas, pendientes, anuladas
- **Pipeline de conversión** (nuevo v23): Total → Autorizadas → En pedido → Por facturar → Por radicar → Radicadas
- Gráficas: valor por asesor, estado (pie), proyección mensual, ciudades, tiempos
- Tablas: efectividad por asesor, ranking por aseguradora

### Fuentes de datos (todas con filtro por anio)
- `v_kpis_subastas` — filas del dashboard filtradas
- `v_resumen_mensual` — gráfica mensual + proyección + ritmo mes en curso
- `v_meses_disponibles` — opciones del selector de mes
- `v_subastas_pipeline` — pipeline de conversión
- `facturas` — KPIs de radicación

### Lógica de KPIs
- **Tasa autorización** = ganadas / (ganadas + NO Autorizadas) — excluye pendientes y no aplicadas
- **Efectividad** = ganadas / total subastas
- **Ganadas** = Autorizada Completa + Autorizada parcial
- **diasConDatos** = días hábiles desde el 1 del mes hasta `max_fecha_subasta` (dinámico, no hardcodeado)

### Fetch centralizado
Función `fetchTodosDatos()` con un solo `Promise.all` de 7 consultas.
`cargarDatos(verificarAuth)` con `useCallback` — usada en carga inicial, auto-refresh y botón manual.
Auto-refresh cada 30 minutos con countdown visible.

---

## Sincronización de datos

### Subastas → Supabase (Google Apps Script)
- **Fuente:** Google Sheets (Hoja 2)
  https://docs.google.com/spreadsheets/d/1ihvYD0-DRtOQeqHerJrdWtwZHFW3ygnRK2vxY2VvHho
- **Trigger automático:** onEdit (cada vez que un asesor edita)
- **Trigger programado:** todos los días a las 7am Colombia
- **Archivo:** sync_subastas_v2.gs
- **Llave upsert:** fila_sheet

### Facturas → Supabase (Office Script)
- **Fuente:** Excel Online en OneDrive
  `Informe_Radicacion_Facturas_2026.xlsx`
  Ruta: `/Documentos/MIS DOCUMENTOS/Informes/Canal de Subastas/Gestion Subastas/`
- **Trigger:** manual (colaborador ejecuta desde Excel → Automatizar)
- **Archivo:** sync_facturas_v2.ts
- **Llave upsert:** fila_excel
- **Pendiente:** automatizar con Power Automate

---

## Estados de autorización en subastas
- `Autorizada Completa`
- `Autorizada parcial`
- `NO Autorizada`
- `Subasta no aplicada`
- `NULL` (sin respuesta aún)
- `41` (error de captura — 1 registro, no corregir por ahora)

---

## Tailwind — colores del tema oscuro
```js
brand: {
  bg:      '#0F1419',  // fondo principal
  surface: '#1B232D',  // tarjetas/paneles
  border:  '#2A3340',  // bordes
  muted:   '#5B6472',  // texto muy sutil
  subtle:  '#8AA4C8',  // texto secundario
  text:    '#EAF0F6',  // texto principal
  gold:    '#E8A33D',  // acento dorado (efectividad, proyecciones)
  teal:    '#4FD1C5',  // acento teal (métricas positivas)
  red:     '#E5484D',  // alertas/errores
}
```

---

## Pendientes
1. ✅ Auto-refresh cada 30 minutos + botón manual
2. ✅ Sección días hábiles mes en curso — dinámica, basada en fecha real
3. ✅ Proyección mes en curso basada en ritmo diario real (no hardcodeado)
4. ✅ Vistas multi-año — `anio` como dimensión en todas las vistas de subastas
5. ✅ Filtro de año en el dashboard (default 2026)
6. ✅ Sidebar con navegación correcta — "↳ Torre de Control" → `/dashboard`
7. ✅ Pipeline de conversión en Torre de Control (v23)
8. ⬜ Página `aseguradoras/` — usar `v_subastas_por_aseguradora`
9. ⬜ Página `asesores/` — usar `v_subastas_por_asesor`
10. ⬜ Página `resumen-mensual/` — usar `v_subastas_por_mes`
11. ⬜ Automatizar facturas con Power Automate
12. ⬜ Agregar usuarios del equipo (Supabase Auth → invite users)
13. ⬜ Dominio personalizado en Vercel

---

## Links útiles
- **Editar dashboard:** https://github.com/ungidixson-dotcom/almotores-repuestos-dashboard/edit/main/app/dashboard/page.tsx
- **Editar sidebar:** https://github.com/ungidixson-dotcom/almotores-repuestos-dashboard/edit/main/app/dashboard/layout.tsx
- **SQL Supabase:** https://supabase.com/dashboard/project/vvguowdjmayausyicsqs/sql/new
- **App en producción:** https://almotores-repuestos-dashboard.vercel.app
