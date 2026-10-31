-- Subastas: fecha efectiva para líneas sin fecha en el Sheet.
--
-- Regla (aprobada por Dixson, 31-oct-2026): si una subasta no tiene fecha,
-- se le asigna la fecha de la línea anterior del Sheet (orden por fila_sheet),
-- que es cronológico. La línea queda marcada con fecha_estimada = true.
--
-- No se modifica la tabla `subastas` (la carga el script del Sheet y podría
-- sobrescribir la corrección). Todas las vistas de la Torre de Control leen
-- ahora de v_subastas_base, con las MISMAS columnas de salida que antes.
-- Si un asesor llena la fecha en el Sheet, se usa la real automáticamente.

create or replace view public.v_subastas_base as
with ordenadas as (
  select s.*,
         -- grupo = cantidad de fechas vistas hasta esta fila; una fila sin fecha
         -- queda en el mismo grupo que la última fila con fecha anterior a ella.
         count(s.fecha_subasta) over (order by s.fila_sheet) as grupo_fecha
  from public.subastas s
), con_fecha as (
  select o.*,
         coalesce(o.fecha_subasta, max(o.fecha_subasta) over (partition by o.grupo_fecha)) as fecha_efectiva
  from ordenadas o
)
select
  id, placa, marca, aseguradora_id, asesor_id, estado_subasta,
  fecha_subasta,                                   -- fecha real (puede ser null)
  valor_subastado, descuento_otorgado, tiempo_max_suministro_dias, ciudad_destino,
  estado_autorizacion, fecha_autorizacion, estado_pedido, valor_autorizado, pct_autorizado,
  motivo_no_ganada, estado_facturacion_oc, fecha_factura, numero_factura,
  estado_desc_repuestos, estado_radicacion_factura, fecha_radicacion_factura,
  coalesce(
    mes_subasta,
    (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
           'septiembre','octubre','noviembre','diciembre'])[extract(month from fecha_efectiva)::int]
  ) as mes_subasta,
  coalesce(anio, extract(year from fecha_efectiva)::int) as anio,
  creado_en, fila_sheet,
  fecha_efectiva,
  (fecha_subasta is null) as fecha_estimada
from con_fecha;

comment on view public.v_subastas_base is
  'Subastas con fecha_efectiva: fecha real o, si falta, la de la línea anterior del Sheet (fecha_estimada=true). Base de todas las vistas de la Torre de Control.';

-- ── Vistas de la Torre de Control: misma definición, ahora sobre v_subastas_base ──

create or replace view public.v_kpis_subastas as
select anio, mes_subasta, marca, aseguradora_id, asesor_id, estado_autorizacion, ciudad_destino,
       count(*) as total,
       sum(valor_subastado) as valor_subastado,
       sum(valor_autorizado) as valor_autorizado,
       avg(tiempo_max_suministro_dias) as tiempo_promedio
from public.v_subastas_base
where anio is not null
group by anio, mes_subasta, marca, aseguradora_id, asesor_id, estado_autorizacion, ciudad_destino;

create or replace view public.v_meses_disponibles as
select distinct anio, mes_subasta as mes,
  case mes_subasta
    when 'enero' then 1 when 'febrero' then 2 when 'marzo' then 3 when 'abril' then 4
    when 'mayo' then 5 when 'junio' then 6 when 'julio' then 7 when 'agosto' then 8
    when 'septiembre' then 9 when 'octubre' then 10 when 'noviembre' then 11 when 'diciembre' then 12
    else 99 end as orden
from public.v_subastas_base
where anio is not null and mes_subasta is not null
order by anio, orden;

create or replace view public.v_resumen_mensual as
select anio, mes_subasta as mes,
  case mes_subasta
    when 'enero' then 1 when 'febrero' then 2 when 'marzo' then 3 when 'abril' then 4
    when 'mayo' then 5 when 'junio' then 6 when 'julio' then 7 when 'agosto' then 8
    when 'septiembre' then 9 when 'octubre' then 10 when 'noviembre' then 11 when 'diciembre' then 12
    else 99 end as orden,
  count(*) as total_subastas,
  count(case when estado_autorizacion in ('Autorizada Completa','Autorizada parcial') then 1 end) as ganadas,
  count(case when estado_autorizacion = 'NO Autorizada' then 1 end) as no_autorizadas,
  sum(case when estado_autorizacion in ('Autorizada Completa','Autorizada parcial') then valor_autorizado else 0::numeric end) as valor_autorizado,
  sum(valor_subastado) as valor_subastado,
  max(fecha_subasta) as max_fecha_subasta
