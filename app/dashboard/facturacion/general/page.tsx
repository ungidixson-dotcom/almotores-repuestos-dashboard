'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'

// ── Festivos Colombia 2025-2026 ──────────────────────────────────────────────
const FESTIVOS: Record<string,boolean> = {}
;[
  '2025-01-01','2025-01-06','2025-03-24','2025-04-17','2025-04-18','2025-05-01',
  '2025-06-02','2025-06-23','2025-06-30','2025-07-20','2025-08-07','2025-08-18',
  '2025-10-13','2025-11-03','2025-11-17','2025-12-08','2025-12-25',
  '2026-01-01','2026-01-05','2026-03-23','2026-04-02','2026-04-03','2026-05-01',
  '2026-05-18','2026-06-08','2026-06-29','2026-07-20','2026-08-07','2026-08-17',
  '2026-10-12','2026-11-02','2026-11-16','2026-12-08','2026-12-25',
].forEach(d => { FESTIVOS[d] = true })

const BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgv_V93SUlbyd5gXHKs0znKRVwwTgUSF4WpkmJurZ8N4RxaRj1cTAgCqG0klE4i8BBoiUpbjOMnsxt/pub'
const GID = {
  presupuesto:  '1013471670',
  prefijos:     '83279873',
  tipoClientes: '1039901350',
  taller:       '1968437267',
  mostrador:    '143806698',
  credito:      '1646038872',
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtCOP  = (v: number) => {
  if (v >= 1e9) return `$${(v/1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v/1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}
const fmtPct  = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
const parseCOP = (s: string) => {
  if (!s) return 0
  const n = parseFloat(s.replace(/[$,\s]/g,''))
  return isNaN(n) ? 0 : n
}

function parseFecha(s: string): Date | null {
  if (!s) return null
  // Formato DD/MM/YY o DD/MM/YYYY
  const parts = s.trim().split('/')
  if (parts.length === 3) {
    const [d, m, y] = parts
    const anio = parseInt(y) < 100 ? 2000 + parseInt(y) : parseInt(y)
    return new Date(anio, parseInt(m) - 1, parseInt(d))
  }
  const dt = new Date(s)
  return isNaN(dt.getTime()) ? null : dt
}

function esDiaHabil(d: Date): boolean {
  const dow = d.getDay() // 0=dom, 6=sab
  if (dow === 0) return false // domingo no
  const key = d.toISOString().slice(0,10)
  if (FESTIVOS[key]) return false
  return true
}

function diasHabilesEnMes(anio: number, mes: number): number {
  const d = new Date(anio, mes - 1, 1)
  let c = 0
  while (d.getMonth() === mes - 1) {
    if (esDiaHabil(d)) c++
    d.setDate(d.getDate() + 1)
  }
  return c
}

function diasHabilesHasta(anio: number, mes: number, dia: number): number {
  const d = new Date(anio, mes - 1, 1)
  let c = 0
  while (d.getDate() <= dia && d.getMonth() === mes - 1) {
    if (esDiaHabil(d)) c++
    d.setDate(d.getDate() + 1)
  }
  return c
}

async function fetchCSV(gid: string): Promise<string[][]> {
  const url = `${BASE_URL}?gid=${gid}&single=true&output=csv`
  const r = await fetch(url, { cache: 'no-store' })
  const txt = await r.text()
  return txt.split('\n').map(row => {
    // Parser CSV simple con soporte de comillas
    const cells: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '"') { inQ = !inQ; continue }
      if (row[i] === ',' && !inQ) { cells.push(cur.trim()); cur = ''; continue }
      cur += row[i]
    }
    cells.push(cur.trim())
    return cells
  })
}

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Canal {
  nombre: string
  color: string
  icon: string
  presupuesto: number
  facturado: number
}

interface ResumenCanal {
  canal: string
  color: string
  icon: string
  presupuesto: number
  facturado: number
  pct: number
  porDia: number
  necesarioPorDia: number
  pronostico: number
  alerta: 'ok' | 'warning' | 'danger'
}

// ── Colores por canal ────────────────────────────────────────────────────────
const CANAL_META: Record<string, { color: string; icon: string }> = {
  'Taller':     { color: '#4FD1C5', icon: '🔧' },
  'Mostrador':  { color: '#63B3ED', icon: '🛒' },
  'Accesorios': { color: '#F6AD55', icon: '🎁' },
  'Mayoristas': { color: '#B794F4', icon: '📦' },
  'Subastas':   { color: '#FC8181', icon: '🔨' },
  'Colisión':   { color: '#68D391', icon: '🚗' },
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ── Panel ────────────────────────────────────────────────────────────────────
function Panel({ children, className='' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-brand-border bg-brand-surface p-5 ${className}`}>
      {children}
    </div>
  )
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent='text-brand-teal', alert=false }:
  { label: string; value: string; sub?: string; accent?: string; alert?: boolean }) {
  return (
    <Panel className={alert ? 'border-red-500/50' : ''}>
      <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">{label}</p>
      <p className={`text-2xl font-bold font-title ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-brand-subtle mt-1">{sub}</p>}
    </Panel>
  )
}

// ── Barra de progreso ────────────────────────────────────────────────────────
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const w = Math.min(100, Math.max(0, pct))
  return (
    <div className="w-full h-2 bg-brand-border rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
           style={{ width: `${w}%`, background: color }} />
    </div>
  )
}

// ── Chip de alerta ───────────────────────────────────────────────────────────
function AlertChip({ tipo }: { tipo: 'ok'|'warning'|'danger' }) {
  if (tipo === 'ok')      return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-mono">✓ En meta</span>
  if (tipo === 'warning') return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-mono">⚠ Alerta</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-mono">✗ Riesgo</span>
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function FacGeneralPage() {
  const hoy = new Date()
  const [anio,   setAnio]   = useState(hoy.getFullYear())
  const [mes,    setMes]    = useState(hoy.getMonth() + 1)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [ultimaAct, setUltimaAct] = useState<Date | null>(null)

  // Datos crudos
  const [presupuestoRaw, setPresupuestoRaw] = useState<string[][]>([])
  const [tallerRaw,      setTallerRaw]      = useState<string[][]>([])
  const [mostradorRaw,   setMostradorRaw]   = useState<string[][]>([])
  const [creditoRaw,     setCreditoRaw]     = useState<string[][]>([])
  const [prefijosRaw,    setPrefijosRaw]    = useState<string[][]>([])
  const [tipoClientesRaw, setTipoClientesRaw] = useState<string[][]>([])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [pres, tal, most, cred, pref, tipoC] = await Promise.all([
        fetchCSV(GID.presupuesto),
        fetchCSV(GID.taller),
        fetchCSV(GID.mostrador),
        fetchCSV(GID.credito),
        fetchCSV(GID.prefijos),
        fetchCSV(GID.tipoClientes),
      ])
      setPresupuestoRaw(pres)
      setTallerRaw(tal)
      setMostradorRaw(most)
      setCreditoRaw(cred)
      setPrefijosRaw(pref)
      setTipoClientesRaw(tipoC)
      setUltimaAct(new Date())
    } catch(e) {
      setError('Error cargando datos del Sheet. Verifica que esté publicado.')
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Auto-refresh cada 6 horas
  useEffect(() => {
    const id = setInterval(cargar, 6 * 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [cargar])

  // ── Días hábiles ────────────────────────────────────────────────────────
  const totalDiasHabiles    = useMemo(() => diasHabilesEnMes(anio, mes), [anio, mes])
  const diasHabilesTranscurridos = useMemo(() => {
    const esElMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1
    if (!esElMesActual) return totalDiasHabiles
    return diasHabilesHasta(anio, mes, hoy.getDate())
  }, [anio, mes, totalDiasHabiles])
  const diasRestantes = totalDiasHabiles - diasHabilesTranscurridos
  const pctDias = totalDiasHabiles ? (diasHabilesTranscurridos / totalDiasHabiles) * 100 : 0

  // ── Parsear presupuesto ─────────────────────────────────────────────────
  const presupuesto = useMemo(() => {
    // Fila 1 = headers, col 0=Sede, col1=Cod, col2=sede2, col3=Cod.new, col4=Canales, col5=Canales2, col6=Dep
    // col 7..18 = Ene..Dic
    const result: Record<string, number> = {}
    const mesIdx = mes - 1 + 7 // col 7 = Enero
    presupuestoRaw.slice(1).forEach(row => {
      const canal = row[4] // columna Canales
      const val = parseCOP(row[mesIdx])
      if (canal && val > 0) {
        result[canal] = (result[canal] || 0) + val
      }
    })
    return result
  }, [presupuestoRaw, mes])

  // ── Parsear prefijos para clasificar canal ───────────────────────────────
  const prefijosMap = useMemo(() => {
    const map: Record<string, string> = {}
    prefijosRaw.slice(1).forEach(row => {
      const prefijo = row[0]?.trim()
      const canal   = row[1]?.trim() || row[2]?.trim()
      if (prefijo && canal) map[prefijo.toUpperCase()] = canal
    })
    return map
  }, [prefijosRaw])

  // ── Clientes Mayoristas y Subastas (facturan por mostrador/crédito) ──────
  const clientesMayoristas = useMemo(() => {
    const set = new Set<string>()
    tipoClientesRaw.slice(1).forEach(row => {
      const cuenta = row[0]?.trim()
      const tipo   = row[1]?.trim().toLowerCase() || row[2]?.trim().toLowerCase()
      if (cuenta && tipo?.includes('mayorist')) set.add(cuenta)
    })
    return set
  }, [tipoClientesRaw])

  const clientesSubastas = useMemo(() => {
    const set = new Set<string>()
    tipoClientesRaw.slice(1).forEach(row => {
      const cuenta = row[0]?.trim()
      const tipo   = row[1]?.trim().toLowerCase() || row[2]?.trim().toLowerCase()
      if (cuenta && tipo?.includes('subast')) set.add(cuenta)
    })
    return set
  }, [tipoClientesRaw])

  // ── Parsear taller ───────────────────────────────────────────────────────
  const facturadoTaller = useMemo((): { Taller: number; Colisión: number; AccesoriosTaller: number } => {
    // A=0 Taller, G=6 Fecha(DD/MM/YY), P=15 Neto
    // 16 = Colisión
    // 11,11ex,12,13,13ex = Taller (Norte, Pasoancho, Calle 9)
    // 11A,12A,13A = Accesorios Taller
    if (tallerRaw.length < 2) return { Taller: 0, Colisión: 0, AccesoriosTaller: 0 }
    let taller = 0, colision = 0, accesoriosTaller = 0
    tallerRaw.slice(1).forEach(row => {
      if (!row[0] || !row[15]) return
      const fec = parseFecha(row[6])
      if (!fec) return
      if (fec.getFullYear() !== anio || fec.getMonth() + 1 !== mes) return
      const val     = parseCOP(row[15])
      const tallNum = row[0]?.toString().trim().toUpperCase()
      if (tallNum === '16')                                    colision += val
      else if (['11A','12A','13A'].includes(tallNum))          accesoriosTaller += val
      else                                                     taller += val
    })
    return { Taller: taller, Colisión: colision, AccesoriosTaller: accesoriosTaller }
  }, [tallerRaw, anio, mes])

  // ── Parsear mostrador ────────────────────────────────────────────────────
  const facturadoMostrador = useMemo((): { Mostrador: number; Accesorios: number; Mayoristas: number; Subastas: number; porAsesor: Record<string, number> } => {
    // A=0 Almacen, B=1 Refer, C=2 Vendedor, E=4 Cuenta, G=6 Fecha, I=8 Prefijo, P=15 Neto
    if (mostradorRaw.length < 2) return { Mostrador: 0, Accesorios: 0, Mayoristas: 0, Subastas: 0, porAsesor: {} }
    const result: Record<string, number> = { Mostrador: 0, Accesorios: 0, Mayoristas: 0, Subastas: 0 }
    const porAsesor: Record<string, number> = {}
    mostradorRaw.slice(1).forEach(row => {
      if (!row[15]) return
      const fec = parseFecha(row[6])
      if (!fec) return
      if (fec.getFullYear() !== anio || fec.getMonth() + 1 !== mes) return
      const pref   = row[8]?.trim().toUpperCase() || ''
      const val    = parseCOP(row[15])
      const cuenta = row[4]?.trim() || ''
      const asesor = row[3]?.trim() || row[2]?.trim() || 'Sin asesor'
      // Clasificar por tipo de cliente primero, luego por prefijo
      let canal = 'Mostrador'
      if (clientesMayoristas.has(cuenta))       canal = 'Mayoristas'
      else if (clientesSubastas.has(cuenta))    canal = 'Subastas'
      else {
        const pref3 = pref.slice(0,3)
        if (pref3 === 'EAA' || pref3 === 'EAM' || pref3 === 'EAL') canal = 'Accesorios'
        else if (pref3 === 'ENR' && pref !== 'ENR2')                  canal = 'Mayoristas'
        else if (pref3 === 'EVC' || pref3 === 'EVK')                  canal = 'Subastas'
      }
      if (result[canal] !== undefined) result[canal] += val
      else result['Mostrador'] += val
      // Acumular por asesor (solo Mostrador, Crédito y Accesorios)
      if (['Mostrador','Accesorios'].includes(canal)) {
        porAsesor[asesor] = (porAsesor[asesor] || 0) + val
      }
    })
    return { ...result, porAsesor }
  }, [mostradorRaw, clientesMayoristas, clientesSubastas, anio, mes])

  // ── Parsear ventas a crédito ─────────────────────────────────────────────
  const facturadoCredito = useMemo((): { total: number; porAsesor: Record<string, number> } => {
    // A=0 Almacen, B=1 Refer(vacio=linea secundaria), C=2 Vendedor, E=4 Cuenta,
    // G=6 Fecha, I=8 Prefijo, Q=16 Neto
    // Solo primera linea (B=Refer no vacio). ENR2 = devoluciones (restan).
    if (creditoRaw.length < 2) return { total: 0, porAsesor: {} }
    let total = 0
    const porAsesor: Record<string, number> = {}
    creditoRaw.slice(1).forEach(row => {
      if (!row[1]?.trim()) return // línea secundaria
      const fec = parseFecha(row[6])
      if (!fec) return
      if (fec.getFullYear() !== anio || fec.getMonth() + 1 !== mes) return
      const pref    = row[8]?.trim().toUpperCase() || ''
      const val     = parseCOP(row[16])
      const esDevol = pref === 'ENR2'
      const asesor  = row[3]?.trim() || row[2]?.trim() || 'Sin asesor'
      total += esDevol ? -val : val
      if (!esDevol) porAsesor[asesor] = (porAsesor[asesor] || 0) + val
    })
    return { total, porAsesor }
  }, [creditoRaw, anio, mes])

  // ── Totales por canal ────────────────────────────────────────────────────
  const canales = useMemo((): ResumenCanal[] => {
    const datos: Record<string, number> = {
      'Taller':     facturadoTaller.Taller,
      'Colisión':   facturadoTaller.Colisión,
      'Mostrador':  (facturadoMostrador?.Mostrador ?? 0) + (facturadoCredito?.total ?? 0),
      // Accesorios = Accesorios Taller (11A,12A,13A) + Accesorios Mostrador
      'Accesorios': (facturadoTaller?.AccesoriosTaller ?? 0) + (facturadoMostrador?.Accesorios ?? 0),
      'Mayoristas': facturadoMostrador?.Mayoristas ?? 0,
      'Subastas':   facturadoMostrador?.Subastas ?? 0,
    }

    return Object.entries(datos).map(([nombre, facturado]) => {
      const ppto = presupuesto[nombre] || presupuesto[nombre === 'Colisión' ? 'Colision' : nombre] || 0
      const pct  = ppto ? (facturado / ppto) * 100 : 0
      const porDia = diasHabilesTranscurridos ? facturado / diasHabilesTranscurridos : 0
      const restante = ppto - facturado
      const necesarioPorDia = diasRestantes > 0 ? restante / diasRestantes : restante
      const pronostico = facturado + porDia * diasRestantes
      const pctPron = ppto ? (pronostico / ppto) * 100 : 0

      let alerta: 'ok'|'warning'|'danger' = 'ok'
      if (pctPron < 85) alerta = 'danger'
      else if (pctPron < 95) alerta = 'warning'

      const meta = CANAL_META[nombre] || { color: '#A0AEC0', icon: '📊' }
      return { canal: nombre, ...meta, presupuesto: ppto, facturado, pct, porDia, necesarioPorDia, pronostico, alerta }
    })
  }, [facturadoTaller, facturadoMostrador, facturadoCredito, presupuesto, diasHabilesTranscurridos, diasRestantes])

  const totalFacturado  = canales.reduce((s,c) => s + c.facturado, 0)
  const totalPresupuesto = canales.reduce((s,c) => s + c.presupuesto, 0)
  const totalPct        = totalPresupuesto ? (totalFacturado / totalPresupuesto) * 100 : 0
  const porDiaTotal     = diasHabilesTranscurridos ? totalFacturado / diasHabilesTranscurridos : 0
  const pronosticoTotal = totalFacturado + porDiaTotal * diasRestantes
  const pronosticoPct   = totalPresupuesto ? (pronosticoTotal / totalPresupuesto) * 100 : 0
  const necesarioDia    = diasRestantes > 0 ? (totalPresupuesto - totalFacturado) / diasRestantes : 0

  const alertaGeneral: 'ok'|'warning'|'danger' =
    pronosticoPct < 85 ? 'danger' : pronosticoPct < 95 ? 'warning' : 'ok'

  const coloresAlerta = { ok: '#68D391', warning: '#F6AD55', danger: '#FC8181' }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
        <p className="text-brand-subtle text-sm font-mono">Cargando datos del Sheet...</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-title text-brand-text">Facturación General</h1>
          <p className="text-sm text-brand-subtle mt-0.5">Seguimiento diario vs presupuesto · días hábiles lunes–sábado</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector año */}
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            {[2024,2025,2026].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {/* Selector mes */}
          <select value={mes} onChange={e => setMes(Number(e.target.value))}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            {MESES.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <button onClick={cargar}
            className="bg-brand-teal/20 hover:bg-brand-teal/30 border border-brand-teal/40 text-brand-teal rounded-lg px-4 py-2 text-sm font-mono transition-colors">
            ↻ Actualizar
          </button>
          {ultimaAct && (
            <span className="text-xs text-brand-subtle font-mono">
              Actualizado: {ultimaAct.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-400 text-sm font-mono">
          {error}
        </div>
      )}

      {/* ── Días hábiles ────────────────────────────────────────────────── */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle">
              Días hábiles — {MESES[mes-1]} {anio}
            </p>
            <p className="text-lg font-bold font-title text-brand-text mt-0.5">
              {diasHabilesTranscurridos} de {totalDiasHabiles} transcurridos · {diasRestantes} restantes
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold font-title text-brand-teal">{pctDias.toFixed(0)}%</p>
            <p className="text-xs text-brand-subtle font-mono">del mes avanzado</p>
          </div>
        </div>
        <ProgressBar pct={pctDias} color="#4FD1C5" />
      </Panel>

      {/* ── KPIs generales ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Facturado" value={fmtCOP(totalFacturado)}
          sub={`de ${fmtCOP(totalPresupuesto)} presupuestado`} accent="text-brand-teal"/>
        <KpiCard label="% Avance" value={`${totalPct.toFixed(1)}%`}
          sub={`meta: ${pctDias.toFixed(0)}% del mes`}
          accent={totalPct >= pctDias ? 'text-green-400' : 'text-red-400'}/>
        <KpiCard label="Facturación / día" value={fmtCOP(porDiaTotal)}
          sub={`necesario: ${fmtCOP(necesarioDia)}/día`}
          accent={porDiaTotal >= necesarioDia ? 'text-green-400' : 'text-yellow-400'}/>
        <KpiCard label="Pronóstico cierre" value={fmtCOP(pronosticoTotal)}
          sub={`${pronosticoPct.toFixed(1)}% del presupuesto`}
          accent={pronosticoPct >= 95 ? 'text-green-400' : pronosticoPct >= 85 ? 'text-yellow-400' : 'text-red-400'}
          alert={alertaGeneral === 'danger'}/>
      </div>

      {/* ── Barra general ───────────────────────────────────────────────── */}
      <Panel>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle">
            Avance general vs presupuesto
          </p>
          <AlertChip tipo={alertaGeneral} />
        </div>
        <div className="relative">
          <ProgressBar pct={totalPct} color={coloresAlerta[alertaGeneral]} />
          {/* Marca de días hábiles */}
          <div className="absolute top-0 h-full flex items-center pointer-events-none"
               style={{ left: `${pctDias}%` }}>
            <div className="w-0.5 h-4 bg-white/50 -mt-1" />
          </div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-brand-subtle font-mono">{totalPct.toFixed(1)}% facturado</span>
          <span className="text-xs text-brand-subtle font-mono">{pctDias.toFixed(0)}% días</span>
        </div>
      </Panel>

      {/* ── Tabla por canal ─────────────────────────────────────────────── */}
      <Panel>
        <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
          Detalle por canal
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Canal','Presupuesto','Facturado','% Avance','$/Día actual','$/Día necesario','Pronóstico','Estado'].map(h => (
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {canales.map(c => (
                <tr key={c.canal} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span>{c.icon}</span>
                      <span className="font-medium text-brand-text">{c.canal}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(c.presupuesto)}</td>
                  <td className="py-3 pr-4 font-mono text-xs font-semibold" style={{ color: c.color }}>{fmtCOP(c.facturado)}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="w-16 h-1.5 bg-brand-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width:`${Math.min(100,c.pct)}%`, background: c.color }} />
                      </div>
                      <span className="font-mono text-xs text-brand-subtle">{c.pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(c.porDia)}</td>
                  <td className="py-3 pr-4 font-mono text-xs">
                    <span className={c.porDia >= c.necesarioPorDia ? 'text-green-400' : 'text-red-400'}>
                      {fmtCOP(c.necesarioPorDia)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(c.pronostico)}</td>
                  <td className="py-3 pr-4"><AlertChip tipo={c.alerta} /></td>
                </tr>
              ))}
              {/* Total */}
              <tr className="border-t-2 border-brand-border font-bold">
                <td className="py-3 pr-4 text-brand-text font-mono text-xs uppercase">Total</td>
                <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(totalPresupuesto)}</td>
                <td className="py-3 pr-4 font-mono text-xs text-brand-teal">{fmtCOP(totalFacturado)}</td>
                <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{totalPct.toFixed(1)}%</td>
                <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(porDiaTotal)}</td>
                <td className="py-3 pr-4 font-mono text-xs">
                  <span className={porDiaTotal >= necesarioDia ? 'text-green-400' : 'text-red-400'}>
                    {fmtCOP(necesarioDia)}
                  </span>
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(pronosticoTotal)}</td>
                <td className="py-3 pr-4"><AlertChip tipo={alertaGeneral} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── Cards por canal con barra ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {canales.map(c => {
          const pctPron = c.presupuesto ? (c.pronostico / c.presupuesto) * 100 : 0
          return (
            <Panel key={c.canal} className={c.alerta === 'danger' ? 'border-red-500/40' : c.alerta === 'warning' ? 'border-yellow-500/30' : ''}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{c.icon}</span>
                  <div>
                    <p className="font-semibold text-brand-text">{c.canal}</p>
                    <p className="text-xs text-brand-subtle font-mono">{fmtCOP(c.facturado)} / {fmtCOP(c.presupuesto)}</p>
                  </div>
                </div>
                <AlertChip tipo={c.alerta} />
              </div>
              <ProgressBar pct={c.pct} color={c.color} />
              <div className="flex justify-between mt-2 text-xs font-mono text-brand-subtle">
                <span>{c.pct.toFixed(1)}% avance</span>
                <span>Pron: {pctPron.toFixed(0)}%</span>
              </div>
              <div className="mt-3 pt-3 border-t border-brand-border/40 grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <p className="text-brand-subtle">Actual/día</p>
                  <p className="text-brand-text font-semibold">{fmtCOP(c.porDia)}</p>
                </div>
                <div>
                  <p className="text-brand-subtle">Necesario/día</p>
                  <p className={c.porDia >= c.necesarioPorDia ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {fmtCOP(c.necesarioPorDia)}
                  </p>
                </div>
              </div>
            </Panel>
          )
        })}
      </div>

      {/* ── Facturación por asesor ──────────────────────────────────────── */}
      <Panel>
        <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
          Facturación por asesor — Mostrador, Crédito y Accesorios
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Asesor','Mostrador','Crédito','Total'].map(h => (
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-6">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const mostradorAsesor = facturadoMostrador.porAsesor || {}
                const creditoAsesor   = facturadoCredito.porAsesor   || {}
                const asesores = Array.from(new Set([...Object.keys(mostradorAsesor), ...Object.keys(creditoAsesor)]))
                  .map(a => ({
                    nombre: a,
                    mostrador: mostradorAsesor[a] || 0,
                    credito:   creditoAsesor[a]   || 0,
                    total:    (mostradorAsesor[a] || 0) + (creditoAsesor[a] || 0),
                  }))
                  .sort((a,b) => b.total - a.total)
                const totalMost = asesores.reduce((s,a) => s + a.mostrador, 0)
                const totalCred = asesores.reduce((s,a) => s + a.credito, 0)
                return (
                  <>
                    {asesores.map(a => (
                      <tr key={a.nombre} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                        <td className="py-3 pr-6 text-brand-text font-medium">{a.nombre}</td>
                        <td className="py-3 pr-6 font-mono text-xs text-brand-subtle">{fmtCOP(a.mostrador)}</td>
                        <td className="py-3 pr-6 font-mono text-xs text-brand-subtle">{fmtCOP(a.credito)}</td>
                        <td className="py-3 pr-6 font-mono text-xs text-brand-teal font-semibold">{fmtCOP(a.total)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-brand-border font-bold">
                      <td className="py-3 pr-6 font-mono text-xs uppercase text-brand-text">Total</td>
                      <td className="py-3 pr-6 font-mono text-xs text-brand-subtle">{fmtCOP(totalMost)}</td>
                      <td className="py-3 pr-6 font-mono text-xs text-brand-subtle">{fmtCOP(totalCred)}</td>
                      <td className="py-3 pr-6 font-mono text-xs text-brand-teal">{fmtCOP(totalMost+totalCred)}</td>
                    </tr>
                  </>
                )
              })()}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Datos desde Google Sheets · Actualización automática cada 6 horas · Días hábiles: lunes–sábado sin festivos Colombia
      </p>
    </div>
  )
}
