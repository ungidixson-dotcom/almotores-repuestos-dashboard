'use client'
import type { InformeResumen, InformeVitrina } from '../types'
import { fmtM, fmtPct, fmtNum, calcDelta, fmtDelta, VITRINAS } from '../utils'
import { KpiCard, VitrinaBadge, DeltaBadge } from './Shared'

interface Props {
  actual:          InformeResumen | null
  mesAnterior:     InformeResumen | null
  anioAnterior:    InformeResumen | null
  vitrinasAct:     InformeVitrina[]
  vitrinasMesAnt:  InformeVitrina[]
  vitrinasAnioAnt: InformeVitrina[]
}

interface FilaComp {
  label:     string
  actual:    string
  mesAnt:    string | null
  deltaMes:  ReturnType<typeof calcDelta>
  anioAnt:   string | null
  deltaAnio: ReturnType<typeof calcDelta>
}

function buildFilas(
  act: InformeResumen | null,
  mAnt: InformeResumen | null,
  aAnt: InformeResumen | null
): FilaComp[] {
  if (!act) return []
  return [
    {
      label:     'Ventas netas',
      actual:    fmtM(act.ventas_neto),
      mesAnt:    mAnt ? fmtM(mAnt.ventas_neto) : null,
      deltaMes:  calcDelta(act.ventas_neto, mAnt?.ventas_neto ?? null),
      anioAnt:   aAnt ? fmtM(aAnt.ventas_neto) : null,
      deltaAnio: calcDelta(act.ventas_neto, aAnt?.ventas_neto ?? null),
    },
    {
      label:     'Vehículos',
      actual:    fmtNum(act.vehiculos),
      mesAnt:    mAnt ? fmtNum(mAnt.vehiculos) : null,
      deltaMes:  calcDelta(act.vehiculos, mAnt?.vehiculos ?? null),
      anioAnt:   aAnt ? fmtNum(aAnt.vehiculos) : null,
      deltaAnio: calcDelta(act.vehiculos, aAnt?.vehiculos ?? null),
    },
    {
      label:     'Ticket promedio',
      actual:    fmtM(act.ticket_promedio),
      mesAnt:    mAnt ? fmtM(mAnt.ticket_promedio) : null,
      deltaMes:  calcDelta(act.ticket_promedio, mAnt?.ticket_promedio ?? null),
      anioAnt:   aAnt ? fmtM(aAnt.ticket_promedio) : null,
      deltaAnio: calcDelta(act.ticket_promedio, aAnt?.ticket_promedio ?? null),
    },
    {
      label:     'Facturas',
      actual:    fmtNum(act.facturas),
      mesAnt:    mAnt ? fmtNum(mAnt.facturas) : null,
      deltaMes:  calcDelta(act.facturas, mAnt?.facturas ?? null),
      anioAnt:   aAnt ? fmtNum(aAnt.facturas) : null,
      deltaAnio: calcDelta(act.facturas, aAnt?.facturas ?? null),
    },
    {
      label:     'Comercial VN',
      actual:    fmtM(act.comercial_vn),
      mesAnt:    mAnt ? fmtM(mAnt.comercial_vn) : null,
      deltaMes:  calcDelta(act.comercial_vn, mAnt?.comercial_vn ?? null),
      anioAnt:   aAnt ? fmtM(aAnt.comercial_vn) : null,
      deltaAnio: calcDelta(act.comercial_vn, aAnt?.comercial_vn ?? null),
    },
    {
      label:     'Accesorios directos',
      actual:    fmtM(act.accesorios),
      mesAnt:    mAnt ? fmtM(mAnt.accesorios) : null,
      deltaMes:  calcDelta(act.accesorios, mAnt?.accesorios ?? null),
      anioAnt:   aAnt ? fmtM(aAnt.accesorios) : null,
      deltaAnio: calcDelta(act.accesorios, aAnt?.accesorios ?? null),
    },
    {
      label:     'Taller',
      actual:    fmtM(act.taller),
      mesAnt:    mAnt ? fmtM(mAnt.taller) : null,
      deltaMes:  calcDelta(act.taller, mAnt?.taller ?? null),
      anioAnt:   aAnt ? fmtM(aAnt.taller) : null,
      deltaAnio: calcDelta(act.taller, aAnt?.taller ?? null),
    },
    {
      label:     'Comisiones',
      actual:    fmtM(act.comisiones),
      mesAnt:    mAnt ? fmtM(mAnt.comisiones) : null,
      deltaMes:  calcDelta(act.comisiones, mAnt?.comisiones ?? null),
      anioAnt:   aAnt ? fmtM(aAnt.comisiones) : null,
      deltaAnio: calcDelta(act.comisiones, aAnt?.comisiones ?? null),
    },
  ]
}

