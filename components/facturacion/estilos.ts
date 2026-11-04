import type { Estado } from '@/lib/semaforo'

// Clases compartidas de Facturación General. Escritas completas para que Tailwind las detecte.

/** Cifras grandes: Archivo condensada con números tabulares. */
export const CIFRA = 'font-cifra [font-stretch:85%] font-semibold tabular-nums'

export const ESTADO_BG: Record<Estado, string> = {
  ok:     'bg-estado-ok',
  alerta: 'bg-estado-alerta',
  riesgo: 'bg-estado-riesgo',
}

export const ESTADO_TEXT: Record<Estado, string> = {
  ok:     'text-estado-ok',
  alerta: 'text-estado-alerta',
  riesgo: 'text-estado-riesgo',
}

export const ESTADO_BORDER: Record<Estado, string> = {
  ok:     'border-estado-ok',
  alerta: 'border-estado-alerta',
  riesgo: 'border-estado-riesgo',
}

/** Grilla de las filas de la regla: nombre · barra · diferencia (en celular, la barra baja a su propia línea). */
export const GRILLA_REGLA =
  'grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[200px_minmax(0,1fr)_120px] gap-x-4 gap-y-2 items-center'