from public.v_subastas_base
where anio is not null and mes_subasta is not null
group by anio, mes_subasta;

create or replace view public.v_subastas_pipeline as
select anio,
  count(*) as total,
  count(case when estado_subasta = 'Subastada' and estado_autorizacion is null then 1 end) as pend_auth,
  count(case when estado_pedido = 'Reservado' then 1 end) as en_pedido,
  count(case when estado_autorizacion in ('Autorizada Completa','Autorizada parcial') and estado_facturacion_oc <> 'Facturado' then 1 end) as por_facturar,
  count(case when estado_facturacion_oc = 'Facturado' and (estado_radicacion_factura is null or estado_radicacion_factura <> 'Radicada') then 1 end) as por_radicar,
  count(case when estado_radicacion_factura = 'Radicada' then 1 end) as completadas
from public.v_subastas_base
group by anio;

create or replace view public.v_subastas_por_aseguradora as
select s.anio, s.mes_subasta, s.aseguradora_id, a.nombre_corto as aseguradora,
  initcap(lower(coalesce(s.marca, 'Sin marca'))) as marca,
  count(*) as total,
  count(case when s.estado_subasta = 'Subastada' then 1 end) as subastadas,
  count(case when s.estado_autorizacion in ('Autorizada Completa','Autorizada parcial') then 1 end) as autorizadas,
  count(case when s.estado_autorizacion = 'NO Autorizada' then 1 end) as no_autorizadas,
  count(case when s.estado_facturacion_oc = 'Facturado' then 1 end) as facturadas,
  count(case when s.estado_radicacion_factura = 'Radicada' then 1 end) as radicadas,
  sum(s.valor_subastado) as valor_subastado,
  sum(s.valor_autorizado) as valor_autorizado
from public.v_subastas_base s
left join public.aseguradoras a on a.id = s.aseguradora_id
group by s.anio, s.mes_subasta, s.aseguradora_id, a.nombre_corto, initcap(lower(coalesce(s.marca, 'Sin marca')));

create or replace view public.v_subastas_por_asesor as
select s.anio, s.mes_subasta, s.asesor_id, a.nombre as asesor,
  initcap(lower(coalesce(s.marca, 'Sin marca'))) as marca,
  count(*) as total,
  count(case when s.estado_subasta = 'Subastada' then 1 end) as subastadas,
  count(case when s.estado_autorizacion in ('Autorizada Completa','Autorizada parcial') then 1 end) as autorizadas,
  count(case when s.estado_autorizacion = 'NO Autorizada' then 1 end) as no_autorizadas,
  count(case when s.estado_facturacion_oc = 'Facturado' then 1 end) as facturadas,
  count(case when s.estado_radicacion_factura = 'Radicada' then 1 end) as radicadas,
  sum(s.valor_subastado) as valor_subastado,
  sum(s.valor_autorizado) as valor_autorizado,
  avg(s.descuento_otorgado) as descuento_prom
from public.v_subastas_base s
left join public.asesores a on a.id = s.asesor_id
group by s.anio, s.mes_subasta, s.asesor_id, a.nombre, initcap(lower(coalesce(s.marca, 'Sin marca')));

create or replace view public.v_subastas_por_mes as
select anio, mes_subasta,
  initcap(lower(coalesce(marca, 'Sin marca'))) as marca,
  count(*) as total,
  count(case when estado_subasta = 'Subastada' then 1 end) as subastadas,
  count(case when estado_autorizacion = 'Autorizada Completa' then 1 end) as auth_completa,
  count(case when estado_autorizacion = 'Autorizada parcial' then 1 end) as auth_parcial,
  count(case when estado_autorizacion = 'NO Autorizada' then 1 end) as no_autorizadas,
  count(case when estado_autorizacion is null then 1 end) as pend_auth,
  count(case when estado_pedido = 'Reservado' then 1 end) as en_pedido,
  count(case when estado_facturacion_oc = 'Facturado' then 1 end) as facturadas,
  count(case when estado_radicacion_factura = 'Radicada' then 1 end) as radicadas,
  sum(valor_subastado) as valor_subastado,
  sum(valor_autorizado) as valor_autorizado,
  avg(descuento_otorgado) as descuento_prom
from public.v_subastas_base
group by anio, mes_subasta, initcap(lower(coalesce(marca, 'Sin marca')));

-- La vista base solo se expone para lectura.
revoke insert, update, delete, truncate on public.v_subastas_base from anon, authenticated;
grant select on public.v_subastas_base to anon, authenticated;
