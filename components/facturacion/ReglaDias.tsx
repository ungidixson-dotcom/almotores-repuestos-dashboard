import type { Estado } from '@/lib/semaforo'
import { fmtPct } from '@/lib/formato'
import { CIFRA, ESTADO_BG, GRILLA_REGLA } from './estilos'

export type VistaRegla = 'dias' | 'pct'

/** Posición horizontal (0–100%) de un porcentaje de presupuesto dentro de la escala. */
export const posicion = (pct: number, tope: number) => Math.min(100, Math.max(0, (pct / tope) * 100))

// ── Encabezado con la escala ────────────────────────────────────────────────

interface EscalaReglaProps {
  vista: VistaRegla
  /** Días hábiles del mes. */
  total: number
  /** Días hábiles transcurridos (solo se marca si el mes está abierto). */
  transcurridos: number
  cerrado: boolean
  tope: number
}

export function EscalaRegla({ vista, total, transcurridos, cerrado, tope }: EscalaReglaProps) {
  const meta = posicion(100, tope)
  const marcas: Array<{ x: number; label: string; fuerte?: boolean; alinear?: 'inicio' }> = []
  const ticks: Array<{ x: number; mayor: boolean; meta?: boolean }> = []

  if (vista === 'dias') {
    const mitad = Math.round(total / 2)
    for (let d = 1; d <= total; d++) ticks.push({ x: (d / total) * meta, mayor: d === mitad || d === total })
    marcas.push({ x: 0, label: 'Día 1', alinear: 'inicio' })
    // La marca de "hoy" solo se rotula si no choca con la del presupuesto.
    const rotularHoy = !cerrado && transcurridos > 0 && transcurridos <= total * 0.8
    if (!rotularHoy) marcas.push({ x: (mitad / total) * meta, label: `Día ${mitad}` })
    else marcas.push({ x: (transcurridos / total) * meta, label: `Hoy, día ${transcurridos}` })
    marcas.push({ x: meta, label: `Presupuesto, día ${total}`, fuerte: true })
  } else {
    for (let q = 0; q <= tope; q += 50) {
      const x = posicion(q, tope)
      ticks.push({ x, mayor: true, meta: q === 100 })
      marcas.push({ x, label: `${q}%`, fuerte: q === 100, alinear: q === 0 ? 'inicio' : undefined })
    }
  }

  return (
    <div className={`${GRILLA_REGLA} hidden md:grid items-end pb-1.5`} aria-hidden="true">
      <span />
      <div className="relative h-[22px]">
        {ticks.map((t, i) => (
          <span key={i} className={`absolute bottom-0 w-px ${t.mayor ? 'h-2' : 'h-[5px]'} ${t.meta ? 'bg-brand-text' : t.mayor ? 'bg-brand-muted-2' : 'bg-brand-line-2'}`}
            style={{ left: `${t.x}%` }} />
        ))}
        {marcas.map(m => (
          <span key={m.label}
            className={`absolute bottom-2.5 whitespace-nowrap text-[11px] ${m.fuerte ? 'font-semibold text-brand-text' : 'text-brand-muted-2'} ${m.alinear === 'inicio' ? '' : '-translate-x-1/2'}`}
            style={{ left: `${m.x}%` }}>
            {m.label}
          </span>
        ))}
      </div>
      <span className="text-right text-xs text-brand-muted-2">Diferencia</span>
    </div>
  )
}

// ── Barra de cumplimiento ───────────────────────────────────────────────────

interface BarraCumplimientoProps {
  pct: number
  estado: Estado
  tope: number
  /** % del presupuesto que se esperaba a la fecha (mes abierto). null en mes cerrado. */
  esperado: number | null
  tamano?: 'fila' | 'total' | 'chica'
  /** Mostrar el porcentaje junto a la barra. */
  etiqueta?: boolean
}

const ALTO = {
  fila:  { caja: 'h-[18px]', pista: 'inset-y-[7px]', barra: 'inset-y-[3px]', linea: '-inset-y-1.5', texto: 'text-[13px]' },
  total: { caja: 'h-[22px]', pista: 'inset-y-2',     barra: 'inset-y-1',     linea: '-inset-y-1.5', texto: 'text-sm' },
  chica: { caja: 'h-2.5',    pista: 'inset-y-[3px]', barra: 'inset-y-0',     linea: '-inset-y-[3px]', texto: 'text-xs' },
} as const

export function BarraCumplimiento({ pct, estado, tope, esperado, tamano = 'fila', etiqueta = true }: BarraCumplimientoProps) {
  const a = ALTO[tamano]
  const x = posicion(pct, tope)
  const dentro = x > 88
  return (
    <span className={`relative block ${a.caja}`}>
      <span className={`absolute inset-x-0 ${a.pista} rounded-sm bg-brand-track`} />
      <span className={`absolute left-0 ${a.barra} rounded-[3px] ${ESTADO_BG[estado]} motion-safe:transition-[width] motion-safe:duration-700`}
        style={{ width: `${x}%` }} />
      {esperado !== null && (
        <span className={`absolute ${a.linea} w-0 border-l-2 border-dashed border-brand-muted-2`}
          style={{ left: `${posicion(esperado, tope)}%` }} />
      )}
      <span className={`absolute ${a.linea} w-0.5 bg-brand-text`} style={{ left: `${posicion(100, tope)}%` }} />
      {etiqueta && (
        <span className={`absolute top-1/2 -translate-y-1/2 [text-shadow:0_0_3px_#0F1419] ${CIFRA} ${a.texto} ${dentro ? '[text-shadow:none] ' : ''}${dentro ? 'text-brand-bg' : 'text-brand-text'}`}
          style={dentro ? { right: `calc(${100 - x}% + 8px)` } : { left: `calc(${x}% + 8px)` }}>
          {fmtPct(pct)}
        </span>
      )}
    </span>
  )
}
