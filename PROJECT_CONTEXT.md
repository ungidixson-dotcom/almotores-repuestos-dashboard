# Almotores KIA · Torre de Control — Repuestos & Accesorios
## Contexto para continuar en otro chat
## Última actualización: 2026-07-23

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

### Tablas principales
| Tabla | Descripcion |
|---|---|
| subastas | ~18,000 registros 2024-2026 |
| facturas | Radicacion facturas canal subastas |
| aseguradoras | Catalogo maestro |
| asesores | 4 asesores de subastas |
| comisiones_acc_detalle | Ventas accesorios desde Dropbox (~7,673 registros) |
| comisiones_acc_vehiculos | Vehiculos vendidos por asesor/mes/sede |
| comisiones_acc_mapeo_asesores | Mapeo nombres Dropbox vs Sheet vehiculos |
| comisiones_acc_sync_log | Log de sincronizaciones Dropbox |
| user_profiles | Perfiles de usuario (nombre, rol, activo) |
| user_dashboards | Dashboards asignados por usuario |
| presupuesto | Presupuesto mensual por canal/sede/anio |

### Vistas Subastas
- v_kpis_subastas — agregado por anio/mes/marca/asesor/aseguradora/estado
- v_resumen_mensual — totales por anio/mes + max_fecha_subasta
- v_meses_disponibles — lista anio/mes para filtros
- v_subastas_pipeline — pipeline de conversion
- v_subastas_por_aseguradora — KPIs por aseguradora
- v_subastas_por_asesor — KPIs por asesor con descuento_prom
- v_subastas_por_mes — evolucion mensual completa

### Vistas Facturacion
- v_facturacion_general — todos los canales
- v_accesorios_facturas — canal Accesorios
- v_taller_facturas — canal Taller
- v_colision_facturas — canal Colision
- v_mayoristas_det — canal Mayoristas

### Vistas Comisiones Accesorios
- v_comisiones_acc_sede — KPIs por sede/mes
- v_comisiones_acc_asesor — KPIs por asesor con ticket promedio
- v_comisiones_acc_diario — seguimiento diario
- v_ticket_real_sede — ticket real = neto / vehiculos vendidos
- v_ticket_promedio — ticket por asesor cruzando accesorios y vehiculos
- v_comisiones_acc_con_asesor — detalle con nombre normalizado

### Reglas criticas
- Todas las vistas de subastas filtran WHERE anio IS NOT NULL
- Meta ticket promedio accesorios: $2.200.000 por vehiculo

---

## Estructura del proyecto
```
dashboard/
  layout.tsx                     sidebar 2 niveles
  page.tsx                       Torre de Control Subastas v24
  aseguradoras/page.tsx          construido
  asesores/page.tsx              construido
  resumen-mensual/page.tsx       construido
  facturacion/
    general/page.tsx             construido - multiseleccion sedes + Sin Colision
    canales/
      accesorios/
        page.tsx                 construido
        comisiones/page.tsx      construido
        ventas-asesor/page.tsx   construido
        ticket-promedio/page.tsx construido
      taller/page.tsx            construido - ticket por OT y por vehiculo
      mostrador/page.tsx         construido
      mayoristas/page.tsx        construido
      subastas/page.tsx          construido
      colision/page.tsx          construido
```

---

## Sidebar layout.tsx
```
Facturacion
  Facturacion General
  > Accesorios
      Facturacion
      Comisiones
      Ventas por asesor
      Ticket promedio
  Taller
  Mostrador
  Mayoristas
  > Subastas
      Facturacion
      Torre de Control
  Colision
Resumen Mensual
Aseguradoras
Asesores
```

---

## Torre de Control Subastas v24
- Filtros: anio, asesor, aseguradora, mes, marca
- Pipeline: Total > Autorizadas > En pedido > Por facturar > Por radicar > Radicadas
- Graficas: AreaChart con gradientes SVG
- diasTranscurridos dinamico desde max_fecha_subasta
- Tasa autorizacion = ganadas / (ganadas + NO Autorizadas)
- Efectividad = ganadas / total

---

## Facturacion General
- Multiseleccion sedes: [Todas][Norte][Pasoancho][Sede 39]
- Boton Sin Colision excluye canal Colision
- Tabla: Canal | Presupuesto | Neto | % Avance | Costo | Utilidad | % Util | $/Dia | Necesario/dia | Pronostico | Estado

---

## Ticket Promedio Accesorios
- Ticket real = neto sede / vehiculos vendidos (PRINCIPAL)
- Ticket parcial = neto / vehiculos con accesorio (referencia)
- Meta $2.200.000 - semaforo verde/naranja/rojo
- Graficas AreaChart + linea roja de meta

---

