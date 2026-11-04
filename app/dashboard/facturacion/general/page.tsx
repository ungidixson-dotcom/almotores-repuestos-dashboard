'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { CanalIcon, CANAL_COLOR, esCanal, type Canal } from '@/components/ui/CanalIcon'
import { avanceMes, type AvanceMes } from '@/lib/diasHabiles'
import { metricas, topeEscala, type FilaFacturacion, type Metricas } from '@/lib/facturacionGeneral'
import { fmtCOP, fmtCOPSigno, fmtDias, fmtFechaCorta, fmtMillones, fmtPct } from '@/lib/formato'
import { BandaKpi, type Kpi } from '@/components/facturacion/BandaKpi'
import { EstadoPill } from '@/components/facturacion/EstadoPill'
import { EscalaRegla, BarraCumplimiento, type VistaRegla } from '@/components/facturacion/ReglaDias'
import { FilaCanal, TarjetaCanal, type SedeCanal } from '@/components/facturacion/TarjetaCanal'
import { CIFRA, ESTADO_TEXT, GRILLA_REGLA } from '@/components/facturacion/estilos'

// ── Constantes ───────────────────────────────────────────────────────────────
const MESES_KEY = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
]
const MESES_LABEL = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const SEDES_INDIVIDUALES = ['Norte', 'Pasoancho', 'Sede 39']
const CANALES: Canal[] = ['Taller', 'Colisión', 'Accesorios', 'Mostrador', 'Mayoristas', 'Subastas']
const CANAL_HREF: Record<Canal, string> = {
  Taller:     '/dashboard/facturacion/canales/taller',
  Colisión:   '/dashboard/facturacion/canales/colision',
  Accesorios: '/dashboard/facturacion/canales/accesorios',
  Mostrador:  '/dashboard/facturacion/canales/mostrador',
  Mayoristas: '/dashboard/facturacion/canales/mayoristas',
  Subastas:   '/dashboard/facturacion/canales/subastas',
}

interface UltimaFecha { anio: number; mes: string; ultima_fecha: string }
interface CanalCalculado { canal: Canal; m: Metricas; sedes: SedeCanal[] }

