import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { CIFRA } from './estilos'

export interface Kpi {
  titulo: string
  valor: number
  formato: (v: number) => string
  /** Píldora junto a la cifra (estado, margen…). */
  pill?: React.ReactNode
  detalle?: React.ReactNode
}

/** Banda de cifras del mes: separadas por líneas, sin cajas. */
export function BandaKpi({ items }: { items: Kpi[] }) {
  return (
    <section aria-label="Cifras del mes"
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] border-y border-brand-line">
      {items.map((k, i) => (
        <div key={k.titulo}
          className={`flex flex-col gap-2 py-5 ${i === 0 ? 'pr-6' : 'border-brand-line px-6 max-md:border-t max-md:px-0 md:border-l'}`}>
          <span className="text-[13px] text-brand-muted-2">{k.titulo}</span>
          <div className="flex flex-wrap items-center gap-2.5">
            <AnimatedNumber value={k.valor} format={k.formato} className={`text-[34px] leading-none ${CIFRA}`} />
            {k.pill}
          </div>
          {k.detalle && <span className="text-[13px] text-brand-muted-2">{k.detalle}</span>}
        </div>
      ))}
    </section>
  )
}
