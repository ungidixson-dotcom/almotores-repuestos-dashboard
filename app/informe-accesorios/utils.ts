// ── Formatters ───────────────────────────────────────────────────────────────

export const fmtCOP = (n: number | null | undefined): string => {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)
}

export const fmtM = (n: number | null | undefined): string => {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)
}

export const fmtPct = (n: number | null | undefined, decimals = 1): string => {
  if (n == null) return '—'
  return `${n.toFixed(decimals)}%`
}

export const fmtNum = (n: number | null | undefined): string => {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CO').format(n)
}

// ── Delta helpers ─────────────────────────────────────────────────────────────

export interface Delta {
  valor: number
  pct: number
  positivo: boolean
}

export function calcDelta(actual: number | null, anterior: number | null): Delta | null {
  if (actual == null || anterior == null || anterior === 0) return null
  const valor = actual - anterior
  const pct   = (valor / anterior) * 100
  return { valor, pct, positivo: valor >= 0 }
}

export function fmtDelta(d: Delta | null, formato: 'cop' | 'num' | 'pct' = 'cop'): string {
  if (!d) return '—'
  const signo = d.positivo ? '+' : ''
  const val   = formato === 'cop' ? fmtM(d.valor)
              : formato === 'pct' ? fmtPct(d.valor)
              : fmtNum(d.valor)
  return `${signo}${val} (${signo}${d.pct.toFixed(1)}%)`
}

// ── Vitrina helpers ───────────────────────────────────────────────────────────

export const VITRINAS = ['Pasoancho', 'Calle 9', 'Norte', 'Pance'] as const
export type Vitrina = typeof VITRINAS[number]

export const VITRINA_COLORS: Record<string, string> = {
  'Pasoancho': '#3b82f6',
  'Calle 9':   '#10b981',
  'Norte':     '#a78bfa',
  'Pance':     '#f59e0b',
}

export const VITRINA_BG: Record<string, string> = {
  'Pasoancho': 'bg-blue-500/10 text-blue-300',
  'Calle 9':   'bg-emerald-500/10 text-emerald-300',
  'Norte':     'bg-violet-500/10 text-violet-300',
  'Pance':     'bg-amber-500/10 text-amber-300',
}

// ── Semáforo ──────────────────────────────────────────────────────────────────

export function semaforoVentas(pct: number | null): 'ok' | 'warn' | 'bad' {
  if (pct == null) return 'bad'
  if (pct >= 80) return 'ok'
  if (pct >= 45) return 'warn'
  return 'bad'
}

export function semaforoTicket(ticket: number | null, objetivo: number): 'ok' | 'warn' | 'bad' {
  if (ticket == null) return 'bad'
  if (ticket >= objetivo)      return 'ok'
  if (ticket >= objetivo * 0.7) return 'warn'
  return 'bad'
}

export const SEMAFORO_CLS: Record<string, string> = {
  ok:   'text-brand-teal',
  warn: 'text-brand-gold',
  bad:  'text-brand-red',
}

export const SEMAFORO_BADGE: Record<string, string> = {
  ok:   'bg-teal-500/10 text-teal-300',
  warn: 'bg-amber-500/10 text-amber-300',
  bad:  'bg-red-500/10 text-red-400',
}

// ── Meses ─────────────────────────────────────────────────────────────────────

export const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

export function mesAnterior(anio: number, mes: number): { anio: number; mes: number } {
  if (mes === 1) return { anio: anio - 1, mes: 12 }
  return { anio, mes: mes - 1 }
}
