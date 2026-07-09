'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'

const BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgv_V93SUlbyd5gXHKs0znKRVwwTgUSF4WpkmJurZ8N4RxaRj1cTAgCqG0klE4i8BBoiUpbjOMnsxt/pub'
const GID_MOSTRADOR   = '143806698'
const GID_PRESUPUESTO = '1013471630'
const GID_PREFIJOS    = '83279873'
const GID_TIPO_CLI    = '1039901350'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
               'Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const FESTIVOS = new Set([
  '2025-01-01','2025-01-06','2025-03-24','2025-04-17','2025-04-18','2025-05-01',
  '2025-06-02','2025-06-23','2025-06-30','2025-07-20','2025-08-07','2025-08-18',
  '2025-10-13','2025-11-03','2025-11-17','2025-12-08','2025-12-25',
  '2026-01-01','2026-01-05','2026-03-23','2026-04-02','2026-04-03','2026-05-01',
  '2026-05-18','2026-06-08','2026-06-29','2026-07-20','2026-08-07','2026-08-17',
  '2026-10-12','2026-11-02','2026-11-16','2026-12-08','2026-12-25',
])

const fmtCOP = (v: number) => {
  const abs = Math.abs(v), sign = v < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}$${(abs/1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${(abs/1e3).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}

const parseCOP = (s: string | undefined): number => {
  if (!s) return 0
  let str = s.toString().replace(/"/g,'').trim()
  if (str.startsWith('(') && str.endsWith(')')) str = '-' + str.slice(1,-1)
  str = str.replace(/[$\s]/g,'').replace(/,/g,'')
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

const parseFecha = (s: string | undefined): Date | null => {
  if (!s) return null
  const str = s.trim().replace(/"/g,'')
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y,m,d] = str.slice(0,10).split('-').map(Number)
    return new Date(y, m-1, d)
  }
  if (str.includes('/')) {
    const [d,m,y] = str.split('/')
    const anio = parseInt(y) < 100 ? 2000+parseInt(y) : parseInt(y)
    return new Date(anio, parseInt(m)-1, parseInt(d))
  }
  return null
}

const normCuenta = (v: unknown): string => {
  try { return String(parseInt(String(parseFloat(String(v))),10)).trim() }
  catch { return String(v??'').trim() }
}

const esDiaHabil = (d: Date) => d.getDay()!==0 && !FESTIVOS.has(d.toISOString().slice(0,10))

const diasHabilesEnMes = (anio: number, mes: number) => {
  const d = new Date(anio, mes-1, 1); let c = 0
  while (d.getMonth()===mes-1) { if (esDiaHabil(d)) c++; d.setDate(d.getDate()+1) }
  return c
}

const diasHabilesHasta = (anio: number, mes: number, dia: number) => {
  const d = new Date(anio, mes-1, 1); let c = 0
  while (d.getDate()<=dia && d.getMonth()===mes-1) {
    if (esDiaHabil(d)) c++; d.setDate(d.getDate()+1)
  }
  return c
}

const fetchCSV = async (gid: string): Promise<string[][]> => {
  const r = await fetch(`${BASE_URL}?gid=${gid}&single=true&output=csv`, { cache:'no-store' })
  const txt = await r.text()
  return txt.split('\n').map(row => {
    const cells: string[] = []; let cur='', inQ=false
    for (const ch of row) {
      if (ch==='"') { inQ=!inQ; continue }
      if (ch===',' && !inQ) { cells.push(cur.trim()); cur=''; continue }
      cur += ch
    }
    cells.push(cur.trim()); return cells
  })
}

interface Factura {
  registro:   string
  numFactura: string
  cuenta:     string
  cliente:    string
  prefijo:    string
  canal:      string
  neto:       number
  costo:      number
  items:      number
  esDevolucion: boolean
}

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
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width:`${Math.min(100,Math.max(0,pct))}%`, background:color }}/>
    </div>
  )
}

