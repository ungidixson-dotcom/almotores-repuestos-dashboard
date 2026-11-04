import Link from 'next/link'
import { CanalIcon, CANAL_COLOR, type Canal } from '@/components/ui/CanalIcon'
import { ExpandChevron } from '@/components/ui/ExpandChevron'
import type { Metricas } from '@/lib/facturacionGeneral'
import { fmtCOP, fmtCOPSigno, fmtDias, fmtPct } from '@/lib/formato'
import { BarraCumplimiento, type VistaRegla } from './ReglaDias'
import { EstadoPill } from './EstadoPill'
import { CIFRA, ESTADO_TEXT, GRILLA_REGLA } from './estilos'

export interface SedeCanal {
  sede: string
  m: Metricas
}

interface Escala {
  tope: number
  /** % del presupuesto esperado a la fecha; null en mes cerrado. */
  esperado: number | null
  cerrado: boolean
}

function IconoCanal({ canal, grande = false }: { canal: Canal; grande?: boolean }) {
  return (
    <span className={`flex flex-none items-center justify-center bg-brand-tile ${grande ? 'h-11 w-11 rounded-xl' : 'h-8 w-8 rounded-[9px]'}`}>
      <CanalIcon canal={canal} size={grande ? 20 : 16} color={CANAL_COLOR[canal]} />
    </span>
  )
}

// ── Fila de la regla (botón que abre la tarjeta) ────────────────────────────

interface FilaCanalProps {
  canal: Canal
  m: Metricas
  vista: VistaRegla
  escala: Escala
  abierto: boolean
  onToggle: () => void
  idTarjeta: string
}

export function FilaCanal({ canal, m, vista, escala, abierto, onToggle, idTarjeta }: FilaCanalProps) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={abierto} aria-controls={idTarjeta}
      className={`${GRILLA_REGLA} group min-h-14 w-full rounded-lg border-t border-brand-track px-1 py-2 text-left transition-colors hover:bg-brand-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text ${abierto ? 'bg-brand-card' : ''}`}>
      <span className="flex min-w-0 items-center gap-2.5">
        <IconoCanal canal={canal} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-text">
            {canal}
            <span className="text-brand-muted-2"><ExpandChevron open={abierto} size={13} /></span>
          </span>
          <span className="text-xs tabular-nums text-brand-muted-2">{fmtCOP(m.neto)}</span>
        </span>
      </span>
      <span className="col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1">
        <BarraCumplimiento pct={m.pct} estado={m.estado} tope={escala.tope} esperado={escala.esperado} />
      </span>
      <span className={`col-start-2 row-start-1 text-right text-[15px] md:col-start-3 ${CIFRA} ${ESTADO_TEXT[m.estado]}`}>
        {vista === 'dias' ? fmtDias(m.difDias) : fmtCOPSigno(m.difPesos)}
      </span>
    </button>
  )
}

// ── Tarjeta expandida ───────────────────────────────────────────────────────

interface TarjetaCanalProps {
  canal: Canal
  m: Metricas
  subtitulo: string
  sedes: SedeCanal[]
  escala: Escala
  href: string
  id: string
}

function Dato({ titulo, valor, detalle, valorClase = '' }: { titulo: string; valor: React.ReactNode; detalle?: React.ReactNode; valorClase?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-brand-muted-2">{titulo}</span>
      <span className={`text-base font-semibold tabular-nums ${valorClase}`}>{valor}</span>
      {detalle && <span className="text-xs text-brand-muted-2">{detalle}</span>}
    </div>
  )
}

export function TarjetaCanal({ canal, m, subtitulo, sedes, escala, href, id }: TarjetaCanalProps) {
  const sufijo = escala.cerrado ? '' : ' a la fecha'
  const difClase = m.difPesos >= 0 ? 'text-estado-ok' : 'text-estado-riesgo'
  return (
    <article id={id} className="mb-3 mt-1 flex flex-col gap-[18px] rounded-[14px] border border-[#2A3644] border-t-[3px] bg-brand-card p-5"
      style={{ borderTopColor: CANAL_COLOR[canal] }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconoCanal canal={canal} grande />
          <div className="flex flex-col gap-0.5">
            <h3 className="text-lg font-semibold text-brand-text">{canal}</h3>
            <span className="text-[13px] text-brand-muted-2">{subtitulo}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <EstadoPill estado={m.estado} />
          <Link href={href} className="text-[13px] font-semibold text-brand-text underline-offset-4 hover:underline">
            Abrir página de {canal}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-brand-muted-2">Cumplimiento</span>
          <span className={`text-4xl leading-none ${CIFRA}`}>{fmtPct(m.pct)}</span>
        </div>
        <Dato titulo="Facturado" valor={fmtCOP(m.neto)} detalle={`de ${fmtCOP(m.ppto)}`} />
        <Dato titulo={`Diferencia${sufijo}`} valor={fmtCOPSigno(m.difPesos)} valorClase={difClase} detalle={fmtDias(m.difDias)} />
        <Dato titulo="Utilidad" valor={fmtCOP(m.util)} detalle={`Margen ${fmtPct(m.margen)}`} />
        {!escala.cerrado && (
          <Dato titulo="Cierre proyectado" valor={fmtCOP(m.pron)} valorClase={ESTADO_TEXT[m.estado]}
            detalle={m.neces > 0 ? `Necesita ${fmtCOP(m.neces)} por día` : 'Presupuesto alcanzado'} />
        )}
      </div>

      {sedes.length > 0 && (
        <div className="flex flex-col gap-2.5 border-t border-brand-line pt-3.5">
          <span className="text-[13px] text-brand-muted-2">Por sede</span>
          {sedes.map(s => (
            <div key={s.sede}
              className="grid grid-cols-[90px_minmax(0,1fr)_64px] items-center gap-3 text-[13px] tabular-nums md:grid-cols-[110px_minmax(0,1fr)_70px_130px_110px]">
              <span className="font-semibold">{s.sede}</span>
              <BarraCumplimiento pct={s.m.pct} estado={s.m.estado} tope={escala.tope} esperado={escala.esperado} tamano="chica" etiqueta={false} />
              <span className={`text-right font-semibold ${ESTADO_TEXT[s.m.estado]}`}>{fmtPct(s.m.pct)}</span>
              <span className="hidden text-right md:block">{fmtCOP(s.m.neto)}</span>
              <span className={`hidden text-right md:block ${ESTADO_TEXT[s.m.estado]}`}>{fmtDias(s.m.difDias)}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
