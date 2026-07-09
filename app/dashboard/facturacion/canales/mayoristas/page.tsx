'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'

const BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgv_V93SUlbyd5gXHKs0znKRVwwTgUSF4WpkmJurZ8N4RxaRj1cTAgCqG0klE4i8BBoiUpbjOMnsxt/pub'
const GID = {
  mostrador:    '143806698',
  credito:      '1646038872',
  presupuesto:  '1013471630',
  tipoClientes: '1039901350',
}

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
  fuente:     string
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

export default function MayoristasPage() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes,  setMes]  = useState(hoy.getMonth()+1)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [ultimaAct,    setUltimaAct]    = useState<Date|null>(null)
  const [mostradorRaw, setMostradorRaw] = useState<string[][]>([])
  const [creditoRaw,   setCreditoRaw]   = useState<string[][]>([])
  const [pptoRaw,      setPptoRaw]      = useState<string[][]>([])
  const [tipoCliRaw,   setTipoCliRaw]   = useState<string[][]>([])
  const [buscar,       setBuscar]       = useState('')
  const [ordenCol,     setOrdenCol]     = useState<'registro'|'cliente'|'neto'>('neto')
  const [ordenDir,     setOrdenDir]     = useState<'asc'|'desc'>('desc')
  const [filtroCliente, setFiltroCliente] = useState<string>('todos')

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [most, cred, ppto, tipoC] = await Promise.all([
        fetchCSV(GID.mostrador), fetchCSV(GID.credito),
        fetchCSV(GID.presupuesto), fetchCSV(GID.tipoClientes),
      ])
      setMostradorRaw(most); setCreditoRaw(cred)
      setPptoRaw(ppto);      setTipoCliRaw(tipoC)
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

  // Clientes mayoristas
  const mayoristasMap = useMemo(() => {
    const m: Record<string, string> = {}
    tipoCliRaw.slice(1).forEach(r => {
      if (r[2]?.toLowerCase().includes('mayorist')) {
        m[normCuenta(r[0])] = r[1]?.trim() || normCuenta(r[0])
      }
    })
    return m
  }, [tipoCliRaw])

  const cuentasMayoristas = useMemo(() => new Set(Object.keys(mayoristasMap)), [mayoristasMap])

  // Presupuesto
  const presupuesto = useMemo(() => {
    const mesIdx = mes - 1 + 7
    return pptoRaw.slice(1).filter(r=>r[4]?.trim()==='Mayoristas').reduce((s,r)=>s+parseCOP(r[mesIdx]),0)
  }, [pptoRaw, mes])

  // Facturas: Mostrador + Crédito filtradas por cuentas mayoristas
  const facturas = useMemo((): Factura[] => {
    const mapa: Record<string, Factura> = {}

    // Mostrador — Cuenta(4), Fecha(6), Prefijo(7), Prefijo/num(8), Neto(14), Costo(15)
    mostradorRaw.slice(1).forEach(r => {
      if (!r[14]) return
      const fec = parseFecha(r[6]); if (!fec) return
      if (fec.getFullYear()!==anio || fec.getMonth()+1!==mes) return
      const cuenta = normCuenta(r[4])
      if (!cuentasMayoristas.has(cuenta)) return
      const key = r[1]?.trim() || ''; if (!key) return
      const neto = parseCOP(r[14]); const costo = parseCOP(r[15])
      if (!mapa[key]) mapa[key] = {
        registro: key, numFactura: r[8]?.trim()||'', cuenta,
        cliente: r[5]?.trim()||mayoristasMap[cuenta]||'', prefijo: r[7]?.trim()||'',
        fuente: 'Mostrador', neto:0, costo:0, items:0, esDevolucion:false
      }
      mapa[key].neto += neto; mapa[key].costo += costo; mapa[key].items += 1
    })

    // Crédito — ffill: Almacén(0),Refer.(1),Vendedor(2),Vendedor2(3),Cuenta(4),
    // Nombre cliente(5),Fecha(6),Fecha3(7),Prefijo(8),Número(9),Neto(16),Costo(17)
    let curRefer='', curCuenta='', curCliente='', curFecha='', curPrefijo='', curNum=''
    creditoRaw.slice(1).forEach(r => {
      if (r[0]?.trim()) {
        curRefer=r[1]; curCuenta=r[4]; curCliente=r[5]
        curFecha=r[6]; curPrefijo=r[8]; curNum=r[9]
      }
      if (!curFecha || !r[16]) return
      const fec = parseFecha(curFecha); if (!fec) return
      if (fec.getFullYear()!==anio || fec.getMonth()+1!==mes) return
      const cuenta = normCuenta(curCuenta)
      if (!cuentasMayoristas.has(cuenta)) return
      const key = curRefer?.trim() || ''; if (!key) return
      const neto = parseCOP(r[16]); const costo = parseCOP(r[17])
      if (!mapa[key]) mapa[key] = {
        registro: key, numFactura: curNum?.trim()||'', cuenta,
        cliente: curCliente?.trim()||mayoristasMap[cuenta]||'', prefijo: curPrefijo?.trim()||'',
        fuente: 'Crédito', neto:0, costo:0, items:0, esDevolucion:false
      }
      mapa[key].neto += neto; mapa[key].costo += costo; mapa[key].items += 1
    })

    return Object.values(mapa).map(f => ({ ...f, esDevolucion: f.neto < 0 }))
  }, [mostradorRaw, creditoRaw, cuentasMayoristas, mayoristasMap, anio, mes])

  // Totales
  const totalNeto     = facturas.reduce((s,f)=>s+f.neto,0)
  const totalCosto    = facturas.reduce((s,f)=>s+f.costo,0)
  const totalUtilidad = totalNeto - totalCosto
  const pctUtilidad   = totalNeto ? (totalUtilidad/totalNeto)*100 : 0
  const pctAvance     = presupuesto ? (totalNeto/presupuesto)*100 : 0
  const porDia        = dhTransc ? totalNeto/dhTransc : 0
  const necesarioDia  = dhRest>0 ? (presupuesto-totalNeto)/dhRest : 0
  const pronostico    = totalNeto + porDia*dhRest
  const pctPronos     = presupuesto ? (pronostico/presupuesto)*100 : 0
  const colorAvance   = pctAvance>=pctDias?'#68D391':pctAvance>=pctDias*0.8?'#F6AD55':'#FC8181'

  // Resumen por cliente
  const porCliente = useMemo(() => {
    const m: Record<string,{neto:number;costo:number;facturas:number}> = {}
    facturas.forEach(f => {
      const k = f.cliente || f.cuenta
      if (!m[k]) m[k] = {neto:0,costo:0,facturas:0}
      m[k].neto += f.neto; m[k].costo += f.costo; m[k].facturas += 1
    })
    return Object.entries(m).sort((a,b)=>b[1].neto-a[1].neto)
  }, [facturas])

  // Filtro y orden
  const facturasFiltradas = useMemo(() => {
    let lista = [...facturas]
    if (filtroCliente!=='todos') lista = lista.filter(f=>f.cliente===filtroCliente||f.cuenta===filtroCliente)
    if (buscar) {
      const b = buscar.toLowerCase()
      lista = lista.filter(f=>f.registro.includes(b)||f.cliente.toLowerCase().includes(b)||f.cuenta.includes(b))
    }
    lista.sort((a,b)=>{
      const va=a[ordenCol], vb=b[ordenCol]
      if (typeof va==='string'&&typeof vb==='string')
        return ordenDir==='asc'?va.localeCompare(vb):vb.localeCompare(va)
      return ordenDir==='asc'?(va as number)-(vb as number):(vb as number)-(va as number)
    })
    return lista
  }, [facturas, filtroCliente, buscar, ordenCol, ordenDir])

  const ordenar = (col: typeof ordenCol) => {
    if (ordenCol===col) setOrdenDir(d=>d==='asc'?'desc':'asc')
    else { setOrdenCol(col); setOrdenDir('desc') }
  }
  const thCls = (col: typeof ordenCol) =>
    `text-left font-mono text-xs uppercase tracking-wider pb-3 pr-4 cursor-pointer select-none whitespace-nowrap
     ${ordenCol===col?'text-brand-teal':'text-brand-subtle'}`
  const icono = (col: typeof ordenCol) => ordenCol===col?(ordenDir==='asc'?'↑':'↓'):'↕'

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
            <span className="text-2xl">📦</span>
            <h1 className="text-2xl font-bold font-title text-brand-text">Mayoristas</h1>
          </div>
          <p className="text-sm text-brand-subtle">Clientes distribuidores · mostrador y crédito</p>
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

      {/* Resumen por cliente */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {porCliente.map(([cliente, datos]) => {
          const util = datos.neto - datos.costo
          const pctU = datos.neto ? (util/datos.neto)*100 : 0
          const activo = filtroCliente===cliente
          return (
            <div key={cliente} onClick={()=>setFiltroCliente(activo?'todos':cliente)}
              className={`rounded-xl border p-4 cursor-pointer transition-colors
                ${activo?'border-brand-teal bg-brand-teal/10':'border-brand-border bg-brand-surface hover:border-brand-teal/50'}`}>
              <div className="flex justify-between items-start mb-2">
                <p className="font-semibold text-brand-text text-sm leading-tight">{cliente}</p>
                {activo && <span className="text-xs px-2 py-0.5 rounded-full bg-brand-teal/20 text-brand-teal font-mono">Activo</span>}
              </div>
              <p className="text-xl font-bold font-title text-brand-teal">{fmtCOP(datos.neto)}</p>
              <div className="flex justify-between mt-2 text-xs font-mono text-brand-subtle">
                <span>{datos.facturas} factura{datos.facturas!==1?'s':''}</span>
                <span>Util: {pctU.toFixed(1)}%</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabla */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle">Detalle de facturas</h2>
            {filtroCliente!=='todos' && (
              <button onClick={()=>setFiltroCliente('todos')}
                className="text-xs px-2 py-0.5 rounded-full bg-brand-teal/20 text-brand-teal font-mono">
                {filtroCliente} ✕
              </button>
            )}
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
                <th className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">Fuente</th>
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
                return (
                  <tr key={`${f.registro}-${f.fuente}`}
                    className={`border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors ${f.esDevolucion?'bg-red-500/5':''}`}>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.registro}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.numFactura}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{f.cuenta}</td>
                    <td className="py-3 pr-4 text-brand-text font-medium max-w-[200px] truncate">{f.cliente}</td>
                    <td className="py-3 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-surface border border-brand-border font-mono text-brand-subtle">
                        {f.fuente}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-brand-subtle">{f.items}</td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-brand-subtle">{fmtCOP(f.costo)}</td>
                    <td className={`py-3 pr-4 text-right font-mono text-xs font-semibold ${f.esDevolucion?'text-red-400':'text-brand-teal'}`}>
                      {fmtCOP(f.neto)}{f.esDevolucion&&<span className="ml-1 text-xs text-red-400/70">(dev)</span>}
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
                <td colSpan={4} className="pt-3 font-mono text-xs text-brand-subtle">{facturasFiltradas.length} facturas</td>
                <td className="pt-3 text-right font-mono text-xs text-brand-subtle">{facturasFiltradas.reduce((s,f)=>s+f.items,0)}</td>
                <td className="pt-3 text-right font-mono text-xs text-brand-subtle">{fmtCOP(facturasFiltradas.reduce((s,f)=>s+f.costo,0))}</td>
                <td className="pt-3 text-right font-mono text-xs text-brand-teal font-bold">{fmtCOP(facturasFiltradas.reduce((s,f)=>s+f.neto,0))}</td>
                <td className="pt-3 text-right font-mono text-xs text-green-400 font-bold">{fmtCOP(facturasFiltradas.reduce((s,f)=>s+(f.neto-f.costo),0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {facturasFiltradas.length===0 && (
          <p className="text-center text-brand-subtle font-mono text-sm py-8">No se encontraron facturas.</p>
        )}
      </Panel>

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Mayoristas · Datos desde Google Sheets · Actualización cada 6 horas
      </p>
    </div>
  )
}
