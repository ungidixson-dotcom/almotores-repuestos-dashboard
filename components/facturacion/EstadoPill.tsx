import { ESTADO_LABEL, type Estado } from '@/lib/semaforo'
import { ESTADO_BORDER, ESTADO_TEXT } from './estilos'

interface EstadoPillProps {
  estado: Estado
  /** Texto en lugar del nombre del estado (p. ej. el porcentaje). */
  children?: React.ReactNode
}

/** Píldora del semáforo oficial. Siempre lleva texto: el color nunca va solo. */
export function EstadoPill({ estado, children }: EstadoPillProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[13px] font-semibold whitespace-nowrap ${ESTADO_TEXT[estado]} ${ESTADO_BORDER[estado]}`}>
      {children ?? ESTADO_LABEL[estado]}
    </span>
  )
}
