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
  presupuesto:   '1013471670',
  prefijos:      '83279873',
  tipoClientes:  '1039901350',
  taller:        '1968437267',
  mostrador:     '143806698',
  credito:       '1646038872',
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtCOP = (v: number) => {
  if (v >= 1e9)  return `$${(v/1e9).toFixed(1)}B`
  if (v >= 1e6)  return `$${(v/1e6).toFixed(1)}M`
  if (v >= 1e3)  return `$${(v/1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

const parseCOP = (s: string | undefined | null): number => {
  if (!s) return 0
  const n = parseFloat(String(s).replace(/[$,\s]/g,''))
  return isNaN(n) ? 0 : n
}

const normCuenta = (v: unknown): string => {
  try { return String(parseInt(String(parseFloat(String(v))), 10)).trim() }
  catch { return String(v ?? '').trim() }
}

function parseFecha(s: string | undefined | null): Date | null {
  if (!s) return null
  const str = String(s).trim().replace(/"/g,'')
  // Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y,m,d] = str.slice(0,10).split('-').map(Number)
    return new Date(y, m-1, d)  // usa constructor local, no UTC
  }
  // Formato DD/MM/YY o DD/MM/YYYY
  if (str.includes('/')) {
    const parts = str.split('/')
    if (parts.length === 3) {
      const d = parseInt(parts[0]), m = parseInt(parts[1])
      const y = parseInt(parts[2]) < 100 ? 2000 + parseInt(parts[2]) : parseInt(parts[2])
      return new Date(y, m-1, d)
    }
  }
  return null
}

function esDiaHabil(d: Date): boolean {
  if (d.getDay() === 0) return false
  return !FESTIVOS[d.toISOString().slice(0,10)]
}

function diasHabilesEnMes(anio: number, mes: number): number {
  const d = new Date(anio, mes-1, 1); let c = 0
  while (d.getMonth() === mes-1) { if (esDiaHabil(d)) c++; d.setDate(d.getDate()+1) }
  return c
}

function diasHabilesHasta(anio: number, mes: number, dia: number): number {
  const d = new Date(anio, mes-1, 1); let c = 0
  while (d.getDate() <= dia && d.getMonth() === mes-1) {
    if (esDiaHabil(d)) c++; d.setDate(d.getDate()+1)
  }
  return c
}

async function fetchCSV(gid: string): Promise<string[][]> {
  const url = `${BASE_URL}?gid=${gid}&single=true&output=csv`
  const r   = await fetch(url, { cache: 'no-store' })
  const txt = await r.text()
  return txt.split('\n').map(row => {
    const cells: string[] = []; let cur = '', inQ = false
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '"') { inQ = !inQ; continue }
      if (row[i] === ',' && !inQ) { cells.push(cur.trim()); cur = ''; continue }
      cur += row[i]
    }
    cells.push(cur.trim()); return cells
  })
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const CANAL_META: Record<string,{color:string;icon:string}> = {
  'Taller':     { color:'#4FD1C5', icon:'🔧' },
  'Mostrador':  { color:'#63B3ED', icon:'🛒' },
  'Accesorios': { color:'#F6AD55', icon:'🎁' },
  'Mayoristas': { color:'#B794F4', icon:'📦' },
  'Subastas':   { color:'#FC8181', icon:'🔨' },
  'Colisión':   { color:'#68D391', icon:'🚗' },
}

// ── Componentes UI ───────────────────────────────────────────────────────────
function Panel({ children, className='' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-brand-border bg-brand-surface p-5 ${className}`}>{children}</div>
}