## Taller
- Ticket por orden (neto / OTs unicas)
- Ticket por vehiculo (neto / cuentas unicas)

---

## Sincronizacion

### Subastas > Supabase
- Google Sheets: https://docs.google.com/spreadsheets/d/1ihvYD0-DRtOQeqHerJrdWtwZHFW3ygnRK2vxY2VvHho
- Trigger: onEdit + diario 7am Colombia
- Llave: fila_sheet

### Facturas subastas > Supabase
- Excel OneDrive: Informe_Radicacion_Facturas_2026.xlsx
- Trigger: manual desde Excel
- Pendiente: Power Automate

### Comisiones Accesorios > Supabase
- 3 archivos Dropbox:
  - /Accesorios Norte/Comisiones Norte 2026 FO-PKIA-19 V00.xlsm
  - /Accesorios 80/Comisiones Pasoancho 2026 FO-PKIA-19 V00.xlsm
  - /Accesorios 39/Comisiones Calle 9 2026 FO-PKIA-19 V00.xlsm
- Script: C:\AlmotoresSync\sync.py
- Token: Refresh token OAuth2 permanente en .env
- Automatico: tarea Windows todos los dias 9:00 AM
- Manual: cd C:\AlmotoresSync && python sync.py
- App Dropbox: "Accesorios" - App key: 2tkiekz0zek8n3q
- Llave: fila_key (MD5)

### Vehiculos vendidos > Supabase
- Google Sheets: https://docs.google.com/spreadsheets/d/1fs779BGplnVfzkkI247kx30clyQ5lxwMUgzSdPbpyRI
- Proceso: Claude lee el Sheet y ejecuta SQL
- Pendiente: automatizar

---

## Diseno gerencial
- AreaChart + gradientes SVG (stopOpacity 0.35 > 0)
- Grid: #1E2A36
- Tooltips: background #0F1419 + boxShadow
- ReferenceLine para metas en rojo punteado

### Colores
- bg: #0F1419
- surface: #1B232D
- border: #2A3340
- muted: #5B6472
- subtle: #8AA4C8
- text: #EAF0F6
- gold: #E8A33D
- teal: #4FD1C5
- red: #E5484D

---

## Usuarios pendientes de invitar
URL: https://supabase.com/dashboard/project/vvguowdjmayausyicsqs/auth/users

| Nombre | Correo | Rol | Dashboards |
|---|---|---|---|
| Dixson Ibarguen | coordinadorrepuestos@almotores.com | admin | Todo |
| Jhon Miguel Garces | ventasrepaseguradoras@almotores.com | asesor | Fac General, Torre Control, Subastas, Aseguradoras, Asesores |
| Jefferson Mosquera | repuestos80@almotores.com | asesor | Fac General, Taller, Mostrador, Mayoristas |
| Eric Valencia | coordinadorrepuestoscol@almotores.com | asesor | Fac General, Colision |
| Maria Isabel Cucunhame | accesoriossur@almotores.com | viewer | Fac General, Accesorios, Ticket Promedio, Comisiones |
| Carlos Cuellar | accesoriosnorte@almotores.com | viewer | Fac General, Accesorios, Ticket Promedio, Comisiones |
| Mario Rodriguez | repuestos39@almotores.com | asesor | Fac General, Taller, Mostrador, Mayoristas |
| Hernan Pena | almacen@almotores.com | viewer | Fac General |
| Victor Zapata | accesorios39@almotores.com | viewer | Fac General, Accesorios, Ticket Promedio |
| Giovanni Perafan | aux5repuestos@almotores.com | viewer | Fac General, Mayoristas |
| Diego Aguirre | analistarepuestoscol@almotores.com | asesor | Fac General, Torre Control, Subastas, Aseguradoras |
| Leonardo Mejia | ventasrepaseguradoras2@almotores.com | asesor | Fac General, Torre Control, Subastas, Aseguradoras, Asesores |
| Invitado Subastas | invitado.subastas@almotores.com | viewer | Torre Control, Subastas, Aseguradoras, Asesores |

---

## Pendientes
1. Invitar usuarios (cuando el equipo este disponible)
2. Dominio personalizado en Vercel (pendiente comprar dominio)
3. Automatizar facturas subastas con Power Automate
4. Automatizar vehiculos vendidos desde Google Sheets
5. Resumen mensual de accesorios

---

## Links utiles
- App: https://almotores-repuestos-dashboard.vercel.app
- GitHub: https://github.com/ungidixson-dotcom/almotores-repuestos-dashboard
- Supabase SQL: https://supabase.com/dashboard/project/vvguowdjmayausyicsqs/sql/new
- Supabase Auth: https://supabase.com/dashboard/project/vvguowdjmayausyicsqs/auth/users
- Dropbox Apps: https://www.dropbox.com/developers/apps
