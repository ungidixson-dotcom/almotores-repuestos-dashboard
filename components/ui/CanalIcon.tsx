import { CarFront, Gavel, Gift, Package, ShoppingCart, Wrench, type LucideIcon } from 'lucide-react'

/** Canales de facturación, con el mismo texto que devuelve la vista v_facturacion_general. */
export type Canal = 'Taller' | 'Colisión' | 'Accesorios' | 'Mostrador' | 'Mayoristas' | 'Subastas'

/** Icono oficial de cada canal. Fuente única: no usar emojis ni otros iconos por canal. */
export const CANAL_ICON: Record<Canal, LucideIcon> = {
  Taller:     Wrench,
  Colisión:   CarFront,
  Accesorios: Gift,
  Mostrador:  ShoppingCart,
  Mayoristas: Package,
  Subastas:   Gavel,
}

/**
 * Movimiento propio de cada canal (keyframes en globals.css).
 * Clases escritas completas para que Tailwind las detecte:
 * `load` se reproduce una vez al montar; `hover` al pasar el mouse sobre el `group` padre.
 */
const CANAL_ANIMATION: Record<Canal, { load: string; hover: string }> = {
  Taller:     { load: 'motion-safe:animate-canal-taller',     hover: 'motion-safe:group-hover:animate-canal-taller' },
  Colisión:   { load: 'motion-safe:animate-canal-colision',   hover: 'motion-safe:group-hover:animate-canal-colision' },
  Accesorios: { load: 'motion-safe:animate-canal-accesorios', hover: 'motion-safe:group-hover:animate-canal-accesorios' },
  Mostrador:  { load: 'motion-safe:animate-canal-mostrador',  hover: 'motion-safe:group-hover:animate-canal-mostrador' },
  Mayoristas: { load: 'motion-safe:animate-canal-mayoristas', hover: 'motion-safe:group-hover:animate-canal-mayoristas' },
  Subastas:   { load: 'motion-safe:animate-canal-subastas',   hover: 'motion-safe:group-hover:animate-canal-subastas' },
}

interface CanalIconProps {
  canal: Canal
  size?: number
  className?: string
  /** Color del trazo (hex). Si se omite, hereda el color del texto. */
  color?: string
  /** Anima el icono al montarse y al pasar el mouse sobre el contenedor con clase `group`. */
  animated?: boolean
  /** Retraso de la animación inicial, para escalonar varios iconos. */
  delayMs?: number
}

export function CanalIcon({ canal, size = 14, className = '', color, animated = false, delayMs = 0 }: CanalIconProps) {
  const Icon = CANAL_ICON[canal]
  const icon = <Icon size={size} className={className} color={color} aria-hidden="true" />
  if (!animated) return icon

  const anim = CANAL_ANIMATION[canal]
  // Dos capas: la animación de carga y la de hover viven en elementos distintos,
  // así el hover puede repetirse aunque la de carga ya haya terminado.
  return (
    <span className={`inline-flex ${anim.hover}`}>
      <span className={`inline-flex ${anim.load}`} style={{ animationDelay: `${delayMs}ms` }}>
        {icon}
      </span>
    </span>
  )
}
