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

interface CanalIconProps {
  canal: Canal
  size?: number
  className?: string
}

export function CanalIcon({ canal, size = 14, className = '' }: CanalIconProps) {
  const Icon = CANAL_ICON[canal]
  return <Icon size={size} className={className} aria-hidden="true" />
}
