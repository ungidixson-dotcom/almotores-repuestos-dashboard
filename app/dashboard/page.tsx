'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts'
import { LogOut, TrendingUp, CheckCircle, Clock, AlertTriangle, FileCheck, FileX, FileClock, Timer, TrendingDown } from 'lucide-react'

const ESTADOS_GANADOS   = ['Autorizada Completa', 'Autorizada parcial']
const ESTADOS_RESUELTOS = ['Autorizada Completa', 'Autorizada parcial', 'NO Autorizada']
const ORDEN_MESES: Record<string,number> = { enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12 }
const COLORES_ESTADO: Record<string,string> = { 'Autorizada Completa':'#4FD1C5','Autorizada parcial':'#E8A33D','NO Autorizada':'#E5484D','Subasta no aplicada':'#5B6472','Sin respuesta':'#8AA4C8' }
const COLORES_CIUDADES = ['#4FD1C5','#E8A33D','#8AA4C8','#E5484D','#60A5FA','#A78BFA','#34D399','#F87171','#FBBF24','#6EE7B7']

const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n||0)
const fmtPct = (n: number) => `${(n||0).toFixed(1)}%`

type Aseguradora  = { id: number; nombre_corto: string }
type Asesor       = { id: number; nombre: string }
type ResumenMensual = { mes: string; orden: number; total_subastas: number; ganadas: number; no_autorizadas: number; valor_autorizado: number; valor_subastado: number }
// Fila de v_kpis_subastas — agregada por combinación de dimensiones
type KpiRow = {
  mes_subasta: string; marca: string
  aseguradora_id: number; asesor_id: number
  estado_autorizacion: string; ciudad_destino: string
  total: number; valor_subastado: number; valor_autorizado: number; tiempo_promedio: number
}
type Factura = { id: number; placa: string; marca: string; aseguradora_id: number; asesor_id: number; est_radicacion: string; fecha_radicado: string; base_imp: number; mes: string }

