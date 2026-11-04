// Cálculos de Facturación General. Funciones puras: reciben las filas de v_facturacion_general
// ya filtradas y el avance del mes en días hábiles; no consultan nada.

import type { AvanceMes } from './diasHabiles'
import { estadoDe, type Estado } from './semaforo'

/** Fila de la vista v_facturacion_general (solo las columnas que usa la página). */
export interface FilaFacturacion {
  canal:       string
  sede:        string
  mes:         string
  anio:        number
  neto:        number
  costo:       number
  presupuesto: number
}

export interface Metricas {
  neto:     number
  costo:    number
  util:     number
  /** Utilidad / neto, en %. */
  margen:   number
  ppto:     number
  /** Cumplimiento: neto / presupuesto, en %. */
  pct:      number
  /** Facturación promedio por día hábil transcurrido. */
  porDia:   number
  /** Presupuesto repartido en los días hábiles del mes. */
  pptoDia:  number
  /** Lo que falta facturar por cada día hábil restante para llegar al presupuesto. */
  neces:    number
  /** Cierre proyectado al ritmo actual (en mes cerrado = neto). */
  pron:     number
  pctPron:  number
  /** Semáforo: sobre el cierre proyectado (en mes cerrado, sobre lo facturado). */
  estado:   Estado
  /** Neto menos lo que el presupuesto esperaba a la fecha (en mes cerrado: neto − presupuesto). */
  difPesos: number
  /** La misma diferencia expresada en días hábiles de presupuesto. */
  difDias:  number
}

export function metricas(filas: FilaFacturacion[], avance: AvanceMes): Metricas {
  const neto  = filas.reduce((s, f) => s + Number(f.neto), 0)
  const costo = filas.reduce((s, f) => s + Number(f.costo), 0)
  const ppto  = filas.reduce((s, f) => s + Number(f.presupuesto), 0)
  const { total, transcurridos, restantes } = avance

  const util    = neto - costo
  const margen  = neto ? (util / neto) * 100 : 0
  const pct     = ppto ? (neto / ppto) * 100 : 0
  const porDia  = transcurridos ? neto / transcurridos : 0
  const pptoDia = total ? ppto / total : 0
  const faltante = ppto - neto
  const neces   = restantes > 0 && faltante > 0 ? faltante / restantes : 0
  const pron    = neto + porDia * restantes
  const pctPron = ppto ? (pron / ppto) * 100 : 0
  const esperado = total ? ppto * (transcurridos / total) : 0
  const difPesos = neto - esperado
  const difDias  = pptoDia ? difPesos / pptoDia : 0

  return {
    neto, costo, util, margen, ppto, pct, porDia, pptoDia, neces, pron, pctPron,
    estado: estadoDe(pctPron), difPesos, difDias,
  }
}

/**
 * Tope de la escala de la regla (en % del presupuesto): al menos 150%, redondeado a 25
 * para que el canal que más se pasó también quepa.
 */
export function topeEscala(pcts: number[]): number {
  const max = Math.max(0, ...pcts.filter(Number.isFinite))
  return Math.max(150, Math.ceil(max / 25) * 25)
}