/** 'YYYY-MM-DD' como fecha local (sin desfase de zona horaria). */
const fechaLocal = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const dec1 = (v: number) => v.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// ── Frase principal ──────────────────────────────────────────────────────────
function textoConclusion(t: Metricas, a: AvanceMes): string {
  if (!t.ppto) return `Se facturaron ${fmtCOP(t.neto)}. Este mes no tiene presupuesto cargado.`
  const dias = dec1(Math.abs(t.difDias))
  if (a.cerrado) {
    return t.neto < t.ppto
      ? `Se facturó el ${fmtPct(t.pct)} del presupuesto. Faltaron $${fmtMillones(t.ppto - t.neto)} millones: lo que se factura en ${dias} días hábiles.`
      : `Se facturó el ${fmtPct(t.pct)} del presupuesto. Se superó en $${fmtMillones(t.neto - t.ppto)} millones: ${dias} días hábiles de ventaja.`
  }
  const pctMes = (a.transcurridos / a.total) * 100
  const cierre = t.pron >= t.ppto
    ? `$${fmtMillones(t.pron - t.ppto)} millones por encima`
    : `$${fmtMillones(t.ppto - t.pron)} millones por debajo`
  return `Va el ${fmtPct(t.pct)} del presupuesto con el ${fmtPct(pctMes)} del mes. A este ritmo cerraría en el ${fmtPct(t.pctPron)}, ${cierre}.`
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function FacGeneralPage() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes,  setMes]  = useState(hoy.getMonth() + 1)
  const [sedes, setSedes] = useState<Set<string>>(new Set(['Todas']))
  const [sinColision, setSinColision] = useState(false)
  const [vista, setVista] = useState<VistaRegla>('dias')
  const [abierto, setAbierto] = useState<Canal | null>(null)

  const [filas,   setFilas]   = useState<FilaFacturacion[]>([])
  const [ultimas, setUltimas] = useState<UltimaFecha[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [ultimaAct, setUltimaAct] = useState<Date | null>(null)

  const toggleSede = (s: string) => {
    setSedes(prev => {
      if (s === 'Todas') return new Set(['Todas'])
      const next = new Set(prev)
      next.delete('Todas')
      if (next.has(s)) next.delete(s)
      else next.add(s)
      if (next.size === 0 || SEDES_INDIVIDUALES.every(i => next.has(i))) return new Set(['Todas'])
      return next
    })
  }
  const todasActivo = sedes.has('Todas')

  // ── Carga desde Supabase ──────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [fact, fechas] = await Promise.all([
        supabase
          .from('v_facturacion_general')
          .select('canal, sede, mes, anio, neto, costo, presupuesto')
          .eq('anio', anio),
        supabase
          .from('v_facturacion_ultima_fecha')
          .select('anio, mes, ultima_fecha')
          .eq('anio', anio),
      ])
      if (fact.error) throw fact.error
      if (fechas.error) throw fechas.error
      setFilas((fact.data ?? []) as FilaFacturacion[])
      setUltimas((fechas.data ?? []) as UltimaFecha[])
      setUltimaAct(new Date())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message
      setError(`Error cargando datos: ${msg ?? 'intente de nuevo'}`)
    }
    setLoading(false)
  }, [anio])

  useEffect(() => { cargar() }, [cargar])

  // ── Días hábiles: hasta la última fecha con facturas cargadas ─────────────
  const ultimaFactura = useMemo(() => {
    const u = ultimas.find(x => x.mes === MESES_KEY[mes - 1])
    return u ? fechaLocal(u.ultima_fecha) : null
  }, [ultimas, mes])
  const avance = useMemo(() => avanceMes(anio, mes, ultimaFactura), [anio, mes, ultimaFactura])

  /** Último mes del año con facturas cargadas, para ofrecerlo si el elegido está vacío. */
  const mesConDatos = useMemo(() => {
    const idx = ultimas.map(u => MESES_KEY.indexOf(u.mes)).filter(i => i >= 0)
    return idx.length ? Math.max(...idx) + 1 : null
  }, [ultimas])

  // ── Filtrar por mes y sede ────────────────────────────────────────────────
  const filasFiltradas = useMemo(() => {
    const mesClave = MESES_KEY[mes - 1]
    return filas.filter(f => {
      if (f.mes !== mesClave) return false
      if (f.canal === 'Colisión' && sinColision) return false
      if (todasActivo) return true
      if (f.canal === 'Colisión') return false // Colisión no tiene sede: solo con "Todas"
      return sedes.has(f.sede)
    })
  }, [filas, mes, sedes, todasActivo, sinColision])

  // ── Métricas por canal y totales ──────────────────────────────────────────
  const canales = useMemo((): CanalCalculado[] => {
    return CANALES
      .map(canal => {
        const delCanal = filasFiltradas.filter(f => f.canal === canal)
        const porSede = new Map<string, FilaFacturacion[]>()
        delCanal.forEach(f => porSede.set(f.sede, [...(porSede.get(f.sede) ?? []), f]))
        const sedesCanal: SedeCanal[] = Array.from(porSede.entries())
          .sort(([a], [b]) => a.localeCompare(b, 'es'))
          .map(([sede, fs]) => ({ sede: sede === 'Colisión' ? 'Sin sede' : sede, m: metricas(fs, avance) }))
        return { canal, m: metricas(delCanal, avance), sedes: sedesCanal }
      })
      .filter(c => c.m.neto !== 0 || c.m.ppto !== 0)
      .sort((a, b) => b.m.neto - a.m.neto)
  }, [filasFiltradas, avance])

  const total = useMemo(() => metricas(filasFiltradas.filter(f => esCanal(f.canal)), avance), [filasFiltradas, avance])

  const esperado = avance.cerrado ? null : (avance.transcurridos / avance.total) * 100
  const tope = topeEscala([total.pct, ...canales.flatMap(c => [c.m.pct, ...c.sedes.map(s => s.m.pct)])])
  const escala = { tope, esperado, cerrado: avance.cerrado }
  const sinDatos = !avance.cerrado && avance.transcurridos === 0 && total.neto === 0

  const nombreMes = MESES_LABEL[mes - 1]
  const alcance = [
    todasActivo ? '' : `sede ${Array.from(sedes).join(' + ')}`,
    sinColision ? 'sin colisión' : '',
  ].filter(Boolean).join(', ')
  const contexto = avance.cerrado
    ? `${nombreMes} cerrado, con sus ${avance.total} días hábiles`
    : `${nombreMes} en curso: datos al ${avance.corte ? fmtFechaCorta(avance.corte) : '—'}, día ${avance.transcurridos} de ${avance.total} hábiles`

  const kpis: Kpi[] = [
    {
      titulo: 'Facturado', valor: total.neto, formato: fmtCOP,
      // En mes abierto el % facturado aún no se juzga: el semáforo va en el cierre proyectado.
      pill: !total.ppto ? undefined : avance.cerrado
        ? <EstadoPill estado={total.estado}>{fmtPct(total.pct)}</EstadoPill>
        : <span className="rounded-full bg-brand-tile px-2.5 py-0.5 text-[13px] font-semibold">{fmtPct(total.pct)}</span>,
      detalle: `de ${fmtCOP(total.ppto)} presupuestados`,
    },
    {
      titulo: 'Utilidad', valor: total.util, formato: fmtCOP,
      pill: <span className="rounded-full bg-brand-tile px-2.5 py-0.5 text-[13px] font-semibold">{fmtPct(total.margen)} margen</span>,
      detalle: `Costo de ${fmtCOP(total.costo)}`,
    },
    {
      titulo: 'Ritmo diario', valor: total.porDia, formato: fmtCOP,
      detalle: avance.cerrado
        ? `El presupuesto pedía ${fmtCOP(total.pptoDia)} por día`
        : total.neces > 0
          ? `Para cumplir: ${fmtCOP(total.neces)} por día en ${avance.restantes === 1 ? 'el día hábil que falta' : `los ${avance.restantes} días hábiles que faltan`}`
          : 'Presupuesto del mes alcanzado',
    },
  ]
  if (!avance.cerrado) kpis.push({
    titulo: 'Cierre proyectado', valor: total.pron, formato: fmtCOP,
    pill: total.ppto ? <EstadoPill estado={total.estado}>{fmtPct(total.pctPron)}</EstadoPill> : undefined,
    detalle: 'Si se mantiene el ritmo diario',
  })

  // ── Estilos de controles ─────────────────────────────────────────────────
  const segmento = (activo: boolean) =>
    `h-9 rounded-[7px] px-3.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text ${
      activo ? 'bg-brand-text font-semibold text-brand-bg' : 'text-brand-soft hover:text-brand-text'
    }`
  const grupo = 'inline-flex flex-wrap rounded-[10px] border border-brand-line bg-[#161E28] p-[3px]'
  const select = 'h-[42px] rounded-[10px] border border-brand-line bg-[#161E28] px-3 text-[13px] font-semibold text-brand-text focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text'

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-brand-teal border-t-transparent" />
        <p className="text-sm text-brand-muted-2">Cargando datos…</p>
      </div>
    </div>
  )

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-4 pb-12 pt-7 md:px-10">

      {/* ── Encabezado y filtros ── */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[22px] font-bold text-brand-text">Facturación general</h1>
        <div className="flex flex-wrap items-center gap-2.5">
          <div role="group" aria-label="Sede" className={`${grupo} max-md:w-full max-md:flex-nowrap max-md:overflow-x-auto`}>
            <button type="button" aria-pressed={todasActivo} onClick={() => toggleSede('Todas')} className={`${segmento(todasActivo)} shrink-0`}>
              Todas las sedes
            </button>
            {SEDES_INDIVIDUALES.map(s => (
              <button key={s} type="button" aria-pressed={!todasActivo && sedes.has(s)} onClick={() => toggleSede(s)}
                className={`${segmento(!todasActivo && sedes.has(s))} shrink-0`}>
                {s}
              </button>
            ))}
          </div>
          <button type="button" aria-pressed={sinColision} onClick={() => setSinColision(v => !v)}
            className={`h-[42px] rounded-[10px] border px-3.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text ${
              sinColision ? 'border-brand-text bg-brand-text font-semibold text-brand-bg' : 'border-brand-line bg-[#161E28] text-brand-soft hover:text-brand-text'
            }`}>
            Sin colisión
          </button>
          <div role="group" aria-label="Medir en" className={grupo}>
            <button type="button" aria-pressed={vista === 'dias'} onClick={() => setVista('dias')} className={segmento(vista === 'dias')}>Días hábiles</button>
            <button type="button" aria-pressed={vista === 'pct'} onClick={() => setVista('pct')} className={segmento(vista === 'pct')}>Porcentaje</button>
          </div>
          <select aria-label="Mes" value={mes} onChange={e => setMes(Number(e.target.value))} className={select}>
            {MESES_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select aria-label="Año" value={anio} onChange={e => setAnio(Number(e.target.value))} className={select}>
            {[2024, 2025, 2026].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button type="button" onClick={cargar}
            className="h-[42px] rounded-[10px] border border-brand-line px-3.5 text-[13px] text-brand-soft transition-colors hover:text-brand-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text">
            Actualizar
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-estado-riesgo/40 bg-estado-riesgo/10 p-4 text-sm text-estado-riesgo">{error}</div>
      )}

      {sinDatos ? (
        <section className="flex max-w-[62rem] flex-col items-start gap-4">
          <p className="text-[15px] text-brand-muted-2">{nombreMes} {anio}</p>
          <p className="text-[clamp(26px,3vw,36px)] font-semibold leading-tight">Todavía no hay facturas cargadas de {nombreMes.toLowerCase()}.</p>
          {mesConDatos && mesConDatos !== mes && (
            <button type="button" onClick={() => setMes(mesConDatos)}
              className="h-11 rounded-[10px] bg-brand-text px-4 text-sm font-semibold text-brand-bg">
              Ver {MESES_LABEL[mesConDatos - 1].toLowerCase()}
            </button>
          )}
        </section>
      ) : (
        <>
          {/* ── Conclusión ── */}
          <section className="flex max-w-[62rem] flex-col gap-3.5">
            <p className="text-[15px] text-brand-muted-2">{contexto}{alcance ? `, ${alcance}` : ''}</p>
            <p className="text-balance text-[clamp(26px,3vw,36px)] font-semibold leading-tight tracking-[-0.01em]">
              {textoConclusion(total, avance)}
            </p>
          </section>

          <BandaKpi items={kpis} />

          {/* ── Regla de cumplimiento por canal ── */}
          <section className="flex flex-col gap-[18px]">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {vista === 'dias' ? 'Cumplimiento por canal, medido en días hábiles' : 'Cumplimiento por canal, en porcentaje del presupuesto'}
              </h2>
              <ul className="flex flex-wrap gap-4 text-[13px] text-brand-muted-2">
                <li className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-estado-ok" />Cumplió (100% o más)</li>
                <li className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-estado-alerta" />Aceptable (80% a 99%)</li>
                <li className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-estado-riesgo" />Deficiente (menos de 80%)</li>
              </ul>
            </div>
            <p className="max-w-[70ch] text-sm text-brand-muted-2">
              {vista === 'dias'
                ? 'Cada marca de la regla es un día hábil de presupuesto; la barra muestra hasta qué día alcanzó lo facturado.'
                : 'La línea blanca es el 100% del presupuesto; la diferencia se muestra en pesos.'}
              {!avance.cerrado && ' La línea punteada es lo que el presupuesto esperaba a la fecha, y el color sale del cierre proyectado.'}
              {' '}Toca un canal para abrir su tarjeta.
            </p>

            <div className="flex flex-col gap-1">
              <EscalaRegla vista={vista} total={avance.total} transcurridos={avance.transcurridos} cerrado={avance.cerrado} tope={tope} />
              {canales.map(c => {
                const id = `tarjeta-${c.canal}`
                const estaAbierto = abierto === c.canal
                const subtitulo = `${c.sedes.length > 1 ? `${c.sedes.length} sedes` : c.sedes[0]?.sede ?? 'Sin sede'}, ${nombreMes.toLowerCase()} ${anio}`
                return (
                  <div key={c.canal}>
                    <FilaCanal canal={c.canal} m={c.m} vista={vista} escala={escala} abierto={estaAbierto} idTarjeta={id}
                      onToggle={() => setAbierto(estaAbierto ? null : c.canal)} />
                    {estaAbierto && (
                      <TarjetaCanal id={id} canal={c.canal} m={c.m} subtitulo={subtitulo} sedes={c.sedes} escala={escala} href={CANAL_HREF[c.canal]} />
                    )}
                  </div>
                )
              })}
              <div className={`${GRILLA_REGLA} min-h-14 border-t border-brand-line-2 px-1 py-2`}>
                <span className="flex flex-col gap-0.5 md:pl-[42px]">
                  <span className="text-sm font-bold">Total</span>
                  <span className="text-xs tabular-nums text-brand-muted-2">{fmtCOP(total.neto)}</span>
                </span>
                <span className="col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1">
                  <BarraCumplimiento pct={total.pct} estado={total.estado} tope={tope} esperado={esperado} tamano="total" />
                </span>
                <span className={`col-start-2 row-start-1 text-right text-[15px] font-bold md:col-start-3 ${CIFRA} ${ESTADO_TEXT[total.estado]}`}>
                  {vista === 'dias' ? fmtDias(total.difDias) : fmtCOPSigno(total.difPesos)}
                </span>
              </div>
            </div>
          </section>

          {/* ── Detalle por canal ── */}
          <section className="flex flex-col gap-3.5">
            <h2 className="text-lg font-semibold">Detalle por canal</h2>
            <div className="overflow-x-auto rounded-xl border border-brand-line">
              <table className="w-full min-w-[960px] border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="bg-[#141C25] text-xs font-semibold text-brand-muted-2">
                    <th scope="col" className="px-4 py-3 text-left">Canal</th>
                    <th scope="col" className="px-4 py-3 text-right">Presupuesto</th>
                    <th scope="col" className="px-4 py-3 text-right">Facturado</th>
                    <th scope="col" className="px-4 py-3 text-right">Cumplimiento</th>
                    <th scope="col" className="px-4 py-3 text-right">{avance.cerrado ? 'Diferencia' : 'Diferencia a la fecha'}</th>
                    <th scope="col" className="px-4 py-3 text-right">Costo</th>
                    <th scope="col" className="px-4 py-3 text-right">Utilidad</th>
                    <th scope="col" className="px-4 py-3 text-right">Margen</th>
                    <th scope="col" className="px-4 py-3 text-right">Ritmo diario</th>
                    {!avance.cerrado && <th scope="col" className="px-4 py-3 text-right">Necesario por día</th>}
                    {!avance.cerrado && <th scope="col" className="px-4 py-3 text-right">Cierre proyectado</th>}
                    <th scope="col" className="px-4 py-3 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {canales.map(({ canal, m }) => (
                    <FilaTabla key={canal} nombre={canal} canal={canal} m={m} cerrado={avance.cerrado} />
                  ))}
                </tbody>
                <tfoot className="border-t border-brand-line-2 font-bold">
                  <FilaTabla nombre="Total" m={total} cerrado={avance.cerrado} />
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-brand-muted-2">
              Datos desde Supabase (vista v_facturacion_general){ultimaAct ? `, consultados a las ${ultimaAct.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : ''}{' '}·
              {' '}Días hábiles de lunes a sábado sin festivos de Colombia; en un mes en curso se cuentan hasta la última fecha con facturas cargadas.
              {' '}Colisión no tiene sede: sale solo con todas las sedes.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

// ── Fila de la tabla de detalle ──────────────────────────────────────────────
function Celda({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-4 py-3 text-right ${className}`}>{children}</td>
}

