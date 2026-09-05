// ── Tipos del informe de accesorios ─────────────────────────────────────────

export interface InformeResumen {
  anio: number
  mes_num: number
  mes: string
  facturas: number
  ventas_neto: number
  comisiones: number
  comercial_vn: number
  accesorios: number
  taller: number
  vehiculos: number
  ticket_promedio: number
  meta_vehiculos: number | null
  ticket_objetivo: number | null
  meta_ventas: number | null
  pct_meta_ventas: number | null
  pct_meta_vehiculos: number | null
  pct_comision: number
}

export interface InformeVitrina {
  anio: number
  mes_num: number
  mes: string
  vitrina: string
  facturas: number
  ventas_neto: number
  comisiones: number
  comercial_vn: number
  accesorios: number
  taller: number
  vehiculos: number | null
  ticket_promedio: number | null
  meta_vehiculos: number | null
  ticket_objetivo: number | null
  meta_asesor: number | null
  meta_ventas: number | null
  pct_meta_ventas: number | null
  pct_meta_vehiculos: number | null
}

export interface InformeAsesor {
  anio: number
  mes_num: number
  mes: string
  nombre_dropbox: string
  vitrina: string
  facturas: number
  ventas_neto: number
  comisiones: number
  nombre_normalizado: string | null
  codigo_vendedor: string | null
  solo_accesorios: boolean
  vehiculos: number | null
  ticket_promedio: number | null
}

export interface InformeArea {
  anio: number
  mes_num: number
  mes: string
  area: string
  area_detalle: string
  facturas: number
  ventas_neto: number
  comisiones: number
}

export interface MesDisponible {
  anio: number
  mes_num: number
  mes: string
}

// Comparativo: mes actual vs mes anterior y vs mismo mes año anterior
export interface Comparativo {
  actual: InformeResumen
  mes_anterior: InformeResumen | null
  anio_anterior: InformeResumen | null
  vitrinas_actual: InformeVitrina[]
  vitrinas_mes_anterior: InformeVitrina[]
  vitrinas_anio_anterior: InformeVitrina[]
}