export default function Dashboard() {
  const router = useRouter()
  const [kpiRows,      setKpiRows]      = useState<KpiRow[]>([])
  const [facturas,     setFacturas]     = useState<Factura[]>([])
  const [aseguradoras, setAseguradoras] = useState<Aseguradora[]>([])
  const [asesores,     setAsesores]     = useState<Asesor[]>([])
  const [resumenMensual,   setResumenMensual]   = useState<ResumenMensual[]>([])
  const [mesesDisponibles, setMesesDisponibles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroAsesor,      setFiltroAsesor]      = useState(0)
  const [filtroAseguradora, setFiltroAseguradora] = useState(0)
  const [filtroMes,         setFiltroMes]         = useState('todos')
  const [filtroMarca,       setFiltroMarca]       = useState('todas')

  const asegMap = useMemo(() => { const m: Record<number,string> = {}; aseguradoras.forEach(a=>{m[a.id]=a.nombre_corto}); return m },[aseguradoras])
  const asesMap = useMemo(() => { const m: Record<number,string> = {}; asesores.forEach(a=>{m[a.id]=a.nombre}); return m },[asesores])

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [{ data: kpis }, { data: f }, { data: aseg }, { data: ases }, { data: resumen }, { data: meses }] = await Promise.all([
        supabase.from('v_kpis_subastas').select('*'),
        supabase.from('facturas').select('id,placa,marca,aseguradora_id,asesor_id,est_radicacion,fecha_radicado,base_imp,mes').limit(2000),
        supabase.from('aseguradoras').select('id,nombre_corto'),
        supabase.from('asesores').select('id,nombre'),
        supabase.from('v_resumen_mensual').select('*'),
        supabase.from('v_meses_disponibles').select('mes,orden').order('orden'),
      ])
      setKpiRows((kpis as KpiRow[]) || [])
      setFacturas((f as Factura[]) || [])
      setAseguradoras((aseg as Aseguradora[]) || [])
      setAsesores((ases as Asesor[]) || [])
      setResumenMensual((resumen as ResumenMensual[]) || [])
      setMesesDisponibles(((meses as unknown as {mes:string}[]) || []).map(m=>m.mes).filter(Boolean))
      setLoading(false)
    }
    fetchData()
  }, [router])

  async function handleLogout() { await supabase.auth.signOut(); router.push('/login') }

  const marcas = useMemo(() => {
    const ms = kpiRows.map(r=>r.marca).filter((m): m is string => !!m && m.trim()!=='')
    return ['todas',...Array.from(new Set(ms)).sort()]
  }, [kpiRows])

  const meses = useMemo(() => ['todos',...mesesDisponibles], [mesesDisponibles])

  // Filtrar kpiRows
  const sf = useMemo(() => kpiRows.filter(r =>
    (filtroAsesor===0      || r.asesor_id===filtroAsesor) &&
    (filtroAseguradora===0 || r.aseguradora_id===filtroAseguradora) &&
    (filtroMes==='todos'   || r.mes_subasta===filtroMes) &&
    (filtroMarca==='todas' || r.marca===filtroMarca)
  ), [kpiRows, filtroAsesor, filtroAseguradora, filtroMes, filtroMarca])

  // Filtrar facturas
  const ff = useMemo(() => facturas.filter(f =>
    (filtroAsesor===0      || f.asesor_id===filtroAsesor) &&
    (filtroAseguradora===0 || f.aseguradora_id===filtroAseguradora) &&
    (filtroMes==='todos'   || f.mes===filtroMes) &&
    (filtroMarca==='todas' || f.marca===filtroMarca)
  ), [facturas, filtroAsesor, filtroAseguradora, filtroMes, filtroMarca])

  // KPIs desde las filas agregadas
  const kpis = useMemo(() => {
    const total      = sf.reduce((a,r)=>a+(r.total||0), 0)
    const ganadas    = sf.filter(r=>ESTADOS_GANADOS.includes(r.estado_autorizacion)).reduce((a,r)=>a+(r.total||0),0)
    const resueltas  = sf.filter(r=>ESTADOS_RESUELTOS.includes(r.estado_autorizacion)).reduce((a,r)=>a+(r.total||0),0)
    const sinResp    = sf.filter(r=>!ESTADOS_RESUELTOS.includes(r.estado_autorizacion) && r.estado_autorizacion!=='Subasta no aplicada').reduce((a,r)=>a+(r.total||0),0)
    const tasaAuth   = resueltas ? (ganadas/resueltas)*100 : 0
    const efectividad = total ? (ganadas/total)*100 : 0
    const valorSub   = sf.reduce((a,r)=>a+(r.valor_subastado||0),0)
    const valorAut   = sf.filter(r=>ESTADOS_GANADOS.includes(r.estado_autorizacion)).reduce((a,r)=>a+(r.valor_autorizado||0),0)
    const convValor  = valorSub ? (valorAut/valorSub)*100 : 0
    const tiempos    = sf.filter(r=>r.tiempo_promedio>0).map(r=>r.tiempo_promedio)
    const tiempoProm = tiempos.length ? (tiempos.reduce((a,b)=>a+b,0)/tiempos.length).toFixed(1) : '—'
    // Sin facturar: placas ganadas sin factura radicada
    const placasFacturadas = new Set(facturas.filter(f=>f.est_radicacion==='Radicada').map(f=>f.placa))
    const sinFactura = 0 // requiere datos de placa individuales — se muestra en vista separada
    return { total, ganadas, resueltas, sinRespuesta: sinResp, tasaAuth, efectividad, valorSub, valorAut, convValor, tiempoProm, sinFactura }
  }, [sf, facturas])

  const fKpis = useMemo(() => ({
    radicadas:  ff.filter(f=>f.est_radicacion==='Radicada').length,
    pendientes: ff.filter(f=>['Pendiente','pendiente'].includes(f.est_radicacion)).length,
    anuladas:   ff.filter(f=>f.est_radicacion==='Anulada').length,
  }), [ff])

  // Por asesor
  const porAsesor = useMemo(() => {
    const map: Record<number,{id:number;total:number;ganadas:number;noAut:number;pendientes:number;valorAut:number}> = {}
    sf.forEach(r => {
      if (!r.asesor_id) return
      if (!map[r.asesor_id]) map[r.asesor_id]={id:r.asesor_id,total:0,ganadas:0,noAut:0,pendientes:0,valorAut:0}
      map[r.asesor_id].total += r.total||0
      if (ESTADOS_GANADOS.includes(r.estado_autorizacion)) { map[r.asesor_id].ganadas+=r.total||0; map[r.asesor_id].valorAut+=r.valor_autorizado||0 }
      else if (r.estado_autorizacion==='NO Autorizada') map[r.asesor_id].noAut+=r.total||0
      else map[r.asesor_id].pendientes+=r.total||0
    })
    return Object.values(map).map(a=>{
      const decididas=a.ganadas+a.noAut
      return {...a, nombre:asesMap[a.id]||`Asesor ${a.id}`, tasaAuth:decididas?(a.ganadas/decididas)*100:0, efectividad:a.total?(a.ganadas/a.total)*100:0}
    }).sort((a,b)=>b.valorAut-a.valorAut)
  }, [sf, asesMap])

  // Por estado
  const porEstado = useMemo(() => {
    const map: Record<string,number> = {}
    sf.forEach(r=>{const k=r.estado_autorizacion||'Sin respuesta'; map[k]=(map[k]||0)+(r.total||0)})
    return Object.entries(map).map(([name,value])=>({name,value}))
  }, [sf])

  // Por aseguradora
  const porAseguradora = useMemo(() => {
    const map: Record<number,{id:number;total:number;ganadas:number;resueltas:number}> = {}
    sf.forEach(r=>{
      if (!r.aseguradora_id) return
      if (!map[r.aseguradora_id]) map[r.aseguradora_id]={id:r.aseguradora_id,total:0,ganadas:0,resueltas:0}
      map[r.aseguradora_id].total+=r.total||0
      if (ESTADOS_RESUELTOS.includes(r.estado_autorizacion)) map[r.aseguradora_id].resueltas+=r.total||0
      if (ESTADOS_GANADOS.includes(r.estado_autorizacion)) map[r.aseguradora_id].ganadas+=r.total||0
    })
    return Object.values(map).map(a=>({...a,nombre:asegMap[a.id]||`Aseg.${a.id}`,tasa:a.resueltas?(a.ganadas/a.resueltas)*100:0})).sort((a,b)=>b.total-a.total)
  }, [sf, asegMap])

  // Por ciudad
  const porCiudad = useMemo(() => {
    const map: Record<string,{total:number;ganadas:number}> = {}
    sf.forEach(r=>{
      const c=r.ciudad_destino?r.ciudad_destino.trim().toLowerCase():'sin ciudad'
      if (!map[c]) map[c]={total:0,ganadas:0}
      map[c].total+=r.total||0
      if (ESTADOS_GANADOS.includes(r.estado_autorizacion)) map[c].ganadas+=r.total||0
    })
    return Object.entries(map).map(([ciudad,v])=>({ciudad:ciudad.charAt(0).toUpperCase()+ciudad.slice(1),...v,tasa:v.total?(v.ganadas/v.total)*100:0})).sort((a,b)=>b.total-a.total).slice(0,10)
  }, [sf])

  // Tiempo suministro
  const porTiempoSuministro = useMemo(() => {
    const rangos: Record<string,number> = {'0-3 días':0,'4-6 días':0,'7-15 días':0,'16-30 días':0,'+30 días':0}
    // Aproximación desde tiempo_promedio de cada grupo
    sf.filter(r=>r.tiempo_promedio>0).forEach(r=>{
      const d=r.tiempo_promedio
      const key = d<=3?'0-3 días':d<=6?'4-6 días':d<=15?'7-15 días':d<=30?'16-30 días':'+30 días'
      rangos[key]+=r.total||0
    })
    return Object.entries(rangos).map(([rango,cantidad])=>({rango,cantidad}))
  }, [sf])

  // Motivos no ganada — no disponible en vista agregada, omitir
  // Proyección mensual
  const proyeccionMes = useMemo(() => {
    const MESES_2026=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    const mapReal: Record<string,ResumenMensual> = {}
    resumenMensual.forEach(r=>{if(r.mes) mapReal[r.mes.toLowerCase()]=r})
    const serie = MESES_2026.map((mes,idx)=>{
      const real=mapReal[mes.toLowerCase()]
      return {mes,orden:idx+1,valorAut:real?real.valor_autorizado:null,ganadas:real?real.ganadas:null,esReal:!!real}
    })
    const conDatos=serie.filter(s=>s.valorAut!==null)
    let proyectado=null, siguienteMes=''
    if (conDatos.length>=2) {
      const valores=conDatos.map(s=>s.valorAut as number)
      const n=valores.length
      const promedio=valores.reduce((a,b)=>a+b,0)/n
      const tendencia=(valores[n-1]-valores[0])/(n-1)
      proyectado=Math.max(0,promedio+tendencia)
      const siguiente=serie.find(s=>!s.esReal&&s.orden>(conDatos[conDatos.length-1].orden))
      siguienteMes=siguiente?siguiente.mes:''
      if (siguiente) serie[siguiente.orden-1]={...serie[siguiente.orden-1],valorAut:proyectado,esReal:false}
    }
    return {serie,proyectado,siguienteMes,historico:conDatos}
  }, [resumenMensual])

  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center">
      <div className="text-brand-subtle font-mono text-sm animate-pulse">Cargando datos reales...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-brand-bg p-6">
      <header className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-mono text-xs tracking-widest text-brand-gold uppercase mb-1">Almotores KIA · Repuestos &amp; Accesorios</p>
          <h1 className="font-title text-3xl font-bold text-brand-text">Torre de Control · Subastas</h1>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 text-brand-subtle hover:text-brand-text text-sm font-mono border border-brand-border rounded-lg px-4 py-2 transition-colors">
          <LogOut size={14}/> Salir
        </button>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs text-brand-subtle uppercase tracking-wider">Asesor</span>
          <select value={filtroAsesor} onChange={e=>setFiltroAsesor(Number(e.target.value))} className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text text-sm min-w-[160px] outline-none focus:border-brand-teal">
            <option value={0}>Todos</option>
            {asesores.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs text-brand-subtle uppercase tracking-wider">Aseguradora</span>
          <select value={filtroAseguradora} onChange={e=>setFiltroAseguradora(Number(e.target.value))} className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text text-sm min-w-[160px] outline-none focus:border-brand-teal">
            <option value={0}>Todas</option>
            {aseguradoras.map(a=><option key={a.id} value={a.id}>{a.nombre_corto}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs text-brand-subtle uppercase tracking-wider">Mes</span>
          <select value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text text-sm min-w-[140px] outline-none focus:border-brand-teal">
            <option value="todos">Todos</option>
            {meses.filter(m=>m&&m!=='todos').map(m=><option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs text-brand-subtle uppercase tracking-wider">Marca</span>
          <select value={filtroMarca} onChange={e=>setFiltroMarca(e.target.value)} className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text text-sm min-w-[140px] outline-none focus:border-brand-teal">
            <option value="todas">Todas</option>
            {marcas.filter(m=>m!=='todas').map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
        <KpiCard icon={<TrendingUp size={16}/>} label="Subastas" value={kpis.total} accent="teal"/>
        <KpiCard icon={<CheckCircle size={16}/>} label="Ganadas" value={kpis.ganadas} accent="teal"/>
        <KpiCard icon={<CheckCircle size={16}/>} label="Tasa autorización" value={fmtPct(kpis.tasaAuth)} accent="teal" hint="ganadas / resueltas"/>
        <KpiCard icon={<TrendingUp size={16}/>} label="Efectividad" value={fmtPct(kpis.efectividad)} accent="gold" hint="ganadas / total"/>
        <KpiCard icon={<Clock size={16}/>} label="Sin respuesta" value={kpis.sinRespuesta} accent="muted"/>
        <KpiCard icon={<Timer size={16}/>} label="Tiempo prom. suministro" value={`${kpis.tiempoProm} días`} accent="blue"/>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
        <KpiCard icon={<TrendingUp size={16}/>} label="Valor subastado" value={fmtCOP(kpis.valorSub)} accent="blue" small/>
        <KpiCard icon={<CheckCircle size={16}/>} label="Valor autorizado" value={fmtCOP(kpis.valorAut)} accent="teal" small/>
        <KpiCard icon={<TrendingUp size={16}/>} label="Conversión en $" value={fmtPct(kpis.convValor)} accent="gold"/>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatBadge icon={<FileCheck size={15}/>} label="Facturas radicadas"  value={fKpis.radicadas}  color="teal"/>
        <StatBadge icon={<FileClock size={15}/>} label="Facturas pendientes" value={fKpis.pendientes} color="gold"/>
        <StatBadge icon={<FileX size={15}/>}     label="Facturas anuladas"   value={fKpis.anuladas}   color="red"/>
      </div>

      {/* Gráficas principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Valor autorizado por asesor" sub="Subastas ganadas en el periodo filtrado">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porAsesor} margin={{left:0,right:8,top:8,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
              <XAxis dataKey="nombre" tick={{fill:'#8AA4C8',fontSize:11}} axisLine={{stroke:'#2A3340'}} tickLine={false}/>
              <YAxis tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>`$${(v/1e6).toFixed(0)}M`}/>
              <Tooltip contentStyle={{background:'#1B232D',border:'1px solid #2A3340',borderRadius:8,fontSize:12}} formatter={(v:number)=>[fmtCOP(v),'Valor autorizado']}/>
              <Bar dataKey="valorAut" radius={[6,6,0,0]} fill="#4FD1C5"/>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Estado de subastas" sub="Distribución del periodo filtrado">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={porEstado} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {porEstado.map((e,i)=><Cell key={i} fill={COLORES_ESTADO[e.name]||'#8AA4C8'} stroke="#0F1419" strokeWidth={2}/>)}
              </Pie>
              <Tooltip contentStyle={{background:'#1B232D',border:'1px solid #2A3340',borderRadius:8,fontSize:12}}/>
              <Legend wrapperStyle={{fontSize:12,color:'#8AA4C8'}}/>
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Proyección */}
      <div className="mb-4">
        <Panel title="Valor autorizado por mes — 2026" sub="Histórico real (teal) + proyección siguiente mes (dorado)">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={proyeccionMes.serie} margin={{left:0,right:16,top:8,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                  <XAxis dataKey="mes" tick={{fill:'#8AA4C8',fontSize:10}} axisLine={{stroke:'#2A3340'}} tickLine={false} interval={0} angle={-30} textAnchor="end" height={40}/>
                  <YAxis tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>v?`$${(v/1e6).toFixed(0)}M`:''}/>
                  <Tooltip contentStyle={{background:'#1B232D',border:'1px solid #2A3340',borderRadius:8,fontSize:12}} formatter={(v:number,_:string,props:{payload?:{esReal?:boolean}})=>[v?fmtCOP(v):'—',props.payload?.esReal?'Real':'Proyectado']}/>
                  <Line type="monotone" dataKey="valorAut" stroke="#4FD1C5" strokeWidth={2.5} connectNulls={false}
                    dot={(props:{cx:number;cy:number;payload:{esReal:boolean;valorAut:number|null}})=>{
                      if(!props.payload.valorAut) return <circle key={props.cx} cx={0} cy={0} r={0}/>
                      return <circle key={props.cx} cx={props.cx} cy={props.cy} r={5} fill={props.payload.esReal?'#4FD1C5':'#E8A33D'} stroke="#0F1419" strokeWidth={2}/>
                    }}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-3 justify-center">
              {proyeccionMes.proyectado!==null&&proyeccionMes.siguienteMes&&(
                <div className="bg-brand-bg border border-brand-gold/30 rounded-xl p-4">
                  <p className="font-mono text-xs text-brand-gold uppercase tracking-wider mb-1">Proyección {proyeccionMes.siguienteMes}</p>
                  <p className="font-title text-lg font-bold text-brand-text">{fmtCOP(proyeccionMes.proyectado)}</p>
                  <p className="text-brand-muted text-xs mt-1 font-mono">Tendencia lineal</p>
                </div>
              )}
              {proyeccionMes.historico.filter(h=>h.mes).slice(-3).reverse().map(h=>(
                <div key={h.mes} className="bg-brand-bg border border-brand-border rounded-xl p-3">
                  <p className="font-mono text-xs text-brand-subtle">{h.mes}</p>
                  <p className="font-title text-sm font-bold text-brand-text">{fmtCOP(h.valorAut as number)}</p>
                  <p className="text-brand-muted text-xs">{h.ganadas} ganadas</p>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* Ciudades + Tiempo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Top ciudades destino" sub="Volumen de subastas por ciudad">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porCiudad} layout="vertical" margin={{left:8,right:24,top:4,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" horizontal={false}/>
              <XAxis type="number" tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="ciudad" tick={{fill:'#8AA4C8',fontSize:11}} axisLine={false} tickLine={false} width={80}/>
              <Tooltip contentStyle={{background:'#1B232D',border:'1px solid #2A3340',borderRadius:8,fontSize:12}}/>
              <Bar dataKey="total" radius={[0,4,4,0]} name="Total subastas">
                {porCiudad.map((_,i)=><Cell key={i} fill={COLORES_CIUDADES[i%COLORES_CIUDADES.length]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Tiempo máximo de suministro" sub="Distribución por rango de días">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porTiempoSuministro} margin={{left:0,right:8,top:8,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
              <XAxis dataKey="rango" tick={{fill:'#8AA4C8',fontSize:11}} axisLine={{stroke:'#2A3340'}} tickLine={false}/>
              <YAxis tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:'#1B232D',border:'1px solid #2A3340',borderRadius:8,fontSize:12}}/>
              <Bar dataKey="cantidad" radius={[6,6,0,0]} fill="#8AA4C8" name="Subastas"/>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Efectividad por asesor */}
      <Panel title="Efectividad por asesor" sub="Tasa autorización (ganadas/decididas) · Efectividad (ganadas/total)">
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Asesor','Total','Ganadas','No autorizadas','Pendientes','Tasa autorización','Efectividad','Valor autorizado'].map(h=>(
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porAsesor.map(a=>(
                <tr key={a.id} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                  <td className="py-3 pr-4 text-brand-text font-medium">{a.nombre}</td>
                  <td className="py-3 pr-4 font-mono text-brand-subtle">{a.total}</td>
                  <td className="py-3 pr-4 font-mono text-brand-teal">{a.ganadas}</td>
                  <td className="py-3 pr-4 font-mono text-brand-red">{a.noAut}</td>
                  <td className="py-3 pr-4 font-mono text-brand-subtle">{a.pendientes}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-brand-border rounded-full overflow-hidden"><div className="h-full rounded-full bg-brand-teal" style={{width:`${a.tasaAuth}%`}}/></div>
                      <span className="font-mono text-xs">{fmtPct(a.tasaAuth)}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-brand-border rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${a.efectividad}%`,background:a.efectividad>=30?'#4FD1C5':'#E8A33D'}}/></div>
                      <span className="font-mono text-xs">{fmtPct(a.efectividad)}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(a.valorAut)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Ranking aseguradoras */}
      <div className="mt-4">
        <Panel title="Ranking por aseguradora" sub="Volumen de subastas y tasa de autorización">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Aseguradora','Total','Ganadas','Resueltas','Tasa autorización'].map(h=>(
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porAseguradora.map(a=>(
                  <tr key={a.id} className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors">
                    <td className="py-3 pr-4 text-brand-text">{a.nombre}</td>
                    <td className="py-3 pr-4 font-mono text-brand-subtle">{a.total}</td>
                    <td className="py-3 pr-4 font-mono text-brand-teal">{a.ganadas}</td>
                    <td className="py-3 pr-4 font-mono text-brand-subtle">{a.resueltas}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-brand-border rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${a.tasa}%`,background:a.tasa>=40?'#4FD1C5':'#E8A33D'}}/></div>
                        <span className="font-mono text-xs text-brand-subtle">{fmtPct(a.tasa)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function KpiCard({icon,label,value,accent,small,hint}:{icon:React.ReactNode;label:string;value:string|number;accent:string;small?:boolean;hint?:string}) {
  const bc: Record<string,string>={teal:'#4FD1C5',gold:'#E8A33D',blue:'#60A5FA',red:'#E5484D',muted:'#5B6472'}
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 relative overflow-hidden">
      <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:bc[accent]||'#4FD1C5'}}/>
      <div className="flex items-center gap-2 text-brand-subtle mb-2">{icon}<span className="text-xs">{label}</span></div>
      <div className={`font-title font-bold text-brand-text ${small?'text-lg':'text-2xl'}`}>{value}</div>
      {hint&&<div className="text-brand-muted text-xs mt-1 font-mono">{hint}</div>}
    </div>
  )
}
function StatBadge({icon,label,value,color}:{icon:React.ReactNode;label:string;value:number;color:string}) {
  const cls: Record<string,string>={teal:'text-brand-teal',gold:'text-brand-gold',red:'text-brand-red'}
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 flex justify-between items-center">
      <div className="flex items-center gap-2 text-brand-subtle text-sm">{icon}{label}</div>
      <span className={`font-mono font-bold text-xl ${cls[color]||''}`}>{value}</span>
    </div>
  )
}
function Panel({title,sub,children}:{title:string;sub:string;children:React.ReactNode}) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
      <h3 className="font-title text-base font-semibold text-brand-text">{title}</h3>
      <p className="text-xs text-brand-subtle mb-4">{sub}</p>
      {children}
    </div>
  )
}