export default function MostradorPage() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes,  setMes]  = useState(hoy.getMonth()+1)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')
  const [ultimaAct,     setUltimaAct]     = useState<Date|null>(null)
  const [mostradorRaw,  setMostradorRaw]  = useState<string[][]>([])
  const [pptoRaw,       setPptoRaw]       = useState<string[][]>([])
  const [prefijosRaw,   setPrefijosRaw]   = useState<string[][]>([])
  const [tipoCliRaw,    setTipoCliRaw]    = useState<string[][]>([])
  const [buscar,        setBuscar]        = useState('')
  const [ordenCol,      setOrdenCol]      = useState<'registro'|'cliente'|'canal'|'neto'>('neto')
  const [ordenDir,      setOrdenDir]      = useState<'asc'|'desc'>('desc')
  const [mostrarTodos,  setMostrarTodos]  = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [most, ppto, pref, tipoC] = await Promise.all([
        fetchCSV(GID_MOSTRADOR), fetchCSV(GID_PRESUPUESTO),
        fetchCSV(GID_PREFIJOS),  fetchCSV(GID_TIPO_CLI),
      ])
      setMostradorRaw(most); setPptoRaw(ppto)
      setPrefijosRaw(pref);  setTipoCliRaw(tipoC)
      setUltimaAct(new Date())
    } catch { setError('Error cargando datos del Sheet.') }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { const id=setInterval(cargar,6*60*60*1000); return ()=>clearInterval(id) }, [cargar])

  const totalDH  = useMemo(() => diasHabilesEnMes(anio, mes), [anio, mes])
  const dhTransc = useMemo(() => {
    const esActual = anio===hoy.getFullYear() && mes===hoy.getMonth()+1
    return esActual ? diasHabilesHasta(anio, mes, hoy.getDate()) : totalDH
  }, [anio, mes, totalDH])
  const dhRest  = totalDH - dhTransc
  const pctDias = totalDH ? (dhTransc/totalDH)*100 : 0

  // Mapas de referencia
  const prefMap = useMemo(() => {
    const m: Record<string,string> = {}
    prefijosRaw.slice(1).forEach(r => { if(r[0]&&r[10]) m[r[0].trim()] = r[10].trim() })
    return m
  }, [prefijosRaw])

  const cuentasMayoristas = useMemo(() => {
    const s = new Set<string>()
    tipoCliRaw.slice(1).forEach(r => {
      if (r[2]?.toLowerCase().includes('mayorist')) s.add(normCuenta(r[0]))
    })
    return s
  }, [tipoCliRaw])

  const cuentasSubastas = useMemo(() => {
    const s = new Set<string>()
    tipoCliRaw.slice(1).forEach(r => {
      if (r[2]?.toLowerCase().includes('subast')) s.add(normCuenta(r[0]))
    })
    return s
  }, [tipoCliRaw])

  // Presupuesto
  const presupuesto = useMemo(() => {
    const mesIdx = mes - 1 + 7
    return pptoRaw.slice(1)
      .filter(r => r[4]?.trim() === 'Mostrador')
      .reduce((s,r) => s + parseCOP(r[mesIdx]), 0)
  }, [pptoRaw, mes])

  // Todas las facturas con su clasificación
  // Almacé(0), Refer.(1), Vendedo(2), Nombre vendedor(3), Cuenta(4),
  // Nombre cliente(5), Fecha(6), Prefijo(7), Prefijo/num(8), Neto(14), Costo(15)
  const todasFacturas = useMemo((): Factura[] => {
    const mapa: Record<string, Factura> = {}
    mostradorRaw.slice(1).forEach(r => {
      if (!r[14]) return
      const fec = parseFecha(r[6]); if (!fec) return
      if (fec.getFullYear()!==anio || fec.getMonth()+1!==mes) return
      const key    = r[1]?.trim() || ''
      if (!key) return
      const cuenta = normCuenta(r[4])
      const pref   = r[7]?.trim() || ''
      const canal  = prefMap[pref] || pref
      const neto   = parseCOP(r[14])
      const costo  = parseCOP(r[15])
      if (!mapa[key]) {
        mapa[key] = {
          registro:   r[1]?.trim() || '',
          numFactura: r[8]?.trim() || '',
          cuenta,
          cliente:    r[5]?.trim() || '',
          prefijo:    pref,
          canal,
          neto: 0, costo: 0, items: 0,
          esDevolucion: false,
        }
      }
      mapa[key].neto  += neto
      mapa[key].costo += costo
      mapa[key].items += 1
    })
    return Object.values(mapa).map(f => ({
      ...f,
      esDevolucion: f.neto < 0
    }))
  }, [mostradorRaw, prefMap, anio, mes])

  // Solo mostrador puro (sin mayoristas, subastas, accesorios)
  const facturasMostrador = useMemo(() =>
    todasFacturas.filter(f => {
      if (cuentasMayoristas.has(f.cuenta)) return false
      if (cuentasSubastas.has(f.cuenta))   return false
      if (f.canal.toLowerCase().includes('accesorio')) return false
      return true
    })
  , [todasFacturas, cuentasMayoristas, cuentasSubastas])

  const facturas = mostrarTodos ? todasFacturas : facturasMostrador

  const totalNeto     = facturasMostrador.reduce((s,f) => s+f.neto, 0)
  const totalCosto    = facturasMostrador.reduce((s,f) => s+f.costo, 0)
  const totalUtilidad = totalNeto - totalCosto
  const pctUtilidad   = totalNeto ? (totalUtilidad/totalNeto)*100 : 0
  const pctAvance     = presupuesto ? (totalNeto/presupuesto)*100 : 0
  const porDia        = dhTransc ? totalNeto/dhTransc : 0
  const necesarioDia  = dhRest > 0 ? (presupuesto-totalNeto)/dhRest : 0
  const pronostico    = totalNeto + porDia*dhRest
  const pctPronos     = presupuesto ? (pronostico/presupuesto)*100 : 0
  const colorAvance   = pctAvance>=pctDias ? '#68D391' : pctAvance>=pctDias*0.8 ? '#F6AD55' : '#FC8181'

  const facturasFiltradas = useMemo(() => {
    let lista = [...facturas]
    if (buscar) {
      const b = buscar.toLowerCase()
      lista = lista.filter(f =>
        f.registro.includes(b) || f.cliente.toLowerCase().includes(b) ||
        f.cuenta.includes(b)   || f.prefijo.toLowerCase().includes(b)
      )
    }
    lista.sort((a,b) => {
      const va = a[ordenCol], vb = b[ordenCol]
      if (typeof va==='string' && typeof vb==='string')
        return ordenDir==='asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return ordenDir==='asc' ? (va as number)-(vb as number) : (vb as number)-(va as number)
    })
    return lista
  }, [facturas, buscar, ordenCol, ordenDir])

  const ordenar = (col: typeof ordenCol) => {
    if (ordenCol===col) setOrdenDir(d => d==='asc'?'desc':'asc')
    else { setOrdenCol(col); setOrdenDir('desc') }
  }
  const thCls = (col: typeof ordenCol) =>
    `text-left font-mono text-xs uppercase tracking-wider pb-3 pr-4 cursor-pointer select-none whitespace-nowrap
     ${ordenCol===col ? 'text-brand-teal' : 'text-brand-subtle'}`
  const icono = (col: typeof ordenCol) => ordenCol===col ? (ordenDir==='asc'?'↑':'↓') : '↕'

  const canalColor = (canal: string) => {
    if (canal.toLowerCase().includes('accesorio')) return 'text-yellow-400'
    if (canal.toLowerCase().includes('subasta'))   return 'text-red-400'
    if (canal.toLowerCase().includes('mayorist'))  return 'text-purple-400'
    return 'text-brand-subtle'
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
        <p className="text-brand-subtle text-sm font-mono">Cargando datos...</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🛒</span>
            <h1 className="text-2xl font-bold font-title text-brand-text">Mostrador</h1>
          </div>
          <p className="text-sm text-brand-subtle">Ventas directas mostrador · excluye mayoristas, subastas y accesorios</p>
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
          <p className="text-2xl font-bold font-title text-brand-teal">{pctDias.toFixed(0)}%</p>
        </div>
        <ProgressBar pct={pctDias} color="#4FD1C5"/>
      </Panel>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Facturado" value={fmtCOP(totalNeto)} sub={`de ${fmtCOP(presupuesto)} presupuestado`} accent="text-brand-teal"/>
        <KpiCard label="% Avance" value={`${pctAvance.toFixed(1)}%`} sub={`meta: ${pctDias.toFixed(0)}% del mes`}
          accent={pctAvance>=pctDias?'text-green-400':'text-red-400'}/>
        <KpiCard label="Utilidad" value={fmtCOP(totalUtilidad)} sub={`${pctUtilidad.toFixed(1)}% sobre ventas`} accent="text-brand-teal"/>
        <KpiCard label="Pronóstico cierre" value={fmtCOP(pronostico)} sub={`${pctPronos.toFixed(1)}% del presupuesto`}
          accent={pctPronos>=95?'text-green-400':pctPronos>=85?'text-yellow-400':'text-red-400'}/>
      </div>

      {/* Barra avance */}
      <Panel>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle">Avance vs presupuesto</p>
          <div className="flex gap-4 text-xs font-mono">
            <span className="text-brand-subtle">$/día actual: <span className="text-brand-text">{fmtCOP(porDia)}</span></span>
            <span className="text-brand-subtle">$/día necesario: <span className={porDia>=necesarioDia?'text-green-400':'text-red-400'}>{fmtCOP(necesarioDia)}</span></span>
          </div>
        </div>
        <div className="relative">
          <ProgressBar pct={pctAvance} color={colorAvance}/>
          <div className="absolute top-0 h-full flex items-center pointer-events-none" style={{left:`${pctDias}%`}}>
            <div className="w-0.5 h-4 bg-white/50 -mt-1"/>
          </div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-brand-subtle font-mono">{pctAvance.toFixed(1)}% facturado</span>
          <span className="text-xs text-brand-subtle font-mono">{pctDias.toFixed(0)}% días hábiles</span>
        </div>
      </Panel>

      {/* Tabla */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle">
              Detalle de facturas
            </h2>
            <button onClick={()=>setMostrarTodos(!mostrarTodos)}
              className={`text-xs px-3 py-1 rounded-lg font-mono border transition-colors
                ${mostrarTodos ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' : 'border-brand-border text-brand-subtle hover:border-brand-teal'}`}>
              {mostrarTodos ? '👁 Mostrando todas' : '👁 Ver todas (incluye otros canales)'}
            </button>
          </div>
          <input type="text" placeholder="Buscar registro, cliente, cuenta..."
            value={buscar} onChange={e=>setBuscar(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-sm text-brand-text font-mono focus:outline-none focus:border-brand-teal w-64"/>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                <th className={thCls('registro')} onClick={()=>ordenar('registro')}>N° Registro {icono('registro')}</th>
                <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">N° Factura</th>
                <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Cuenta</th>
                <th className={thCls('cliente')} onClick={()=>ordenar('cliente')}>Cliente {icono('cliente')}</th>
                <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Prefijo</th>
                <th className={thCls('canal')} onClick={()=>ordenar('canal')}>Canal {icono('canal')}</th>
                <th className="text-right font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Items</th>
                <th className="text-right font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Costo</th>
                <th className={`text-right font-mono text-xs uppercase tracking-wider pb-3 pr-4 cursor-pointer select-none whitespace-nowrap ${ordenCol==='neto'?'text-brand-teal':'text-brand-subtle'}`}
                  onClick={()=>ordenar('neto')}>Neto {icono('neto')}</th>
                <th className="text-right font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3">Utilidad</th>
              </tr>
            </thead>
            <tbody>
              {facturasFiltradas.map(f => {
                const util = f.neto - f.costo
                const pctU = f.neto ? (util/f.neto)*100 : 0
                const esMostPuro = !cuentasMayoristas.has(f.cuenta) && !cuentasSubastas.has(f.cuenta) && !f.canal.toLowerCase().includes('accesorio')
                return (
                  <tr key={f.registro}
                    className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors
                      ${f.esDevolucion ? 'bg-red-500/5' : ''}
                      ${mostrarTodos && !esMostPuro ? 'opacity-50' : ''}`}>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.registro}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.numFactura}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.cuenta}</td>
                    <td className="py-3 pr-4 text-brand-text font-medium max-w-[200px] truncate">{f.cliente}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.prefijo}</td>
                    <td className={`py-3 pr-4 font-mono text-xs ${canalColor(f.canal)}`}>{f.canal}</td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-brand-subtle">{f.items}</td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-brand-subtle">{fmtCOP(f.costo)}</td>
                    <td className={`py-3 pr-4 text-right font-mono text-xs font-semibold ${f.esDevolucion?'text-red-400':'text-brand-teal'}`}>
                      {fmtCOP(f.neto)}
                      {f.esDevolucion && <span className="ml-1 text-xs text-red-400/70">(dev)</span>}
                    </td>
                    <td className="py-3 text-right font-mono text-xs">
                      <span className={pctU>=15?'text-green-400':'text-yellow-400'}>
                        {fmtCOP(util)} <span className="text-brand-subtle">({pctU.toFixed(1)}%)</span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brand-border">
                <td className="pt-3 font-mono text-xs uppercase text-brand-text font-bold">Total</td>
                <td colSpan={5} className="pt-3 font-mono text-xs text-brand-subtle">
                  {facturasFiltradas.length} factura{facturasFiltradas.length!==1?'s':''} mostradas
                </td>
                <td className="pt-3 text-right font-mono text-xs text-brand-subtle">
                  {facturasFiltradas.reduce((s,f)=>s+f.items,0)}
                </td>
                <td className="pt-3 text-right font-mono text-xs text-brand-subtle">
                  {fmtCOP(facturasFiltradas.reduce((s,f)=>s+f.costo,0))}
                </td>
                <td className="pt-3 text-right font-mono text-xs text-brand-teal font-bold">
                  {fmtCOP(facturasFiltradas.reduce((s,f)=>s+f.neto,0))}
                </td>
                <td className="pt-3 text-right font-mono text-xs text-green-400 font-bold">
                  {fmtCOP(facturasFiltradas.reduce((s,f)=>s+(f.neto-f.costo),0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {facturasFiltradas.length===0 && (
          <p className="text-center text-brand-subtle font-mono text-sm py-8">
            No se encontraron facturas.
          </p>
        )}
      </Panel>

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Mostrador · Datos desde Google Sheets · Actualización cada 6 horas
      </p>
    </div>
  )
}
