// Días hábiles de Colombia: lunes a sábado, sin festivos.
// Fuente única para Facturación General. Las páginas de canal aún tienen su propia copia
// de esta lista; se migrarán a este módulo en la fase de páginas de canal.

/** Festivos de Colombia (YYYY-MM-DD). Agregar el año siguiente antes de que empiece. */
export const FESTIVOS = new Set([
  '2025-01-01','2025-01-06','2025-03-24','2025-04-17','2025-04-18','2025-05-01',
  '2025-06-02','2025-06-23','2025-06-30','2025-07-20','2025-08-07','2025-08-18',
  '2025-10-13','2025-11-03','2025-11-17','2025-12-08','2025-12-25',
  '2026-01-01','2026-01-05','2026-03-23','2026-04-02','2026-04-03','2026-05-01',
  '2026-05-18','2026-06-08','2026-06-29','2026-07-20','2026-08-07','2026-08-17',
  '2026-10-12','2026-11-02','2026-11-16','2026-12-08','2026-12-25',
])

/** Fecha local como YYYY-MM-DD (sin pasar por UTC, que puede correr el día). */
export function claveFecha(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

export function esDiaHabil(d: Date): boolean {
  return d.getDay() !== 0 && !FESTIVOS.has(claveFecha(d))
}

/** Días hábiles del 1 al día `dia` (inclusive) del mes `mes` (1–12). */
export function diasHabilesHasta(anio: number, mes: number, dia: number): number {
  const d = new Date(anio, mes - 1, 1)
  let c = 0
  while (d.getMonth() === mes - 1 && d.getDate() <= dia) {
    if (esDiaHabil(d)) c++
    d.setDate(d.getDate() + 1)
  }
  return c
}

/** Días hábiles del mes completo. */
export function diasHabilesEnMes(anio: number, mes: number): number {
  return diasHabilesHasta(anio, mes, 31)
}

export interface AvanceMes {
  total: number
  transcurridos: number
  restantes: number
  /** El mes ya terminó en el calendario. */
  cerrado: boolean
  /** Fecha hasta la que se contaron los días (última factura cargada), solo en meses abiertos. */
  corte: Date | null
}

/**
 * Avance del mes en días hábiles.
 * - Mes cerrado: cuenta todos sus días hábiles.
 * - Mes abierto: cuenta hasta la última fecha con facturas cargadas (nunca después de hoy).
 *   Sin facturas cargadas aún, los días transcurridos son 0.
 */
export function avanceMes(anio: number, mes: number, ultimaFactura: Date | null, hoy = new Date()): AvanceMes {
  const total = diasHabilesEnMes(anio, mes)
  const finMes = new Date(anio, mes, 0)
  const cerrado = claveFecha(hoy) > claveFecha(finMes)
  if (cerrado) return { total, transcurridos: total, restantes: 0, cerrado, corte: null }

  const delMes = ultimaFactura
    && ultimaFactura.getFullYear() === anio
    && ultimaFactura.getMonth() === mes - 1
  const corte = delMes ? (ultimaFactura! > hoy ? hoy : ultimaFactura!) : null
  const transcurridos = corte ? diasHabilesHasta(anio, mes, corte.getDate()) : 0
  return { total, transcurridos, restantes: total - transcurridos, cerrado, corte }
}
