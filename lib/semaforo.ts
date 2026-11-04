// Semáforo oficial de cumplimiento contra presupuesto. Fuente única para toda la app.
//   Cumplió:    100% o más
//   Aceptable:  80% a 99%
//   Deficiente: menos de 80%

export type Estado = 'ok' | 'alerta' | 'riesgo'

export const UMBRAL_CUMPLIO = 100
export const UMBRAL_ACEPTABLE = 80

export const ESTADO_LABEL: Record<Estado, string> = {
  ok:     'Cumplió',
  alerta: 'Aceptable',
  riesgo: 'Deficiente',
}

/** Colores del semáforo (hex), iguales a los tokens `estado-*` de Tailwind. */
export const ESTADO_COLOR: Record<Estado, string> = {
  ok:     '#4FD1C5',
  alerta: '#E8A33D',
  riesgo: '#F2555A',
}

/** Estado para un porcentaje de cumplimiento (0–100+). */
export function estadoDe(pct: number): Estado {
  if (pct >= UMBRAL_CUMPLIO) return 'ok'
  if (pct >= UMBRAL_ACEPTABLE) return 'alerta'
  return 'riesgo'
}
