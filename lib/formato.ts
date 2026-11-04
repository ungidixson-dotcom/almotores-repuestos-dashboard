// Formatos de cifras en español de Colombia. Redondean solo para mostrar: nunca alteran el valor calculado.

const NUM = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const DEC1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** $1.432.085.141 · negativos con signo menos tipográfico. */
export function fmtCOP(v: number): string {
  return `${v < 0 ? '−' : ''}$${NUM.format(Math.abs(v))}`
}

/** Pesos con signo explícito: +$12.000 / −$12.000. */
export function fmtCOPSigno(v: number): string {
  return `${v < 0 ? '−' : '+'}$${NUM.format(Math.abs(v))}`
}

/** 83,7% */
export function fmtPct(v: number): string {
  return `${DEC1.format(v)}%`
}

/** +12,9 días / −5,8 días */
export function fmtDias(v: number): string {
  const n = Math.abs(v) < 0.05 ? 0 : v
  return `${n < 0 ? '−' : '+'}${DEC1.format(Math.abs(n))} días`
}

/** Millones enteros: 278 */
export function fmtMillones(v: number): string {
  return NUM.format(Math.round(Math.abs(v) / 1e6))
}

/** 30 oct */
export function fmtFechaCorta(d: Date): string {
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '')
}
