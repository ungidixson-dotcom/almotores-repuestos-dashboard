-- Última fecha con facturas cargadas por año y mes.
-- Facturación General cuenta los días hábiles transcurridos de un mes abierto hasta esta fecha,
-- no hasta hoy: así el ritmo diario no se castiga por días que aún no se han sincronizado.
-- Vista nueva y aditiva: no modifica tablas ni vistas existentes.
create or replace view public.v_facturacion_ultima_fecha as
select anio, mes, max(f) as ultima_fecha
from (
  select anio, mes, max(fecha_cierre) as f from public.facturas_taller group by anio, mes
  union all
  select anio, mes, max(fecha) from public.facturas_mostrador group by anio, mes
  union all
  select anio, mes, max(fecha) from public.facturas_credito group by anio, mes
) t
where anio is not null and mes is not null
group by anio, mes;

comment on view public.v_facturacion_ultima_fecha is
  'Última fecha con facturas cargadas por año y mes (taller, mostrador y crédito). Facturación General cuenta los días hábiles transcurridos hasta esta fecha.';

revoke insert, update, delete, truncate on public.v_facturacion_ultima_fecha from anon, authenticated;
grant select on public.v_facturacion_ultima_fecha to anon, authenticated;
