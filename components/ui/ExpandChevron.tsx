import { ChevronRight } from 'lucide-react'

interface ExpandChevronProps {
  open: boolean
  size?: number
}

/** Flecha de menú desplegable: gira suavemente al abrir/cerrar en lugar de cambiar de icono. */
export function ExpandChevron({ open, size = 14 }: ExpandChevronProps) {
  return (
    <ChevronRight
      size={size}
      aria-hidden="true"
      className={`shrink-0 motion-safe:transition-transform motion-safe:duration-300 ${open ? 'rotate-90' : ''}`}
    />
  )
}
