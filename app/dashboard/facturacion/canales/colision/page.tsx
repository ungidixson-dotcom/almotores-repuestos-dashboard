'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgv_V93SUlbyd5gXHKs0znKRVwwTgUSF4WpkmJurZ8N4RxaRj1cTAgCqG0klE4i8BBoiUpbjOMnsxt/pub'
const GID_TALLER      = '1968437267'
const GID_PRESUPUESTO = '1013471670'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
               'Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Festivos Colombia 2025-2026
const FESTIVOS = new Set([
  '2025-01-01','2025-01-06','2025-03-24','2025-04-17','2025-04-18','2025-05-01',
  '2025-06-02','2025-06-23','2025-06-30','2025-07-20','2025-08-07','2025-08-18',
  '2025-10-13','2025-11-03','2025-11-17','2025-12-08','2025-12-25',
  '2026-01-01','2026-01-05','2026-03-23','2026-04-02','2026-04-03','2026-05-01',
  '2026-05-18','2026-06-08','2026-06-29','2026-07-20','2026-08-07','2026-08-17',
  '2026-10-12','2026-11-02','2026-11-16','2026-12-08','2026-12-25',
])

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtCOP = (v: number) => {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}$${(abs/1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${(abs/1e3).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}

const parseCOP = (s: string | undefined): number => {
  if (!s) return 0
  const n = parseFloat(s.replace(/[$,\s"]/g, ''))
  return isNaN(n) ? 0 : n
}

const parseFecha = (s: string | undefined): Date | null => {
  if (!s) return null
  const str = s.trim().replace(/"/g, '')
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  if (str.includes('/')) {
    const [d, m, y] = str.split('/')
    const anio = parseInt(y) < 100 ? 2000 + parseInt(y) : parseInt(y)
    return new Date(anio, parseInt(m) - 1, parseInt(d))
  }
  return null
}

const esDiaHabil = (d: Date) => {
  if (d.getDay() === 0) return false
  return !FESTIVOS.has(d.toISOString().slice(0, 10))
}

const diasHabilesEnMes = (anio: number, mes: number) => {
  const d = new Date(anio, mes - 1, 1); let c = 0
  while (d.getMonth() === mes - 1) { if (esDiaHabil(d)) c++; d.setDate(d.getDate() + 1) }
  return c
}

const diasHabilesHasta = (anio: number, mes: number, dia: number) => {
  const d = new Date(anio, mes - 1, 1); let c = 0
  while (d.getDate() <= dia && d.getMonth() === mes - 1) {
    if (esDiaHabil(d)) c++; d.setDate(d.getDate() + 1)
  }
  return c
}

const fetchCSV = async (gid: string): Promise<string[][]> => {
  const r = await fetch(`${BASE_URL}?gid=${gid}&single=true&output=csv`, { cache: 'no-store' })
  const txt = await r.text()
  return txt.split('\n').map(row => {
    const cells: string[] = []; let cur = '', inQ = false
    for (const ch of row) {
      if (ch === '"') { inQ = !inQ; continue }
      if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    cells.push(cur.trim()); return cells
  })
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Factura {
  numero:  string
  cliente: string
  neto:    number
  costo:   number
  items:   number
  esDevolucion: boolean
}

// ── Componentes ───────────────────────────────────────────────────────────────
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-brand-border bg-brand-surface p-5 ${className}`}>
      {children}
    </div>
  )
}

function KpiCard({ label, value, sub, accent = 'text-brand-teal' }: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <Panel>
      <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">{label}</p>
      <p className={`text-2xl font-bold font-title ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-brand-subtle mt-1">{sub}</p>}
    </Panel>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-2 bg-brand-border rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function ColisionPage() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes,  setMes]  = useState(hoy.getMonth() + 1)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [ultimaAct,  setUltimaAct]  = useState<Date | null>(null)
  const [tallerRaw,  setTallerRaw]  = useState<string[][]>([])
  const [pptoRaw,    setPptoRaw]    = useState<string[][]>([])
  const [buscar,     setBuscar]     = useState('')
  const [ordenCol,   setOrdenCol]   = useState<'numero'|'cliente'|'neto'>('neto')
  const [ordenDir,   setOrdenDir]   = useState<'asc'|'desc'>('desc')

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [tal, ppto] = await Promise.all([
        fetchCSV(GID_TALLER),
        fetchCSV(GID_PRESUPUESTO),
      ])
      setTallerRaw(tal)
      setPptoRaw(ppto)
      setUltimaAct(new Date())
    } catch {
      setError('Error cargando datos del Sheet. Verifica la conexión.')
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    const id = setInterval(cargar, 6 * 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [cargar])

  // ── Días hábiles ──────────────────────────────────────────────────────────
  const totalDH  = useMemo(() => diasHabilesEnMes(anio, mes), [anio, mes])
  const dhTransc = useMemo(() => {
    const esActual = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1
    return esActual ? diasHabilesHasta(anio, mes, hoy.getDate()) : totalDH
  }, [anio, mes, totalDH])
  const dhRest  = totalDH - dhTransc
  const pctDias = totalDH ? (dhTransc / totalDH) * 100 : 0

  // ── Presupuesto Colisión ──────────────────────────────────────────────────
  const presupuesto = useMemo(() => {
    // Col 4=Canales, col 7+mes-1=valor mensual
    const mesIdx = mes - 1 + 7
    return pptoRaw.slice(1)
      .filter(r => r[4]?.trim() === 'Colisión')
      .reduce((s, r) => s + parseCOP(r[mesIdx]), 0)
  }, [pptoRaw, mes])

  // ── Facturas taller 16 ────────────────────────────────────────────────────
  // Taller(0), Refer.(1), Nombre cliente(5), F.cierre(6), Neto(14), Costo(15)
  const facturas = useMemo((): Factura[] => {
    const mapa: Record<string, Factura> = {}
    tallerRaw.slice(1).forEach(r => {
      const taller = r[0]?.toString().trim()
      if (taller !== '16') return
      const fec = parseFecha(r[6]); if (!fec) return
      if (fec.getFullYear() !== anio || fec.getMonth() + 1 !== mes) return
      const num    = r[1]?.trim() || ''
      const neto   = parseCOP(r[14])
      const costo  = parseCOP(r[15])
      if (!mapa[num]) {
        mapa[num] = {
          numero: num,
          cliente: r[5]?.trim() || '',
          neto: 0, costo: 0, items: 0,
          esDevolucion: false
        }
      }
      mapa[num].neto  += neto
      mapa[num].costo += costo
      mapa[num].items += 1
    })
    return Object.values(mapa).map(f => ({
      ...f,
      esDevolucion: f.neto < 0
    }))
  }, [tallerRaw, anio, mes])

  // ── Totales ───────────────────────────────────────────────────────────────
  const totalNeto    = facturas.reduce((s, f) => s + f.neto, 0)
  const totalCosto   = facturas.reduce((s, f) => s + f.costo, 0)
  const totalUtilidad = totalNeto - totalCosto
  const pctUtilidad  = totalNeto ? (totalUtilidad / totalNeto) * 100 : 0
  const pctAvance    = presupuesto ? (totalNeto / presupuesto) * 100 : 0
  const porDia       = dhTransc ? totalNeto / dhTransc : 0
  const necesarioDia = dhRest > 0 ? (presupuesto - totalNeto) / dhRest : 0
  const pronostico   = totalNeto + porDia * dhRest
  const pctPronos    = presupuesto ? (pronostico / presupuesto) * 100 : 0

  const colorAvance = pctAvance >= pctDias ? '#68D391' : pctAvance >= pctDias * 0.8 ? '#F6AD55' : '#FC8181'

  // ── Filtro y orden ────────────────────────────────────────────────────────
  const facturasFiltradas = useMemo(() => {
    let lista = [...facturas]
    if (buscar) {
      const b = buscar.toLowerCase()
      lista = lista.filter(f =>
        f.numero.includes(b) || f.cliente.toLowerCase().includes(b)
      )
    }
    lista.sort((a, b) => {
      let va: string | number = a[ordenCol]
      let vb: string | number = b[ordenCol]
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      return ordenDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
    })
    return lista
  }, [facturas, buscar, ordenCol, ordenDir])

  const ordenar = (col: typeof ordenCol) => {
    if (ordenCol === col) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdenCol(col); setOrdenDir('desc') }
  }

  const thClass = (col: typeof ordenCol) =>
    `text-left font-mono text-xs uppercase tracking-wider pb-3 pr-4 cursor-pointer select-none whitespace-nowrap
     ${ordenCol === col ? 'text-brand-teal' : 'text-brand-subtle'}`

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-brand-subtle text-sm font-mono">Cargando datos...</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🚗</span>
            <h1 className="text-2xl font-bold font-title text-brand-text">Colisión</h1>
          </div>
          <p className="text-sm text-brand-subtle">Taller 16 · Facturación de repuestos para vehículos siniestrados</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            {[2024, 2025, 2026].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={mes} onChange={e => setMes(Number(e.target.value))}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <button onClick={cargar}
            className="bg-brand-teal/20 hover:bg-brand-teal/30 border border-brand-teal/40 text-brand-teal rounded-lg px-4 py-2 text-sm font-mono transition-colors">
            ↻ Actualizar
          </button>
          {ultimaAct && (
            <span className="text-xs text-brand-subtle font-mono">
              Act: {ultimaAct.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-400 text-sm font-mono">
          {error}
        </div>
      )}

      {/* Días hábiles */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle">
              Días hábiles — {MESES[mes - 1]} {anio}
            </p>
            <p className="text-lg font-bold font-title text-brand-text mt-0.5">
              {dhTransc} de {totalDH} transcurridos · {dhRest} restantes
            </p>
          </div>
          <p className="text-2xl font-bold font-title text-brand-teal">{pctDias.toFixed(0)}%</p>
        </div>
        <ProgressBar pct={pctDias} color="#4FD1C5" />
      </Panel>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Facturado"
          value={fmtCOP(totalNeto)}
          sub={`de ${fmtCOP(presupuesto)} presupuestado`}
          accent="text-brand-teal"
        />
        <KpiCard
          label="% Avance"
          value={`${pctAvance.toFixed(1)}%`}
          sub={`meta: ${pctDias.toFixed(0)}% del mes`}
          accent={pctAvance >= pctDias ? 'text-green-400' : 'text-red-400'}
        />
        <KpiCard
          label="Utilidad"
          value={fmtCOP(totalUtilidad)}
          sub={`${pctUtilidad.toFixed(1)}% sobre ventas`}
          accent="text-brand-teal"
        />
        <KpiCard
          label="Pronóstico cierre"
          value={fmtCOP(pronostico)}
          sub={`${pctPronos.toFixed(1)}% del presupuesto`}
          accent={pctPronos >= 95 ? 'text-green-400' : pctPronos >= 85 ? 'text-yellow-400' : 'text-red-400'}
        />
      </div>

      {/* Barra de avance */}
      <Panel>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle">
            Avance vs presupuesto
          </p>
          <div className="flex gap-4 text-xs font-mono">
            <span className="text-brand-subtle">$/día actual: <span className="text-brand-text">{fmtCOP(porDia)}</span></span>
            <span className="text-brand-subtle">$/día necesario: <span className={porDia >= necesarioDia ? 'text-green-400' : 'text-red-400'}>{fmtCOP(necesarioDia)}</span></span>
          </div>
        </div>
        <div className="relative">
          <ProgressBar pct={pctAvance} color={colorAvance} />
          <div className="absolute top-0 h-full flex items-center pointer-events-none"
            style={{ left: `${pctDias}%` }}>
            <div className="w-0.5 h-4 bg-white/50 -mt-1" />
          </div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-brand-subtle font-mono">{pctAvance.toFixed(1)}% facturado</span>
          <span className="text-xs text-brand-subtle font-mono">{pctDias.toFixed(0)}% días hábiles</span>
        </div>
      </Panel>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        <Panel className="text-center">
          <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">Facturas</p>
          <p className="text-3xl font-bold font-title text-brand-text">
            {facturas.filter(f => !f.esDevolucion).length}
          </p>
          {facturas.filter(f => f.esDevolucion).length > 0 && (
            <p className="text-xs text-red-400 font-mono mt-1">
              + {facturas.filter(f => f.esDevolucion).length} devolución(es)
            </p>
          )}
        </Panel>
        <Panel className="text-center">
          <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">Costo total</p>
          <p className="text-3xl font-bold font-title text-brand-text">{fmtCOP(totalCosto)}</p>
        </Panel>
        <Panel className="text-center">
          <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">% Utilidad</p>
          <p className="text-3xl font-bold font-title text-brand-teal">{pctUtilidad.toFixed(1)}%</p>
        </Panel>
      </div>

      {/* Tabla de facturas */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle">
            Detalle de facturas — Taller 16
          </h2>
          <input
            type="text"
            placeholder="Buscar por factura o cliente..."
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal w-64"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                <th className={thClass('numero')} onClick={() => ordenar('numero')}>
                  N° Factura {ordenCol === 'numero' ? (ordenDir === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th className={thClass('cliente')} onClick={() => ordenar('cliente')}>
                  Cliente {ordenCol === 'cliente' ? (ordenDir === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th className="text-right font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">
                  Items
                </th>
                <th className="text-right font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">
                  Costo
                </th>
                <th className={`text-right font-mono text-xs uppercase tracking-wider pb-3 pr-4 whitespace-nowrap cursor-pointer select-none
                  ${ordenCol === 'neto' ? 'text-brand-teal' : 'text-brand-subtle'}`}
                  onClick={() => ordenar('neto')}>
                  Neto {ordenCol === 'neto' ? (ordenDir === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th className="text-right font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 whitespace-nowrap">
                  Utilidad
                </th>
              </tr>
            </thead>
            <tbody>
              {facturasFiltradas.map(f => {
                const utilidad = f.neto - f.costo
                const pctUtil  = f.neto ? (utilidad / f.neto) * 100 : 0
                return (
                  <tr key={f.numero}
                    className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors
                      ${f.esDevolucion ? 'bg-red-500/5' : ''}`}>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.numero}</td>
                    <td className="py-3 pr-4 text-brand-text font-medium max-w-[250px] truncate">{f.cliente}</td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-brand-subtle">{f.items}</td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-brand-subtle">{fmtCOP(f.costo)}</td>
                    <td className={`py-3 pr-4 text-right font-mono text-xs font-semibold
                      ${f.esDevolucion ? 'text-red-400' : 'text-brand-teal'}`}>
                      {fmtCOP(f.neto)}
                      {f.esDevolucion && <span className="ml-1 text-xs text-red-400/70">(dev)</span>}
                    </td>
                    <td className="py-3 text-right font-mono text-xs">
                      <span className={pctUtil >= 15 ? 'text-green-400' : 'text-yellow-400'}>
                        {fmtCOP(utilidad)} <span className="text-brand-subtle">({pctUtil.toFixed(1)}%)</span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brand-border">
                <td className="pt-3 font-mono text-xs uppercase text-brand-text font-bold">Total</td>
                <td className="pt-3 font-mono text-xs text-brand-subtle">
                  {facturasFiltradas.length} factura{facturasFiltradas.length !== 1 ? 's' : ''}
                </td>
                <td className="pt-3 text-right font-mono text-xs text-brand-subtle">
                  {facturasFiltradas.reduce((s, f) => s + f.items, 0)}
                </td>
                <td className="pt-3 text-right font-mono text-xs text-brand-subtle">
                  {fmtCOP(facturasFiltradas.reduce((s, f) => s + f.costo, 0))}
                </td>
                <td className="pt-3 text-right font-mono text-xs text-brand-teal font-bold">
                  {fmtCOP(facturasFiltradas.reduce((s, f) => s + f.neto, 0))}
                </td>
                <td className="pt-3 text-right font-mono text-xs text-green-400 font-bold">
                  {fmtCOP(facturasFiltradas.reduce((s, f) => s + (f.neto - f.costo), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {facturasFiltradas.length === 0 && (
          <p className="text-center text-brand-subtle font-mono text-sm py-8">
            No se encontraron facturas para los filtros seleccionados.
          </p>
        )}
      </Panel>

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Taller 16 · Datos desde Google Sheets · Actualización cada 6 horas
      </p>
    </div>
  )
}
