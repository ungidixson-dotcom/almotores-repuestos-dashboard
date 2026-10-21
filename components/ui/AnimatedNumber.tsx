'use client'
import { useEffect, useRef, useState } from 'react'
import { MOTION_DURATION, MOTION_EASE } from '@/lib/motion'
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion'

interface AnimatedNumberProps {
  /** Valor real, tal como viene del cálculo. Es el que queda en pantalla al terminar. */
  value: number
  /** Formateador de la página (fmtCOP, fmtPct…). Se aplica también a los valores intermedios. */
  format: (value: number) => string
  className?: string
}

/**
 * Muestra una cifra que cuenta desde su valor anterior hasta el nuevo.
 *
 * Garantías para datos financieros:
 * - El valor final mostrado es siempre exactamente `format(value)`.
 * - Lectores de pantalla reciben solo el valor final, nunca los intermedios.
 * - Con "reducir movimiento" activo en el sistema, se muestra el valor sin animar.
 */
export function AnimatedNumber({ value, format, className = '' }: AnimatedNumberProps) {
  const reduceMotion = usePrefersReducedMotion()
  const [display, setDisplay] = useState(0)
  // Último valor pintado: si llega un nuevo valor a mitad de animación,
  // se continúa desde donde iba en lugar de saltar.
  const displayed = useRef(0)

  useEffect(() => {
    const paint = (v: number) => {
      displayed.current = v
      setDisplay(v)
    }

    const from = displayed.current
    if (reduceMotion || !Number.isFinite(value) || from === value) {
      paint(value)
      return
    }

    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MOTION_DURATION.number)
      // En el último cuadro se pinta `value` tal cual, sin aritmética de por medio.
      paint(t >= 1 ? value : from + (value - from) * MOTION_EASE.out(t))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, reduceMotion])

  return (
    <span className={`tabular-nums ${className}`}>
      <span aria-hidden="true">{format(display)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