function DeltaCell({ d }: { d: ReturnType<typeof calcDelta> }) {
  if (!d) return <td className="px-3 py-2 text-brand-muted text-xs text-right">—</td>
  const cls = d.positivo ? 'text-brand-teal' : 'text-brand-red'
  const signo = d.positivo ? '+' : ''
  return (
    <td className={`px-3 py-2 text-xs text-right font-medium ${cls}`}>
      {signo}{d.pct.toFixed(1)}%
    </td>
  )
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function TabComparativo({
  actual, mesAnterior, anioAnterior,
  vitrinasAct, vitrinasMesAnt, vitrinasAnioAnt,
}: Props) {

  if (!actual) {
    return <p className="text-brand-muted text-sm py-8 text-center">Sin datos para el período seleccionado.</p>
  }

  const filas = buildFilas(actual, mesAnterior, anioAnterior)
  const labelMesAnt  = mesAnterior  ? mesAnterior.mes  : 'Mes anterior'
  const labelAnioAnt = anioAnterior ? `${anioAnterior.mes} ${anioAnterior.anio}` : 'Año anterior'

  // Mapa vitrina → dato para comparativos
  const mapVit = (arr: InformeVitrina[]) =>
    Object.fromEntries(arr.map(v => [v.vitrina, v]))

  const actMap  = mapVit(vitrinasAct)
  const mAntMap = mapVit(vitrinasMesAnt)
  const aAntMap = mapVit(vitrinasAnioAnt)

  return (
    <div className="space-y-6">

      {/* KPIs delta rápidos */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="Ventas netas"
          value={fmtM(actual.ventas_neto)}
          delta={fmtDelta(calcDelta(actual.ventas_neto, mesAnterior?.ventas_neto ?? null))}
          deltaPositivo={calcDelta(actual.ventas_neto, mesAnterior?.ventas_neto ?? null)?.positivo}
          sub={`vs ${labelMesAnt}`}
        />
        <KpiCard
          label="Vehículos"
          value={fmtNum(actual.vehiculos)}
          delta={fmtDelta(calcDelta(actual.vehiculos, mesAnterior?.vehiculos ?? null), 'num')}
          deltaPositivo={calcDelta(actual.vehiculos, mesAnterior?.vehiculos ?? null)?.positivo}
          sub={`vs ${labelMesAnt}`}
        />
        <KpiCard
          label="Ticket promedio"
          value={fmtM(actual.ticket_promedio)}
          delta={fmtDelta(calcDelta(actual.ticket_promedio, mesAnterior?.ticket_promedio ?? null))}
          deltaPositivo={calcDelta(actual.ticket_promedio, mesAnterior?.ticket_promedio ?? null)?.positivo}
          sub={`vs ${labelMesAnt}`}
        />
        <KpiCard
          label="Comisiones"
          value={fmtM(actual.comisiones)}
          delta={fmtDelta(calcDelta(actual.comisiones, mesAnterior?.comisiones ?? null))}
          deltaPositivo={calcDelta(actual.comisiones, mesAnterior?.comisiones ?? null)?.positivo}
          sub={`vs ${labelMesAnt}`}
        />
      </div>

      {/* Tabla global mes actual vs mes anterior vs año anterior */}
      <div>
        <p className="text-xs font-medium text-brand-muted uppercase tracking-widest mb-2">
          Métricas globales
        </p>
        <div className="border border-brand-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-left bg-brand-surface">Métrica</th>
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-right bg-brand-surface">{actual.mes} {actual.anio}</th>
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-right bg-brand-surface">{labelMesAnt}</th>
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-right bg-brand-surface">Δ mes</th>
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-right bg-brand-surface">{labelAnioAnt}</th>
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-right bg-brand-surface">Δ año</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-b border-brand-border last:border-0 hover:bg-brand-surface/50">
                  <td className="px-3 py-2 text-brand-text font-medium">{f.label}</td>
                  <td className="px-3 py-2 font-mono text-brand-text text-right">{f.actual}</td>
                  <td className="px-3 py-2 font-mono text-brand-muted text-right">{f.mesAnt ?? '—'}</td>
                  <DeltaCell d={f.deltaMes} />
                  <td className="px-3 py-2 font-mono text-brand-muted text-right">{f.anioAnt ?? '—'}</td>
                  <DeltaCell d={f.deltaAnio} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla por vitrina */}
      <div>
        <p className="text-xs font-medium text-brand-muted uppercase tracking-widest mb-2">
          Ventas por vitrina — comparativo
        </p>
        <div className="border border-brand-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-left bg-brand-surface">Vitrina</th>
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-right bg-brand-surface">Actual</th>
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-right bg-brand-surface">{labelMesAnt}</th>
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-right bg-brand-surface">Δ mes</th>
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-right bg-brand-surface">{labelAnioAnt}</th>
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-right bg-brand-surface">Δ año</th>
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-right bg-brand-surface">Veh act.</th>
                <th className="px-3 py-2 text-xs text-brand-muted uppercase tracking-widest text-right bg-brand-surface">Ticket act.</th>
              </tr>
            </thead>
            <tbody>
              {VITRINAS.map(vit => {
                const a  = actMap[vit]
                const ma = mAntMap[vit]
                const aa = aAntMap[vit]
                const dMes  = calcDelta(a?.ventas_neto ?? null, ma?.ventas_neto ?? null)
                const dAnio = calcDelta(a?.ventas_neto ?? null, aa?.ventas_neto ?? null)
                return (
                  <tr key={vit} className="border-b border-brand-border last:border-0 hover:bg-brand-surface/50">
                    <td className="px-3 py-2"><VitrinaBadge vitrina={vit} /></td>
                    <td className="px-3 py-2 font-mono text-brand-text text-right">{fmtM(a?.ventas_neto)}</td>
                    <td className="px-3 py-2 font-mono text-brand-muted text-right">{fmtM(ma?.ventas_neto)}</td>
                    <DeltaCell d={dMes} />
                    <td className="px-3 py-2 font-mono text-brand-muted text-right">{fmtM(aa?.ventas_neto)}</td>
                    <DeltaCell d={dAnio} />
                    <td className="px-3 py-2 font-mono text-brand-muted text-right">{fmtNum(a?.vehiculos)}</td>
                    <td className="px-3 py-2 font-mono text-brand-muted text-right">{fmtM(a?.ticket_promedio)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {(!mesAnterior && !anioAnterior) && (
          <p className="text-xs text-brand-muted mt-2 text-center">
            Sin datos de períodos anteriores para comparar.
          </p>
        )}
      </div>
    </div>
  )
}