function FilaTabla({ nombre, canal, m, cerrado }: { nombre: string; canal?: Canal; m: Metricas; cerrado: boolean }) {
  return (
    <tr className="border-t border-brand-track">
      <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-semibold">
        <span className="flex items-center gap-2">
          {canal && <CanalIcon canal={canal} color={CANAL_COLOR[canal]} />}
          {nombre}
        </span>
      </th>
      <Celda className="text-brand-soft">{fmtCOP(m.ppto)}</Celda>
      <Celda>{fmtCOP(m.neto)}</Celda>
      <Celda className={ESTADO_TEXT[m.estado]}>{fmtPct(m.pct)}</Celda>
      <Celda className={m.difPesos >= 0 ? 'text-estado-ok' : 'text-estado-riesgo'}>{fmtCOPSigno(m.difPesos)}</Celda>
      <Celda className="text-brand-soft">{fmtCOP(m.costo)}</Celda>
      <Celda className="text-brand-soft">{fmtCOP(m.util)}</Celda>
      <Celda className="text-brand-soft">{fmtPct(m.margen)}</Celda>
      <Celda className="text-brand-soft">{fmtCOP(m.porDia)}</Celda>
      {!cerrado && <Celda className="text-brand-soft">{m.neces > 0 ? fmtCOP(m.neces) : 'Cumplido'}</Celda>}
      {!cerrado && <Celda className="text-brand-soft">{fmtCOP(m.pron)}</Celda>}
      <td className="px-4 py-3"><EstadoPill estado={m.estado} /></td>
    </tr>
  )
}