function KpiCard({ label, value, sub, accent='text-brand-teal' }: { label:string; value:string; sub?:string; accent?:string }) {
  return (
    <Panel>
      <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">{label}</p>
      <p className={`text-2xl font-bold font-title ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-brand-subtle mt-1">{sub}</p>}
    </Panel>
  )
}

function ProgressBar({ pct, color }: { pct:number; color:string }) {
  return (
    <div className="w-full h-2 bg-brand-border rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width:`${Math.min(100,Math.max(0,pct))}%`, background:color }} />
    </div>
  )
}

function AlertChip({ tipo }: { tipo:'ok'|'warning'|'danger' }) {
  if (tipo==='ok')      return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-mono">✓ En meta</span>
  if (tipo==='warning') return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-mono">⚠ Alerta</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-mono">✗ Riesgo</span>
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function FacGeneralPage() {
  const hoy = new Date()
  const [anio, setAnio]   = useState(hoy.getFullYear())
  const [mes,  setMes]    = useState(hoy.getMonth()+1)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [ultimaAct, setUltimaAct] = useState<Date|null>(null)

  const [presupuestoRaw,  setPresupuestoRaw]  = useState<string[][]>([])
  const [tallerRaw,       setTallerRaw]       = useState<string[][]>([])
  const [mostradorRaw,    setMostradorRaw]    = useState<string[][]>([])
  const [creditoRaw,      setCreditoRaw]      = useState<string[][]>([])
  const [prefijosRaw,     setPrefijosRaw]     = useState<string[][]>([])
  const [tipoClientesRaw, setTipoClientesRaw] = useState<string[][]>([])
  const [debugCanal,      setDebugCanal]      = useState<string|null>(null)

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [pres,tal,most,cred,pref,tipoC] = await Promise.all([
        fetchCSV(GID.presupuesto), fetchCSV(GID.taller), fetchCSV(GID.mostrador),
        fetchCSV(GID.credito),     fetchCSV(GID.prefijos), fetchCSV(GID.tipoClientes),
      ])
      setPresupuestoRaw(pres); setTallerRaw(tal);  setMostradorRaw(most)
      setCreditoRaw(cred);     setPrefijosRaw(pref); setTipoClientesRaw(tipoC)
      setUltimaAct(new Date())
    } catch { setError('Error cargando datos del Sheet.') }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { const id = setInterval(cargar, 6*60*60*1000); return () => clearInterval(id) }, [cargar])

  // ── Días hábiles ──────────────────────────────────────────────────────────
  const totalDH = useMemo(() => diasHabilesEnMes(anio, mes), [anio, mes])
  const dhTransc = useMemo(() => {
    const esActual = anio===hoy.getFullYear() && mes===hoy.getMonth()+1
    return esActual ? diasHabilesHasta(anio, mes, hoy.getDate()) : totalDH
  }, [anio, mes, totalDH])
  const dhRest  = totalDH - dhTransc
  const pctDias = totalDH ? (dhTransc/totalDH)*100 : 0

  // ── Mapas de referencia ───────────────────────────────────────────────────
  const prefMap = useMemo(() => {
    const m: Record<string,string> = {}
    // Col 0=Prefijo, Col 10=Canales
    prefijosRaw.slice(1).forEach(r => { if(r[0] && r[10]) m[r[0].trim()] = r[10].trim() })
    return m
  }, [prefijosRaw])

  const cuentasMayoristas = useMemo(() => {
    const s = new Set<string>()
    // Col 0=Cuenta Quiter, Col 2=T.Cliente
    tipoClientesRaw.slice(1).forEach(r => {
      if (r[2]?.toLowerCase().includes('mayorist')) s.add(normCuenta(r[0]))
    })
    return s
  }, [tipoClientesRaw])

  const cuentasSubastas = useMemo(() => {
    const s = new Set<string>()
    tipoClientesRaw.slice(1).forEach(r => {
      if (r[2]?.toLowerCase().includes('subast')) s.add(normCuenta(r[0]))
    })
    return s
  }, [tipoClientesRaw])

  // ── Presupuesto ───────────────────────────────────────────────────────────
  const presupuesto = useMemo(() => {
    // Col 4=Canales, col 7+mes-1=valor mensual (col7=Enero)
    const result: Record<string,number> = {}
    const mesIdx = mes - 1 + 7
    presupuestoRaw.slice(1).forEach(r => {
      const canal = r[4]?.trim(); const val = parseCOP(r[mesIdx])
      if (canal && val > 0) result[canal] = (result[canal]||0) + val
    })
    return result
  }, [presupuestoRaw, mes])

  // ── TALLER ────────────────────────────────────────────────────────────────
  // Col: Taller(0), F.cierre(6), Neto(14), Costo(15)
  const facTaller = useMemo((): {Taller:number;Colisión:number;AccTaller:number;CostoTaller:number;CostoColision:number} => {
    let taller=0, colision=0, accTaller=0, costoTaller=0, costoColision=0
    tallerRaw.slice(1).forEach(r => {
      if (!r[0] || !r[14]) return
      const fec = parseFecha(r[6]); if (!fec) return
      if (fec.getFullYear()!==anio || fec.getMonth()+1!==mes) return
      const val   = parseCOP(r[14])
      const costo = parseCOP(r[15])
      const t     = r[0].toString().trim().toUpperCase()
      if      (t==='16')                          { colision+=val;  costoColision+=costo }
      else if (['11A','12A','13A'].includes(t))   accTaller+=val
      else                                        { taller+=val; costoTaller+=costo }
    })
    return { Taller:taller, Colisión:colision, AccTaller:accTaller, CostoTaller:costoTaller, CostoColision:costoColision }
  }, [tallerRaw, anio, mes])

  // ── Debug: filas por canal ────────────────────────────────────────────────
  const debugFilas = useMemo(() => {
    const result: Record<string, {fecha:string;taller:string;neto:number;prefijo:string;cuenta:string;cliente:string}[]> = {
      Taller:[], Colisión:[], AccTaller:[]
    }
    tallerRaw.slice(1).forEach(r => {
      if (!r[0] || !r[14]) return
      const fec = parseFecha(r[6]); if (!fec) return
      if (fec.getFullYear()!==anio || fec.getMonth()+1!==mes) return
      const t = r[0].toString().trim().toUpperCase()
      const entry = { fecha: r[6]?.slice(0,10)||'', taller:r[0], neto:parseCOP(r[14]), prefijo:r[7]||'', cuenta:r[4]||'', cliente:r[5]||'' }
      if (t==='16') result['Colisión'].push(entry)
      else if (['11A','12A','13A'].includes(t)) result['AccTaller'].push(entry)
      else result['Taller'].push(entry)
    })
    return result
  }, [tallerRaw, anio, mes])

  // ── MOSTRADOR ─────────────────────────────────────────────────────────────
  // Col: Cuenta(4), Fecha(6), Prefijo(7), Neto(14), Costo(15), Vendedor2(3)
  const facMostrador = useMemo((): {Mostrador:number;Accesorios:number;Mayoristas:number;Subastas:number;porAsesor:Record<string,number>} => {
    const r: Record<'Mostrador'|'Accesorios'|'Mayoristas'|'Subastas'|'Devolucion',number> =
      { Mostrador:0, Accesorios:0, Mayoristas:0, Subastas:0, Devolucion:0 }
    const porAsesor: Record<string,number> = {}

    mostradorRaw.slice(1).forEach(row => {
      if (!row[14]) return
      const fec = parseFecha(row[6]); if (!fec) return
      if (fec.getFullYear()!==anio || fec.getMonth()+1!==mes) return
      const val    = parseCOP(row[14])
      const cuenta = normCuenta(row[4])
      const pref   = (row[7]||'').trim()
      const asesor = (row[3]||row[2]||'Sin asesor').trim()
      const canalPref = prefMap[pref] || ''

      let canal: 'Mostrador'|'Accesorios'|'Mayoristas'|'Subastas'|'Devolucion' = 'Mostrador'
      if      (cuentasMayoristas.has(cuenta))         canal = 'Mayoristas'
      else if (cuentasSubastas.has(cuenta))           canal = 'Subastas'
      else if (canalPref.includes('Subasta'))         canal = 'Subastas'
      else if (canalPref.includes('Accesorio'))       canal = 'Accesorios'
      else if (pref.startsWith('ENR'))                canal = 'Devolucion' // ya viene negativo

      r[canal] += val
      if (canal==='Mostrador' || canal==='Accesorios') porAsesor[asesor]=(porAsesor[asesor]||0)+val
    })

    return {
      Mostrador:  r.Mostrador + r.Devolucion, // Devolucion ya es negativa
      Accesorios: r.Accesorios,
      Mayoristas: r.Mayoristas,
      Subastas:   r.Subastas,
      porAsesor,
    }
  }, [mostradorRaw, cuentasMayoristas, cuentasSubastas, prefMap, anio, mes])

  // ── CRÉDITO ───────────────────────────────────────────────────────────────
  // Lógica: ffill cols A-K → clasificar cada línea → ENR2 de subastas resta
  // Col: Cuenta(4), Fecha(6), Prefijo(8), Neto(16), Costo(17), Vendedor2(3)
  const facCredito = useMemo((): {Mostrador:number;Subastas:number;Mayoristas:number;porAsesor:Record<string,number>} => {
    const result = { Mostrador:0, Subastas:0, Mayoristas:0 }
    const porAsesor: Record<string,number> = {}

    // Estado del ffill
    let curAlmacen='', curRefer='', curVendedor='', curVendedor2='', curCuenta='',
        curCliente='', curFecha='', curFecha3='', curPrefijo='', curNum='', curAlbaran=''

    creditoRaw.slice(1).forEach(row => {
      // ffill: si col A no está vacía, es primera línea → actualizar estado
      if (row[0]?.trim()) {
        curAlmacen=row[0]; curRefer=row[1]; curVendedor=row[2]; curVendedor2=row[3]
        curCuenta=row[4];  curCliente=row[5]; curFecha=row[6]; curFecha3=row[7]
        curPrefijo=row[8]; curNum=row[9]; curAlbaran=row[10]
      }

      if (!curFecha || !row[16]) return
      const fec = parseFecha(curFecha); if (!fec) return
      if (fec.getFullYear()!==anio || fec.getMonth()+1!==mes) return

      const val    = parseCOP(row[16])
      const cuenta = normCuenta(curCuenta)
      const pref   = curPrefijo.trim()
      const asesor = (curVendedor2||curVendedor||'Sin asesor').trim()
      const esENR2 = pref === 'ENR2'

      if (cuentasSubastas.has(cuenta)) {
        // ENR2 de subastas = devolucion → resta (val ya es positivo en el Sheet)
        result.Subastas += esENR2 ? -val : val
      } else if (cuentasMayoristas.has(cuenta)) {
        result.Mayoristas += val
      } else {
        // ENR2 sin cuenta registrada = devolucion mostrador
        result.Mostrador += esENR2 ? -val : val
        porAsesor[asesor] = (porAsesor[asesor]||0) + (esENR2 ? -val : val)
      }
    })
    return { ...result, porAsesor }
  }, [creditoRaw, cuentasSubastas, cuentasMayoristas, anio, mes])

  // ── Totales por canal ──────────────────────────────────────────────────────
  const canales = useMemo(() => {
    const datos: Record<string,number> = {
      'Taller':     facTaller.Taller,
      'Colisión':   facTaller.Colisión,
      'Accesorios': facTaller.AccTaller + facMostrador.Accesorios,
      'Mostrador':  facMostrador.Mostrador + facCredito.Mostrador,
      'Mayoristas': facMostrador.Mayoristas + facCredito.Mayoristas,
      'Subastas':   facMostrador.Subastas + facCredito.Subastas,
    }

    return Object.entries(datos).map(([nombre, facturado]) => {
      const ppto = presupuesto[nombre] || 0
      const pct  = ppto ? (facturado/ppto)*100 : 0
      const porDia = dhTransc ? facturado/dhTransc : 0
      const restante = ppto - facturado
      const necesarioPorDia = dhRest > 0 ? restante/dhRest : restante
      const pronostico = facturado + porDia*dhRest
      const pctPron = ppto ? (pronostico/ppto)*100 : 0
      const alerta: 'ok'|'warning'|'danger' = pctPron>=95 ? 'ok' : pctPron>=85 ? 'warning' : 'danger'
      const meta = CANAL_META[nombre]||{color:'#A0AEC0',icon:'📊'}
      return { canal:nombre, ...meta, presupuesto:ppto, facturado, pct, porDia, necesarioPorDia, pronostico, alerta }
    })
  }, [facTaller, facMostrador, facCredito, presupuesto, dhTransc, dhRest])

  const totalFacturado   = canales.reduce((s,c)=>s+c.facturado,0)
  const totalPresupuesto = canales.reduce((s,c)=>s+c.presupuesto,0)
  const totalPct         = totalPresupuesto ? (totalFacturado/totalPresupuesto)*100 : 0
  const porDiaTotal      = dhTransc ? totalFacturado/dhTransc : 0
  const necesarioDia     = dhRest>0 ? (totalPresupuesto-totalFacturado)/dhRest : 0
  const pronosticoTotal  = totalFacturado + porDiaTotal*dhRest
  const pronosticoPct    = totalPresupuesto ? (pronosticoTotal/totalPresupuesto)*100 : 0
  const alertaGeneral: 'ok'|'warning'|'danger' = pronosticoPct>=95?'ok':pronosticoPct>=85?'warning':'danger'

  // ── Asesores ───────────────────────────────────────────────────────────────
  const porAsesor = useMemo(() => {
    const mAsesor = facMostrador.porAsesor || {}
    const cAsesor = facCredito.porAsesor   || {}
    const asesores = Array.from(new Set([...Object.keys(mAsesor),...Object.keys(cAsesor)]))
    return asesores.map(a => ({
      nombre: a,
      mostrador: mAsesor[a]||0,
      credito:   cAsesor[a]||0,
      total:    (mAsesor[a]||0)+(cAsesor[a]||0),
    })).filter(a=>a.total!==0).sort((a,b)=>b.total-a.total)
  }, [facMostrador, facCredito])

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

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-title text-brand-text">Facturación General</h1>
          <p className="text-sm text-brand-subtle mt-0.5">Seguimiento diario vs presupuesto · días hábiles lunes–sábado sin festivos</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={anio} onChange={e=>setAnio(Number(e.target.value))}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            {[2024,2025,2026].map(a=><option key={a} value={a}>{a}</option>)}
          </select>
          <select value={mes} onChange={e=>setMes(Number(e.target.value))}
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal">
            {MESES.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select>
          <button onClick={cargar}
            className="bg-brand-teal/20 hover:bg-brand-teal/30 border border-brand-teal/40 text-brand-teal rounded-lg px-4 py-2 text-sm font-mono transition-colors">
            ↻ Actualizar
          </button>
          {ultimaAct && <span className="text-xs text-brand-subtle font-mono">Act: {ultimaAct.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</span>}
        </div>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-400 text-sm font-mono">{error}</div>}

      {/* Días hábiles */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle">Días hábiles — {MESES[mes-1]} {anio}</p>
            <p className="text-lg font-bold font-title text-brand-text mt-0.5">
              {dhTransc} de {totalDH} transcurridos · {dhRest} restantes
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold font-title text-brand-teal">{pctDias.toFixed(0)}%</p>
            <p className="text-xs text-brand-subtle font-mono">del mes avanzado</p>
          </div>
        </div>
        <ProgressBar pct={pctDias} color="#4FD1C5" />
      </Panel>

      {/* KPIs generales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Facturado" value={fmtCOP(totalFacturado)} sub={`de ${fmtCOP(totalPresupuesto)} presupuestado`} accent="text-brand-teal"/>
        <KpiCard label="% Avance" value={`${totalPct.toFixed(1)}%`} sub={`meta: ${pctDias.toFixed(0)}% del mes`}
          accent={totalPct>=pctDias?'text-green-400':'text-red-400'}/>
        <KpiCard label="Facturación / día" value={fmtCOP(porDiaTotal)} sub={`necesario: ${fmtCOP(necesarioDia)}/día`}
          accent={porDiaTotal>=necesarioDia?'text-green-400':'text-yellow-400'}/>
        <KpiCard label="Pronóstico cierre" value={fmtCOP(pronosticoTotal)} sub={`${pronosticoPct.toFixed(1)}% del presupuesto`}
          accent={pronosticoPct>=95?'text-green-400':pronosticoPct>=85?'text-yellow-400':'text-red-400'}/>
      </div>

      {/* Barra general */}
      <Panel>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle">Avance general vs presupuesto</p>
          <AlertChip tipo={alertaGeneral}/>
        </div>
        <div className="relative">
          <ProgressBar pct={totalPct} color={alertaGeneral==='ok'?'#68D391':alertaGeneral==='warning'?'#F6AD55':'#FC8181'}/>
          <div className="absolute top-0 h-full flex items-center pointer-events-none" style={{left:`${pctDias}%`}}>
            <div className="w-0.5 h-4 bg-white/50 -mt-1"/>
          </div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-brand-subtle font-mono">{totalPct.toFixed(1)}% facturado</span>
          <span className="text-xs text-brand-subtle font-mono">{pctDias.toFixed(0)}% días hábiles</span>
        </div>
      </Panel>

      {/* Tabla por canal */}
      <Panel>
        <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Detalle por canal</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Canal','Presupuesto','Facturado','% Avance','$/Día actual','$/Día necesario','Pronóstico','Estado'].map(h=>(
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {canales.map(c=>(
                <tr key={c.canal} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                  <td className="py-3 pr-4"><div className="flex items-center gap-2"><span>{c.icon}</span><span className="font-medium text-brand-text">{c.canal}</span></div></td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(c.presupuesto)}</td>
                  <td className="py-3 pr-4 font-mono text-xs font-semibold" style={{color:c.color}}>{fmtCOP(c.facturado)}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="w-16 h-1.5 bg-brand-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${Math.min(100,c.pct)}%`,background:c.color}}/>
                      </div>
                      <span className="font-mono text-xs text-brand-subtle">{c.pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(c.porDia)}</td>
                  <td className="py-3 pr-4 font-mono text-xs">
                    <span className={c.porDia>=c.necesarioPorDia?'text-green-400':'text-red-400'}>{fmtCOP(c.necesarioPorDia)}</span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(c.pronostico)}</td>
                  <td className="py-3 pr-4"><AlertChip tipo={c.alerta}/></td>
                </tr>
              ))}
              <tr className="border-t-2 border-brand-border font-bold">
                <td className="py-3 pr-4 text-brand-text font-mono text-xs uppercase">Total</td>
                <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(totalPresupuesto)}</td>
                <td className="py-3 pr-4 font-mono text-xs text-brand-teal">{fmtCOP(totalFacturado)}</td>
                <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{totalPct.toFixed(1)}%</td>
                <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(porDiaTotal)}</td>
                <td className="py-3 pr-4 font-mono text-xs"><span className={porDiaTotal>=necesarioDia?'text-green-400':'text-red-400'}>{fmtCOP(necesarioDia)}</span></td>
                <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(pronosticoTotal)}</td>
                <td className="py-3 pr-4"><AlertChip tipo={alertaGeneral}/></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Cards por canal */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {canales.map(c=>{
          const pctPron = c.presupuesto?(c.pronostico/c.presupuesto)*100:0
          return (
            <Panel key={c.canal} className={c.alerta==='danger'?'border-red-500/40':c.alerta==='warning'?'border-yellow-500/30':''}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{c.icon}</span>
                  <div>
                    <p className="font-semibold text-brand-text">{c.canal}</p>
                    <p className="text-xs text-brand-subtle font-mono">{fmtCOP(c.facturado)} / {fmtCOP(c.presupuesto)}</p>
                  </div>
                </div>
                <AlertChip tipo={c.alerta}/>
              </div>
              <ProgressBar pct={c.pct} color={c.color}/>
              <div className="flex justify-between mt-2 text-xs font-mono text-brand-subtle">
                <span>{c.pct.toFixed(1)}% avance</span>
                <span>Pron: {pctPron.toFixed(0)}%</span>
              </div>
              <div className="mt-3 pt-3 border-t border-brand-border/40 grid grid-cols-2 gap-2 text-xs font-mono">
                <div><p className="text-brand-subtle">Actual/día</p><p className="text-brand-text font-semibold">{fmtCOP(c.porDia)}</p></div>
                <div><p className="text-brand-subtle">Necesario/día</p>
                  <p className={c.porDia>=c.necesarioPorDia?'text-green-400 font-semibold':'text-red-400 font-semibold'}>{fmtCOP(c.necesarioPorDia)}</p>
                </div>
              </div>
            </Panel>
          )
        })}
      </div>

      {/* Tabla por asesor */}
      <Panel>
        <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">
          Facturación por asesor — Mostrador, Crédito y Accesorios
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Asesor','Mostrador','Crédito','Total'].map(h=>(
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-6">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porAsesor.map(a=>(
                <tr key={a.nombre} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                  <td className="py-3 pr-6 text-brand-text font-medium">{a.nombre}</td>
                  <td className="py-3 pr-6 font-mono text-xs text-brand-subtle">{fmtCOP(a.mostrador)}</td>
                  <td className="py-3 pr-6 font-mono text-xs text-brand-subtle">{fmtCOP(a.credito)}</td>
                  <td className="py-3 pr-6 font-mono text-xs text-brand-teal font-semibold">{fmtCOP(a.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-brand-border font-bold">
                <td className="py-3 pr-6 font-mono text-xs uppercase text-brand-text">Total</td>
                <td className="py-3 pr-6 font-mono text-xs text-brand-subtle">{fmtCOP(porAsesor.reduce((s,a)=>s+a.mostrador,0))}</td>
                <td className="py-3 pr-6 font-mono text-xs text-brand-subtle">{fmtCOP(porAsesor.reduce((s,a)=>s+a.credito,0))}</td>
                <td className="py-3 pr-6 font-mono text-xs text-brand-teal">{fmtCOP(porAsesor.reduce((s,a)=>s+a.total,0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Debug: detalle por canal */}
      <Panel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle">
            Debug — Detalle filas por canal (Taller)
          </h2>
          <div className="flex gap-2">
            {['Taller','Colisión','AccTaller'].map(c => (
              <button key={c} onClick={()=>setDebugCanal(debugCanal===c?null:c)}
                className={`text-xs px-3 py-1 rounded-lg font-mono border transition-colors ${debugCanal===c?'bg-brand-teal text-black border-brand-teal':'border-brand-border text-brand-subtle hover:border-brand-teal'}`}>
                {c} ({debugFilas[c]?.length||0} filas)
              </button>
            ))}
          </div>
        </div>
        {debugCanal && (
          <div className="overflow-auto max-h-64">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-brand-border text-brand-subtle">
                  <th className="text-left pb-2 pr-4">Taller</th>
                  <th className="text-left pb-2 pr-4">Fecha</th>
                  <th className="text-left pb-2 pr-4">Prefijo</th>
                  <th className="text-left pb-2 pr-4">Cliente</th>
                  <th className="text-right pb-2">Neto</th>
                </tr>
              </thead>
              <tbody>
                {debugFilas[debugCanal]?.map((f,i) => (
                  <tr key={i} className="border-b border-brand-border/30">
                    <td className="py-1 pr-4">{f.taller}</td>
                    <td className="py-1 pr-4">{f.fecha}</td>
                    <td className="py-1 pr-4">{f.prefijo}</td>
                    <td className="py-1 pr-4 max-w-[200px] truncate">{f.cliente}</td>
                    <td className="py-1 text-right text-brand-teal">{fmtCOP(f.neto)}</td>
                  </tr>
                ))}
                <tr className="border-t border-brand-border font-bold">
                  <td colSpan={4} className="py-2 text-brand-subtle">Total</td>
                  <td className="py-2 text-right text-brand-teal">
                    {fmtCOP(debugFilas[debugCanal]?.reduce((s,f)=>s+f.neto,0)||0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-brand-subtle mt-3 font-mono">
          Total filas taller CSV: {tallerRaw.length-1} · Filtrando: {MESES[mes-1]} {anio}
        </p>
      </Panel>

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Datos desde Google Sheets · Actualización automática cada 6 horas · Días hábiles lunes–sábado sin festivos Colombia
      </p>
    </div>
  )
}
