// Tokens de animación compartidos.
// Toda animación de la app debe tomar duraciones y curvas de aquí,
// igual que los colores salen de las clases brand-*.

/** Duraciones en milisegundos. */
export const MOTION_DURATION = {
  fast: 150,
  base: 300,
  /** Conteo de cifras KPI: suficiente para notarse, corto para no estorbar la lectura. */
  number: 800,
} as const

/** Curvas de aceleración: reciben progreso 0–1 y devuelven progreso 0–1. */
export const MOTION_EASE = {
  /** Arranca rápido y frena suave (ease-out exponencial): el valor final se "asienta". */
  out: (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
} as const
