'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts'
import { LogOut, TrendingUp, CheckCircle, Clock, Timer, FileCheck, FileX, FileClock, Calendar, Target, RefreshCw, BarChart3 } from 'lucide-react'

// ── Constantes ──────────────────────────────────────────────────────────────
const ESTADOS_GANADOS   = ['Autorizada Completa', 'Autorizada parcial']
const ESTADOS_RESUELTOS = ['Autorizada Completa', 'Autorizada parcial', 'NO Autorizada']
const COLORES_ESTADO: Record<string,string> = {
  'Autorizada Completa':'#4FD1C5','Autorizada parcial':'#E8A33D',
  'NO Autorizada':'#E5484D','Subasta no aplicada':'#5B6472','Sin respuesta':'#8AA4C8'
}
const COLORES_CIUDADES = ['#4FD1C5','#E8A33D','#8AA4C8','#E5484D','#60A5FA','#A78BFA','#34D399','#F87171','#FBBF24','#6EE7B7']
const ORDEN_MESES: Record<string,number> = {enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12}

// Festivos Colombia 2026 (formato YYYY-MM-DD)
const FESTIVOS_2026 = new Set([
  '2026-01-01','2026-01-12','2026-03-23','2026-04-02','2026-04-03',
  '2026-05-01','2026-05-18','2026-06-08','2026-06-15','2026-06-29',
  '2026-07-20','2026-08-07','2026-08-17','2026-10-12','2026-11-02',
  '2026-11-16','2026-12-08','2026-12-25'
])

function diasHabiles(year: number, month: number): { total: number; transcurridos: number; restantes: number; hoy: number } {
  const hoy = new Date()
  const diaHoy = hoy.getFullYear()===year && hoy.getMonth()===month-1 ? hoy.getDate() : 
                 (hoy.getFullYear()===year && hoy.getMonth()<month-1 ? 0 : 
                  new Date(year, month, 0).getDate())
  let total=0, transcurridos=0
  const diasMes = new Date(year, month, 0).getDate()
  for (let d=1; d<=diasMes; d++) {
    const fecha = new Date(year, month-1, d)
    const dow = fecha.getDay()
    const fStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    if (dow!==0 && !FESTIVOS_2026.has(fStr)) {
      total++
      if (d<=diaHoy) transcurridos++
    }
  }
  return { total, transcurridos, restantes: total-transcurridos, hoy: diaHoy }
}

const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n||0)
const fmtPct = (n: number) => `${(n||0).toFixed(1)}%`
const fmtM   = (n: number) => n>=1e9?`$${(n/1e9).toFixed(1)}B`:n>=1e6?`$${(n/1e6).toFixed(0)}M`:`$${(n/1e3).toFixed(0)}K`

// ── Tipos ────────────────────────────────────────────────────────────────────
type Aseguradora    = { id: number; nombre_corto: string }
type Asesor         = { id: number; nombre: string }
type ResumenMensual = { mes: string; orden: number; total_subastas: number; ganadas: number; no_autorizadas: number; valor_autorizado: number; valor_subastado: number }
type ResumenHistorico = { anio: number; mes_num: number; mes: string; total_subastas: number; ganadas: number; no_autorizadas: number; valor_autorizado: number; valor_subastado: number }
type KpiRow = { mes_subasta: string; marca: string; aseguradora_id: number; asesor_id: number; estado_autorizacion: string; ciudad_destino: string; total: number; valor_subastado: number; valor_autorizado: number; tiempo_promedio: number }
type Factura = { id: number; placa: string; marca: string; aseguradora_id: number; asesor_id: number; est_radicacion: string; fecha_radicado: string; base_imp: number; mes: string }

// ── Componente principal ─────────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter()
  const [kpiRows,      setKpiRows]      = useState<KpiRow[]>([])
  const [kpiRows2025,  setKpiRows2025]  = useState<{aseguradora_id:number;asesor_id:number;estado_autorizacion:string;valor_autorizado:number;total:number}[]>([])
  const [facturas,     setFacturas]     = useState<Factura[]>([])
  const [aseguradoras, setAseguradoras] = useState<Aseguradora[]>([])
  const [asesores,     setAsesores]     = useState<Asesor[]>([])
  const [resumenMensual,   setResumenMensual]   = useState<ResumenMensual[]>([])
  const [resumenHistorico, setResumenHistorico] = useState<ResumenHistorico[]>([])
  const [mesesDisponibles, setMesesDisponibles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date|null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [countdown, setCountdown] = useState(1800) // 30 minutos
  const [filtroAsesor,      setFiltroAsesor]      = useState(0)
  const [filtroAseguradora, setFiltroAseguradora] = useState(0)
  const [filtroMes,         setFiltroMes]         = useState('todos')
  const [filtroMarca,       setFiltroMarca]       = useState('todas')
  const [rangoMesInicio, setRangoMesInicio] = useState(1)  // enero
  const [rangoMesFin,    setRangoMesFin]    = useState(12) // se ajusta al ultimo mes con datos, ver abajo

  const asegMap = useMemo(()=>{const m:Record<number,string>={};aseguradoras.forEach(a=>{m[a.id]=a.nombre_corto});return m},[aseguradoras])
  const asesMap = useMemo(()=>{const m:Record<number,string>={};asesores.forEach(a=>{m[a.id]=a.nombre});return m},[asesores])

  useEffect(()=>{
    async function fetchData() {
      const {data:{user}} = await supabase.auth.getUser()
      if (!user){router.push('/login');return}
      const [{data:kpis},{data:f},{data:aseg},{data:ases},{data:resumen},{data:meses},{data:historico},{data:rows2025}] = await Promise.all([
        supabase.from('v_kpis_subastas').select('*'),
        supabase.from('facturas').select('id,placa,marca,aseguradora_id,asesor_id,est_radicacion,fecha_radicado,base_imp,mes').limit(2000),
        supabase.from('aseguradoras').select('id,nombre_corto'),
        supabase.from('asesores').select('id,nombre'),
        supabase.from('v_resumen_mensual').select('*'),
        supabase.from('v_meses_disponibles').select('mes,orden').order('orden'),
        supabase.from('resumen_historico_subastas').select('*').order('mes_num'),
        supabase.from('subastas').select('aseguradora_id,asesor_id,estado_autorizacion,valor_autorizado').eq('anio',2025),
      ])
      setKpiRows((kpis as KpiRow[])||[])
      setKpiRows2025((rows2025 as any[])||[])
      setFacturas((f as Factura[])||[])
      setAseguradoras((aseg as Aseguradora[])||[])
      setAsesores((ases as Asesor[])||[])
      setResumenMensual((resumen as ResumenMensual[])||[])
      setResumenHistorico((historico as ResumenHistorico[])||[])
      setMesesDisponibles(((meses as unknown as {mes:string}[])||[]).map(m=>m.mes).filter(Boolean))
      setUltimaActualizacion(new Date())
      setLoading(false)
    }
    fetchData()
  },[router])

  // Auto-refresh cada 5 minutos
  useEffect(()=>{
    if (!autoRefresh) return
    const interval = setInterval(()=>{
      setCountdown(c=>{
        if (c<=1){
          // Refrescar datos
          supabase.from('v_kpis_subastas').select('*').then(({data})=>{ if(data) setKpiRows(data as KpiRow[]) })
          supabase.from('v_resumen_mensual').select('*').then(({data})=>{ if(data) setResumenMensual(data as ResumenMensual[]) })
          supabase.from('facturas').select('id,placa,marca,aseguradora_id,asesor_id,est_radicacion,fecha_radicado,base_imp,mes').limit(2000).then(({data})=>{ if(data) setFacturas(data as Factura[]) })
          setUltimaActualizacion(new Date())
          return 1800
        }
        return c-1
      })
    }, 1000)
    return ()=>clearInterval(interval)
  },[autoRefresh])

  // Supabase Realtime: actualización inmediata cuando el Apps Script inserta datos
  useEffect(()=>{
    const refetch = () => {
      supabase.from('v_kpis_subastas').select('*').then(({data})=>{ if(data) setKpiRows(data as KpiRow[]) })
      supabase.from('v_resumen_mensual').select('*').then(({data})=>{ if(data) setResumenMensual(data as ResumenMensual[]) })
      supabase.from('resumen_historico_subastas').select('*').order('mes_num').then(({data})=>{ if(data) setResumenHistorico(data as ResumenHistorico[]) })
      supabase.from('facturas').select('id,placa,marca,aseguradora_id,asesor_id,est_radicacion,fecha_radicado,base_imp,mes').limit(2000).then(({data})=>{ if(data) setFacturas(data as Factura[]) })
      setUltimaActualizacion(new Date())
      setCountdown(1800)
    }
    const chSub  = supabase.channel('rt-subastas').on('postgres_changes',{event:'*',schema:'public',table:'subastas'},  refetch).subscribe()
    const chHist = supabase.channel('rt-historico').on('postgres_changes',{event:'*',schema:'public',table:'resumen_historico_subastas'}, refetch).subscribe()
    const chFact = supabase.channel('rt-facturas').on('postgres_changes',{event:'*',schema:'public',table:'facturas'},  refetch).subscribe()
    return ()=>{ supabase.removeChannel(chSub); supabase.removeChannel(chHist); supabase.removeChannel(chFact) }
  },[])

  async function handleLogout(){await supabase.auth.signOut();router.push('/login')}

  // Normaliza marca para evitar duplicados por may/minusculas inconsistentes en el origen (ej: "KIA" vs "Kia")
  const normalizeMarca = (raw: string | null | undefined): string => {
    if (!raw) return ''
    const key = raw.trim().toLowerCase()
    const CANONICAL: Record<string, string> = { kia: 'Kia', vw: 'VW', jac: 'Jac', renault: 'Renault' }
    return CANONICAL[key] || (key.charAt(0).toUpperCase() + key.slice(1))
  }

  const marcas = useMemo(()=>{
    const ms=kpiRows.map(r=>normalizeMarca(r.marca)).filter((m):m is string=>!!m&&m.trim()!=='')
    return ['todas',...Array.from(new Set(ms)).sort()]
  },[kpiRows])

  const meses = useMemo(()=>['todos',...mesesDisponibles],[mesesDisponibles])

  const sf = useMemo(()=>kpiRows.filter(r=>
    (filtroAsesor===0      ||r.asesor_id===filtroAsesor)&&
    (filtroAseguradora===0 ||r.aseguradora_id===filtroAseguradora)&&
    (filtroMes==='todos'   ||r.mes_subasta===filtroMes)&&
    (filtroMarca==='todas' ||normalizeMarca(r.marca)===filtroMarca)
  ),[kpiRows,filtroAsesor,filtroAseguradora,filtroMes,filtroMarca])

  const ff = useMemo(()=>facturas.filter(f=>
    (filtroAsesor===0      ||f.asesor_id===filtroAsesor)&&
    (filtroAseguradora===0 ||f.aseguradora_id===filtroAseguradora)&&
    (filtroMes==='todos'   ||f.mes===filtroMes)&&
    (filtroMarca==='todas' ||normalizeMarca(f.marca)===filtroMarca)
  ),[facturas,filtroAsesor,filtroAseguradora,filtroMes,filtroMarca])

  const kpis = useMemo(()=>{
    const total     = sf.reduce((a,r)=>a+(r.total||0),0)
    const ganadas   = sf.filter(r=>ESTADOS_GANADOS.includes(r.estado_autorizacion)).reduce((a,r)=>a+(r.total||0),0)
    const resueltas = sf.filter(r=>ESTADOS_RESUELTOS.includes(r.estado_autorizacion)).reduce((a,r)=>a+(r.total||0),0)
    const sinResp   = sf.filter(r=>!ESTADOS_RESUELTOS.includes(r.estado_autorizacion)&&r.estado_autorizacion!=='Subasta no aplicada').reduce((a,r)=>a+(r.total||0),0)
    const valorSub  = sf.reduce((a,r)=>a+(r.valor_subastado||0),0)
    const valorAut  = sf.filter(r=>ESTADOS_GANADOS.includes(r.estado_autorizacion)).reduce((a,r)=>a+(r.valor_autorizado||0),0)
    const tiempos   = sf.filter(r=>r.tiempo_promedio>0).map(r=>r.tiempo_promedio)
    const tiempoProm= tiempos.length?(tiempos.reduce((a,b)=>a+b,0)/tiempos.length).toFixed(1):'—'
    return {
      total, ganadas, resueltas, sinRespuesta:sinResp,
      tasaAuth:   resueltas?(ganadas/resueltas)*100:0,
      efectividad:total?(ganadas/total)*100:0,
      valorSub, valorAut,
      convValor:  valorSub?(valorAut/valorSub)*100:0,
      tiempoProm,
    }
  },[sf])

  const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

  // Meses que realmente tienen datos del año en curso (para fijar el limite superior del selector)
  const mesesConDatosActualNums = useMemo(() => {
    const nums: number[] = []
    resumenMensual.forEach(r => {
      const idx = MESES_ES.indexOf((r.mes || '').toLowerCase().trim())
      if (idx >= 0) nums.push(idx + 1)
    })
    return nums.sort((a, b) => a - b)
  }, [resumenMensual])

  const ultimoMesConDatos = mesesConDatosActualNums.length
    ? mesesConDatosActualNums[mesesConDatosActualNums.length - 1]
    : 12

  // Ajusta el rango por defecto la primera vez que llegan datos (enero -> ultimo mes con info)
  useEffect(() => {
    if (mesesConDatosActualNums.length > 0) {
      setRangoMesFin(prev => (prev === 12 ? ultimoMesConDatos : prev))
    }
  }, [ultimoMesConDatos, mesesConDatosActualNums.length])

  const comparativo2025 = useMemo(() => {
    const hist2025: Record<number, ResumenHistorico> = {}
    resumenHistorico.filter(r => r.anio === 2025).forEach(r => { hist2025[r.mes_num] = r })

    const actualPorMes: Record<number, ResumenMensual> = {}
    resumenMensual.forEach(r => {
      const idx = MESES_ES.indexOf((r.mes || '').toLowerCase().trim())
      if (idx >= 0) actualPorMes[idx + 1] = r
    })

    const desde = Math.min(rangoMesInicio, rangoMesFin)
    const hasta = Math.max(rangoMesInicio, rangoMesFin)

    // Meses dentro del rango elegido (sin importar si el año actual ya tiene datos o no,
    // para que el usuario vea claramente en cuales meses aun no hay info)
    const mesesRango: number[] = []
    for (let m = desde; m <= hasta; m++) mesesRango.push(m)

    const filas = mesesRango.map(mesNum => {
      const act = actualPorMes[mesNum]
      const his = hist2025[mesNum]
      return {
        mes: MESES_ES[mesNum - 1].slice(0, 3),
        subastas2025: his?.total_subastas || 0,
        subastasActual: act?.total_subastas || 0,
        facturacion2025: his?.valor_autorizado || 0,
        facturacionActual: act?.valor_autorizado || 0,
        tieneDatoActual: !!act,
      }
    })

    // Para promedios y totales solo cuentan los meses del rango que YA tienen dato del año actual
    const filasConDato = filas.filter(f => f.tieneDatoActual)
    const numMesesConDato = filasConDato.length || 1 // evita division por 0

    const totalSubastas2025 = filasConDato.reduce((a, f) => a + f.subastas2025, 0)
    const totalSubastasActual = filasConDato.reduce((a, f) => a + f.subastasActual, 0)
    const totalFacturacion2025 = filasConDato.reduce((a, f) => a + f.facturacion2025, 0)
    const totalFacturacionActual = filasConDato.reduce((a, f) => a + f.facturacionActual, 0)

    const promedioSubastas2025 = totalSubastas2025 / numMesesConDato
    const promedioSubastasActual = totalSubastasActual / numMesesConDato
    const promedioFacturacion2025 = totalFacturacion2025 / numMesesConDato
    const promedioFacturacionActual = totalFacturacionActual / numMesesConDato

    const varSubastas = totalSubastas2025 ? ((totalSubastasActual - totalSubastas2025) / totalSubastas2025) * 100 : 0
    const varFacturacion = totalFacturacion2025 ? ((totalFacturacionActual - totalFacturacion2025) / totalFacturacion2025) * 100 : 0
    const varPromedioSubastas = promedioSubastas2025 ? ((promedioSubastasActual - promedioSubastas2025) / promedioSubastas2025) * 100 : 0
    const varPromedioFacturacion = promedioFacturacion2025 ? ((promedioFacturacionActual - promedioFacturacion2025) / promedioFacturacion2025) * 100 : 0

    const totalSubastas2025Completo = resumenHistorico.filter(r => r.anio === 2025).reduce((a, r) => a + r.total_subastas, 0)
    const totalFacturacion2025Completo = resumenHistorico.filter(r => r.anio === 2025).reduce((a, r) => a + r.valor_autorizado, 0)

    return {
      filas,
      numMesesConDato,
      totalSubastas2025YTD: totalSubastas2025, totalSubastasActualYTD: totalSubastasActual,
      totalFacturacion2025YTD: totalFacturacion2025, totalFacturacionActualYTD: totalFacturacionActual,
      promedioSubastas2025, promedioSubastasActual, promedioFacturacion2025, promedioFacturacionActual,
      varPromedioSubastas, varPromedioFacturacion,
      varSubastas, varFacturacion, totalSubastas2025Completo, totalFacturacion2025Completo,
    }
  }, [resumenMensual, resumenHistorico, rangoMesInicio, rangoMesFin])

  const fKpis = useMemo(()=>({
    radicadas:  ff.filter(f=>f.est_radicacion==='Radicada').length,
    pendientes: ff.filter(f=>['Pendiente','pendiente'].includes(f.est_radicacion)).length,
    anuladas:   ff.filter(f=>f.est_radicacion==='Anulada').length,
  }),[ff])

  // ── Días hábiles del mes en curso (julio 2026) ───────────────────────────
  const mesActual = useMemo(()=>{
    const hoy = new Date()
    // Usamos julio 2026 como mes actual del sistema
    const year=2026, month=7
    const dh = diasHabiles(year, month)
    // Ritmo desde resumenMensual de julio
    const julio = resumenMensual.find(r=>r.mes==='julio')
    const diasTranscurridos = 3 // última fecha registrada: 2026-07-03
    const subastasHoy = julio?.total_subastas || 0
    const ritmo = diasTranscurridos>0 ? subastasHoy/diasTranscurridos : 0
    const valorAutHoy = julio?.valor_autorizado || 0
    const ritmoValor  = diasTranscurridos>0 ? valorAutHoy/diasTranscurridos : 0
    return {
      nombre: 'Julio 2026',
      ...dh,
      subastasHoy,
      diasTranscurridos,
      ritmo,
      proySubastas: Math.round(ritmo*dh.total),
      proyValor:    ritmoValor*dh.total,
      valorAutHoy,
      pctAvance:    dh.total>0?(dh.transcurridos/dh.total)*100:0,
    }
  },[resumenMensual])

  // ── Por asesor ───────────────────────────────────────────────────────────
  const porAsesor = useMemo(()=>{
    const map:Record<number,{id:number;total:number;ganadas:number;noAut:number;pendientes:number;valorAut:number;total2025:number;ganadas2025:number;valorAut2025:number}>={}
    sf.forEach(r=>{
      if(!r.asesor_id)return
      if(!map[r.asesor_id])map[r.asesor_id]={id:r.asesor_id,total:0,ganadas:0,noAut:0,pendientes:0,valorAut:0,total2025:0,ganadas2025:0,valorAut2025:0}
      map[r.asesor_id].total+=r.total||0
      if(ESTADOS_GANADOS.includes(r.estado_autorizacion)){map[r.asesor_id].ganadas+=r.total||0;map[r.asesor_id].valorAut+=r.valor_autorizado||0}
      else if(r.estado_autorizacion==='NO Autorizada')map[r.asesor_id].noAut+=r.total||0
      else map[r.asesor_id].pendientes+=r.total||0
    })
    kpiRows2025.forEach(r=>{
      if(!r.asesor_id)return
      if(!map[r.asesor_id])map[r.asesor_id]={id:r.asesor_id,total:0,ganadas:0,noAut:0,pendientes:0,valorAut:0,total2025:0,ganadas2025:0,valorAut2025:0}
      map[r.asesor_id].total2025+=1
      if(ESTADOS_GANADOS.includes(r.estado_autorizacion)){map[r.asesor_id].ganadas2025+=1;map[r.asesor_id].valorAut2025+=r.valor_autorizado||0}
    })
    return Object.values(map).map(a=>{
      const d=a.ganadas+a.noAut
      const conv2025=a.total2025?(a.ganadas2025/a.total2025)*100:0
      const convActual=a.total?(a.ganadas/a.total)*100:0
      return {...a,nombre:asesMap[a.id]||`Asesor ${a.id}`,tasaAuth:d?(a.ganadas/d)*100:0,efectividad:a.total?(a.ganadas/a.total)*100:0,conv2025,convActual,varConv:convActual-conv2025,varSub:a.total2025?((a.total-a.total2025)/a.total2025)*100:null,varFact:a.valorAut2025?((a.valorAut-a.valorAut2025)/a.valorAut2025)*100:null}
    }).sort((a,b)=>b.valorAut-a.valorAut)
  },[sf,asesMap,kpiRows2025])

  const porEstado = useMemo(()=>{
    const map:Record<string,number>={}
    sf.forEach(r=>{const k=r.estado_autorizacion||'Sin respuesta';map[k]=(map[k]||0)+(r.total||0)})
    return Object.entries(map).map(([name,value])=>({name,value}))
  },[sf])

  const porAseguradora = useMemo(()=>{
    const map:Record<number,{id:number;total:number;ganadas:number;resueltas:number;total2025:number;ganadas2025:number;valorAut:number;valorAut2025:number}>={}
    sf.forEach(r=>{
      if(!r.aseguradora_id)return
      if(!map[r.aseguradora_id])map[r.aseguradora_id]={id:r.aseguradora_id,total:0,ganadas:0,resueltas:0,total2025:0,ganadas2025:0,valorAut:0,valorAut2025:0}
      map[r.aseguradora_id].total+=r.total||0
      if(ESTADOS_RESUELTOS.includes(r.estado_autorizacion))map[r.aseguradora_id].resueltas+=r.total||0
      if(ESTADOS_GANADOS.includes(r.estado_autorizacion)){map[r.aseguradora_id].ganadas+=r.total||0;map[r.aseguradora_id].valorAut+=r.valor_autorizado||0}
    })
    kpiRows2025.forEach(r=>{
      if(!r.aseguradora_id)return
      if(!map[r.aseguradora_id])map[r.aseguradora_id]={id:r.aseguradora_id,total:0,ganadas:0,resueltas:0,total2025:0,ganadas2025:0,valorAut:0,valorAut2025:0}
      map[r.aseguradora_id].total2025+=1
      if(ESTADOS_GANADOS.includes(r.estado_autorizacion)){map[r.aseguradora_id].ganadas2025+=1;map[r.aseguradora_id].valorAut2025+=r.valor_autorizado||0}
    })
    return Object.values(map).map(a=>{
      const conv2025=a.total2025?(a.ganadas2025/a.total2025)*100:0
      const convActual=a.total?(a.ganadas/a.total)*100:0
      return {...a,nombre:asegMap[a.id]||`Aseg.${a.id}`,tasa:a.resueltas?(a.ganadas/a.resueltas)*100:0,conv2025,convActual,varConv:convActual-conv2025,varSub:a.total2025?((a.total-a.total2025)/a.total2025)*100:null,varFact:a.valorAut2025?((a.valorAut-a.valorAut2025)/a.valorAut2025)*100:null}
    }).sort((a,b)=>b.total-a.total)
  },[sf,asegMap,kpiRows2025])

  const porCiudad = useMemo(()=>{
    const map:Record<string,{total:number;ganadas:number}>={}
    sf.forEach(r=>{
      const c=r.ciudad_destino?r.ciudad_destino.trim().toLowerCase():'sin ciudad'
      if(!map[c])map[c]={total:0,ganadas:0}
      map[c].total+=r.total||0
      if(ESTADOS_GANADOS.includes(r.estado_autorizacion))map[c].ganadas+=r.total||0
    })
    return Object.entries(map).map(([ciudad,v])=>({ciudad:ciudad.charAt(0).toUpperCase()+ciudad.slice(1),...v,tasa:v.total?(v.ganadas/v.total)*100:0})).sort((a,b)=>b.total-a.total).slice(0,10)
  },[sf])

  const porTiempo = useMemo(()=>{
    const rangos:Record<string,number>={'0-3 días':0,'4-6 días':0,'7-15 días':0,'16-30 días':0,'+30 días':0}
    sf.filter(r=>r.tiempo_promedio>0).forEach(r=>{
      const d=r.tiempo_promedio
      const key=d<=3?'0-3 días':d<=6?'4-6 días':d<=15?'7-15 días':d<=30?'16-30 días':'+30 días'
      rangos[key]+=r.total||0
    })
    return Object.entries(rangos).map(([rango,cantidad])=>({rango,cantidad}))
  },[sf])

  const proyeccionMes = useMemo(()=>{
    const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    const mapReal:Record<string,ResumenMensual>={}
    resumenMensual.forEach(r=>{if(r.mes)mapReal[r.mes.toLowerCase()]=r})
    const serie=MESES.map((mes,idx)=>{
      const real=mapReal[mes.toLowerCase()]
      return {mes,orden:idx+1,valorAut:real?real.valor_autorizado:null,ganadas:real?real.ganadas:null,esReal:!!real}
    })
    const conDatos=serie.filter(s=>s.valorAut!==null)
    let proyectado=null,siguienteMes=''
    if(conDatos.length>=2){
      const valores=conDatos.map(s=>s.valorAut as number)
      const n=valores.length
      const prom=valores.reduce((a,b)=>a+b,0)/n
      const tend=(valores[n-1]-valores[0])/(n-1)
      proyectado=Math.max(0,prom+tend)
      const sig=serie.find(s=>!s.esReal&&s.orden>(conDatos[conDatos.length-1].orden))
      siguienteMes=sig?sig.mes:''
      if(sig)serie[sig.orden-1]={...serie[sig.orden-1],valorAut:proyectado,esReal:false}
    }
    return {serie,proyectado,siguienteMes,historico:conDatos}
  },[resumenMensual])

  if(loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center flex-col gap-3">
      <div className="w-8 h-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin"/>
      <p className="text-brand-subtle font-mono text-xs">Cargando datos...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Sidebar-style top bar */}
      <div className="border-b border-brand-border bg-brand-surface/50 px-6 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-brand-teal animate-pulse"/>
          <span className="font-mono text-xs text-brand-subtle uppercase tracking-widest">Almotores KIA · Repuestos &amp; Accesorios</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            {/* Botón refresh manual */}
            <button
              onClick={()=>{
                supabase.from('v_kpis_subastas').select('*').then(({data})=>{ if(data) setKpiRows(data as KpiRow[]) })
                supabase.from('v_resumen_mensual').select('*').then(({data})=>{ if(data) setResumenMensual(data as ResumenMensual[]) })
                supabase.from('facturas').select('id,placa,marca,aseguradora_id,asesor_id,est_radicacion,fecha_radicado,base_imp,mes').limit(2000).then(({data})=>{ if(data) setFacturas(data as Factura[]) })
                setUltimaActualizacion(new Date())
                setCountdown(1800)
              }}
              className="flex items-center gap-1.5 text-xs font-mono text-brand-subtle hover:text-brand-teal transition-colors border border-brand-border rounded-lg px-2.5 py-1"
              title="Actualizar ahora"
            >
              <RefreshCw size={12}/> Actualizar
            </button>
            {/* Contador auto-refresh */}
            <div className="flex items-center gap-1.5 text-xs font-mono text-brand-muted" title="Próxima actualización automática">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-teal animate-pulse"/>
              {`Auto en ${Math.floor(countdown/60)}:${String(countdown%60).padStart(2,'0')}`}
            </div>
            {ultimaActualizacion&&(
              <span className="text-brand-muted font-mono text-xs hidden md:block">
                {ultimaActualizacion.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}
              </span>
            )}
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-brand-subtle hover:text-brand-text text-xs font-mono transition-colors">
            <LogOut size={13}/> Salir
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-title text-2xl font-bold text-brand-text">Torre de Control · Subastas</h1>
            <p className="text-brand-subtle text-sm mt-1">Análisis en tiempo real — Enero a Julio 2026</p>
          </div>
          <Link
            href="/dashboard/facturacion/canales/subasta/comparativo"
            className="shrink-0 flex items-center gap-2 text-xs font-mono text-brand-gold hover:text-brand-text border border-brand-gold/40 hover:border-brand-gold rounded-lg px-3 py-2 transition-colors"
          >
            <BarChart3 size={13} /> Análisis Comparativo de Períodos →
          </Link>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-6 p-4 bg-brand-surface border border-brand-border rounded-xl">
          <span className="font-mono text-xs text-brand-muted self-center mr-2 uppercase tracking-wider">Filtrar por</span>
          {[
            {label:'Asesor',   isNum:true,  val:filtroAsesor,      fn:setFiltroAsesor,      opts:[{v:0,l:'Todos'},...asesores.map(a=>({v:a.id,l:a.nombre}))]},
            {label:'Aseguradora',isNum:true,val:filtroAseguradora, fn:setFiltroAseguradora, opts:[{v:0,l:'Todas'},...aseguradoras.map(a=>({v:a.id,l:a.nombre_corto}))]},
          ].map(f=>(
            <label key={f.label} className="flex items-center gap-2">
              <span className="text-xs text-brand-subtle">{f.label}</span>
              <select value={f.val} onChange={e=>f.fn(Number(e.target.value))} className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
                {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </label>
          ))}
          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Mes</span>
            <select value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
              <option value="todos">Todos</option>
              {meses.filter(m=>m&&m!=='todos').map(m=><option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs text-brand-subtle">Marca</span>
            <select value={filtroMarca} onChange={e=>setFiltroMarca(e.target.value)} className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text text-sm outline-none focus:border-brand-teal">
              <option value="todas">Todas</option>
              {marcas.filter(m=>m!=='todas').map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          {(filtroAsesor!==0||filtroAseguradora!==0||filtroMes!=='todos'||filtroMarca!=='todas')&&(
            <button onClick={()=>{setFiltroAsesor(0);setFiltroAseguradora(0);setFiltroMes('todos');setFiltroMarca('todas')}}
              className="ml-auto text-xs font-mono text-brand-muted hover:text-brand-red transition-colors border border-brand-border rounded-lg px-3 py-1.5">
              × Limpiar filtros
            </button>
          )}
        </div>

        {/* ── MES EN CURSO ─────────────────────────────────────────────── */}
        <div className="mb-4 p-4 bg-gradient-to-r from-brand-surface to-brand-bg border border-brand-teal/30 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={15} className="text-brand-teal"/>
            <span className="font-mono text-xs text-brand-teal uppercase tracking-wider">Mes en curso · {mesActual.nombre}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <MesCard label="Días hábiles totales" value={mesActual.total} color="teal"/>
            <MesCard label="Días transcurridos" value={mesActual.transcurridos} color="subtle"/>
            <MesCard label="Días restantes" value={mesActual.restantes} color="gold"/>
            <MesCard label="Subastas registradas" value={mesActual.subastasHoy} color="teal"/>
            <MesCard label="Ritmo subastas/día" value={mesActual.ritmo.toFixed(1)} color="subtle"/>
            <MesCard label="Proyección subastas" value={mesActual.proySubastas} color="gold" highlight/>
            <MesCard label="Proyección valor autorizado" value={fmtM(mesActual.proyValor)} color="gold" highlight small/>
          </div>
          {/* Barra de progreso del mes */}
          <div className="mt-3">
            <div className="flex justify-between text-xs font-mono text-brand-muted mb-1">
              <span>Avance del mes</span>
              <span>{fmtPct(mesActual.pctAvance)}</span>
            </div>
            <div className="h-1.5 bg-brand-border rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-brand-teal transition-all" style={{width:`${mesActual.pctAvance}%`}}/>
            </div>
          </div>
        </div>

        {/* ── KPIs PRINCIPALES ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
          <KpiCard icon={<TrendingUp size={15}/>}  label="Subastas"            value={kpis.total}                   accent="teal"/>
          <KpiCard icon={<CheckCircle size={15}/>} label="Ganadas"             value={kpis.ganadas}                 accent="teal"/>
          <KpiCard icon={<Target size={15}/>}      label="Tasa autorización"   value={fmtPct(kpis.tasaAuth)}        accent="teal"  hint="ganadas / resueltas"/>
          <KpiCard icon={<TrendingUp size={15}/>}  label="Efectividad"         value={fmtPct(kpis.efectividad)}     accent="gold"  hint="ganadas / total"/>
          <KpiCard icon={<Clock size={15}/>}       label="Sin respuesta"       value={kpis.sinRespuesta}            accent="muted"/>
          <KpiCard icon={<Timer size={15}/>}       label="T. prom. suministro" value={`${kpis.tiempoProm} días`}    accent="blue"/>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <KpiCard icon={<TrendingUp size={15}/>}  label="Valor subastado"   value={fmtCOP(kpis.valorSub)} accent="blue"  small/>
          <KpiCard icon={<CheckCircle size={15}/>} label="Valor autorizado"  value={fmtCOP(kpis.valorAut)} accent="teal"  small/>
          <KpiCard icon={<TrendingUp size={15}/>}  label="Conversión en $"   value={fmtPct(kpis.convValor)} accent="gold"/>
        </div>

        {/* ── COMPARATIVO VS 2025 ──────────────────────────────────────────── */}
        <Panel title="Comparativo vs 2025" sub="Elige el rango de meses a comparar (año actual vs 2025)">
          {/* Selector de rango de meses */}
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-brand-bg border border-brand-border rounded-xl">
            <span className="font-mono text-[10px] text-brand-muted uppercase tracking-wider mr-1">Rango</span>
            <label className="flex items-center gap-2">
              <span className="text-xs text-brand-subtle">Desde</span>
              <select
                value={rangoMesInicio}
                onChange={e => setRangoMesInicio(Number(e.target.value))}
                className="bg-brand-surface border border-brand-border rounded-lg px-2 py-1 text-brand-text text-xs outline-none focus:border-brand-teal"
              >
                {MESES_ES.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs text-brand-subtle">Hasta</span>
              <select
                value={rangoMesFin}
                onChange={e => setRangoMesFin(Number(e.target.value))}
                className="bg-brand-surface border border-brand-border rounded-lg px-2 py-1 text-brand-text text-xs outline-none focus:border-brand-teal"
              >
                {MESES_ES.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </label>
            <span className="text-[10px] text-brand-muted font-mono ml-auto">
              {comparativo2025.numMesesConDato} {comparativo2025.numMesesConDato === 1 ? 'mes' : 'meses'} con dato del año actual en este rango
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-brand-bg border border-brand-border rounded-xl p-4">
              <p className="text-xs text-brand-subtle mb-1">Subastas realizadas (total del rango)</p>
              <div className="flex items-end gap-3">
                <p className="font-title text-2xl font-bold text-brand-text">{comparativo2025.totalSubastasActualYTD}</p>
                <p className="text-xs text-brand-muted font-mono mb-1">vs {comparativo2025.totalSubastas2025YTD} en 2025</p>
              </div>
              <p className={`text-xs font-mono mt-1 ${comparativo2025.varSubastas >= 0 ? 'text-brand-teal' : 'text-brand-red'}`}>
                {comparativo2025.varSubastas >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(comparativo2025.varSubastas))} {comparativo2025.varSubastas >= 0 ? 'más' : 'menos'} que 2025 en este rango
              </p>
            </div>
            <div className="bg-brand-bg border border-brand-border rounded-xl p-4">
              <p className="text-xs text-brand-subtle mb-1">Facturación (total del rango)</p>
              <div className="flex items-end gap-3">
                <p className="font-title text-2xl font-bold text-brand-text">{fmtM(comparativo2025.totalFacturacionActualYTD)}</p>
                <p className="text-xs text-brand-muted font-mono mb-1">vs {fmtM(comparativo2025.totalFacturacion2025YTD)} en 2025</p>
              </div>
              <p className={`text-xs font-mono mt-1 ${comparativo2025.varFacturacion >= 0 ? 'text-brand-teal' : 'text-brand-red'}`}>
                {comparativo2025.varFacturacion >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(comparativo2025.varFacturacion))} {comparativo2025.varFacturacion >= 0 ? 'más' : 'menos'} que 2025 en este rango
              </p>
            </div>
          </div>

          {/* Promedios mensuales del rango elegido */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-brand-surface border border-brand-border rounded-xl p-4">
              <p className="text-xs text-brand-subtle mb-1">Promedio mensual de subastas</p>
              <div className="flex items-end gap-3">
                <p className="font-title text-xl font-bold text-brand-teal">{comparativo2025.promedioSubastasActual.toFixed(1)}</p>
                <p className="text-xs text-brand-muted font-mono mb-0.5">vs {comparativo2025.promedioSubastas2025.toFixed(1)} en 2025</p>
              </div>
              <p className={`text-xs font-mono mt-1 ${comparativo2025.varPromedioSubastas >= 0 ? 'text-brand-teal' : 'text-brand-red'}`}>
                {comparativo2025.varPromedioSubastas >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(comparativo2025.varPromedioSubastas))}
              </p>
            </div>
            <div className="bg-brand-surface border border-brand-border rounded-xl p-4">
              <p className="text-xs text-brand-subtle mb-1">Promedio mensual de facturación</p>
              <div className="flex items-end gap-3">
                <p className="font-title text-xl font-bold text-brand-gold">{fmtM(comparativo2025.promedioFacturacionActual)}</p>
                <p className="text-xs text-brand-muted font-mono mb-0.5">vs {fmtM(comparativo2025.promedioFacturacion2025)} en 2025</p>
              </div>
              <p className={`text-xs font-mono mt-1 ${comparativo2025.varPromedioFacturacion >= 0 ? 'text-brand-teal' : 'text-brand-red'}`}>
                {comparativo2025.varPromedioFacturacion >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(comparativo2025.varPromedioFacturacion))}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-brand-subtle mb-2 font-mono uppercase tracking-wider">Subastas por mes</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={comparativo2025.filas} margin={{left:0,right:8,top:4,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                  <XAxis dataKey="mes" tick={{fill:'#8AA4C8',fontSize:11}} axisLine={{stroke:'#2A3340'}} tickLine={false}/>
                  <YAxis tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{background:'#1B232D',border:'1px solid #2A3340',borderRadius:8,fontSize:12}}
                    formatter={(v:number,name:string)=>[v, name==='subastas2025'?'2025':'Actual']}/>
                  <Legend wrapperStyle={{fontSize:11,color:'#8AA4C8'}}/>
                  <Bar dataKey="subastas2025" fill="#5B6472" radius={[4,4,0,0]} name="2025"/>
                  <Bar dataKey="subastasActual" fill="#4FD1C5" radius={[4,4,0,0]} name="Actual"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xs text-brand-subtle mb-2 font-mono uppercase tracking-wider">Facturación por mes</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={comparativo2025.filas} margin={{left:0,right:8,top:4,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                  <XAxis dataKey="mes" tick={{fill:'#8AA4C8',fontSize:11}} axisLine={{stroke:'#2A3340'}} tickLine={false}/>
                  <YAxis tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>fmtM(v)}/>
                  <Tooltip contentStyle={{background:'#1B232D',border:'1px solid #2A3340',borderRadius:8,fontSize:12}}
                    formatter={(v:number,name:string)=>[fmtCOP(v), name==='facturacion2025'?'2025':'Actual']}/>
                  <Legend wrapperStyle={{fontSize:11,color:'#8AA4C8'}}/>
                  <Bar dataKey="facturacion2025" fill="#5B6472" radius={[4,4,0,0]} name="2025"/>
                  <Bar dataKey="facturacionActual" fill="#E8A33D" radius={[4,4,0,0]} name="Actual"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className="text-[10px] text-brand-muted font-mono mt-3">
            2025 completo: {comparativo2025.totalSubastas2025Completo} subastas · {fmtCOP(comparativo2025.totalFacturacion2025Completo)} facturación total
          </p>
        </Panel>
        <div className="mb-3" />

        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatBadge icon={<FileCheck size={14}/>} label="Facturas radicadas"  value={fKpis.radicadas}  color="teal"/>
          <StatBadge icon={<FileClock size={14}/>} label="Facturas pendientes" value={fKpis.pendientes} color="gold"/>
          <StatBadge icon={<FileX size={14}/>}     label="Facturas anuladas"   value={fKpis.anuladas}   color="red"/>
        </div>

        {/* ── GRÁFICAS PRINCIPALES ──────────────────────────────────────── */}
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

        {/* ── PROYECCIÓN ANUAL ─────────────────────────────────────────── */}
        <div className="mb-4">
          <Panel title="Valor autorizado por mes — 2026" sub="Histórico real · punto dorado = proyección mes siguiente">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={proyeccionMes.serie} margin={{left:0,right:16,top:8,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                    <XAxis dataKey="mes" tick={{fill:'#8AA4C8',fontSize:10}} axisLine={{stroke:'#2A3340'}} tickLine={false} interval={0} angle={-30} textAnchor="end" height={40}/>
                    <YAxis tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={(v:number)=>v?`$${(v/1e6).toFixed(0)}M`:''}/>
                    <Tooltip contentStyle={{background:'#1B232D',border:'1px solid #2A3340',borderRadius:8,fontSize:12}}
                      formatter={(v:number,_:string,p:{payload?:{esReal?:boolean}})=>[v?fmtCOP(v):'—',p.payload?.esReal?'Real':'Proyectado']}/>
                    <Line type="monotone" dataKey="valorAut" stroke="#4FD1C5" strokeWidth={2.5} connectNulls={false}
                      dot={(p:{cx:number;cy:number;payload:{esReal:boolean;valorAut:number|null}})=>{
                        if(!p.payload.valorAut) return <circle key={p.cx} cx={0} cy={0} r={0}/>
                        return <circle key={p.cx} cx={p.cx} cy={p.cy} r={5} fill={p.payload.esReal?'#4FD1C5':'#E8A33D'} stroke="#0F1419" strokeWidth={2}/>
                      }}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-3 justify-center">
                {proyeccionMes.proyectado!==null&&proyeccionMes.siguienteMes&&(
                  <div className="bg-brand-bg border border-brand-gold/40 rounded-xl p-4">
                    <p className="font-mono text-xs text-brand-gold uppercase tracking-wider mb-1">Proyección {proyeccionMes.siguienteMes}</p>
                    <p className="font-title text-lg font-bold text-brand-text">{fmtCOP(proyeccionMes.proyectado)}</p>
                    <p className="text-brand-muted text-xs mt-1 font-mono">Tendencia lineal</p>
                  </div>
                )}
                {/* Proyección mes en curso */}
                <div className="bg-brand-bg border border-brand-teal/40 rounded-xl p-4">
                  <p className="font-mono text-xs text-brand-teal uppercase tracking-wider mb-1">Julio — mes en curso</p>
                  <p className="font-title text-lg font-bold text-brand-text">{fmtCOP(mesActual.proyValor)}</p>
                  <p className="text-brand-muted text-xs mt-1 font-mono">Ritmo: {mesActual.ritmo.toFixed(1)} sub/día · {mesActual.total} días hábiles</p>
                </div>
                {proyeccionMes.historico.filter(h=>h.mes).slice(-2).reverse().map(h=>(
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

        {/* ── CIUDADES + TIEMPO ────────────────────────────────────────── */}
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
              <BarChart data={porTiempo} margin={{left:0,right:8,top:8,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3340" vertical={false}/>
                <XAxis dataKey="rango" tick={{fill:'#8AA4C8',fontSize:11}} axisLine={{stroke:'#2A3340'}} tickLine={false}/>
                <YAxis tick={{fill:'#8AA4C8',fontSize:10}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{background:'#1B232D',border:'1px solid #2A3340',borderRadius:8,fontSize:12}}/>
                <Bar dataKey="cantidad" radius={[6,6,0,0]} fill="#8AA4C8" name="Subastas"/>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* ── DESGLOSE POR ASESOR ──────────────────────────────────────── */}
        <div className="mb-4">
          <Panel title="Desglose por asesor" sub="2026 vs 2025 · subastas, conversión y facturación">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border">
                    {['Nombre','Sub. 2026','Sub. 2025','Var.','%Conv. Actual','%Conv. Ant.','Var. PP','Factur. 2026','Factur. 2025','Var. $'].map(h=>(
                      <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porAsesor.map(a=>(
                    <tr key={a.id} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                      <td className="py-3 pr-4 text-brand-text font-medium">{a.nombre}</td>
                      <td className="py-3 pr-4 font-mono text-brand-subtle">{a.total}</td>
                      <td className="py-3 pr-4 font-mono text-brand-subtle">{a.total2025||'—'}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{a.varSub!=null?<span className={a.varSub>=0?'text-brand-teal':'text-brand-red'}>{a.varSub>=0?'▲':'▼'} {Math.abs(a.varSub).toFixed(1)}%</span>:'—'}</td>
                      <td className="py-3 pr-4 font-mono text-brand-subtle">{fmtPct(a.convActual)}</td>
                      <td className="py-3 pr-4 font-mono text-brand-subtle">{a.total2025?fmtPct(a.conv2025):'—'}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{a.total2025?<span className={a.varConv>=0?'text-brand-teal':'text-brand-red'}>{a.varConv>=0?'+':''}{a.varConv.toFixed(1)} pp</span>:'—'}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtM(a.valorAut)}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{a.valorAut2025?fmtM(a.valorAut2025):'—'}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{a.varFact!=null?<span className={a.varFact>=0?'text-brand-teal':'text-brand-red'}>{a.varFact>=0?'▲':'▼'} {Math.abs(a.varFact).toFixed(1)}%</span>:'—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-brand-border font-bold">
                    <td className="py-3 pr-4 text-brand-text font-mono text-xs uppercase">Total</td>
                    <td className="py-3 pr-4 font-mono text-brand-text">{porAsesor.reduce((s,a)=>s+a.total,0)}</td>
                    <td className="py-3 pr-4 font-mono text-brand-subtle">{porAsesor.reduce((s,a)=>s+a.total2025,0)||'—'}</td>
                    <td colSpan={4} className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtPct(porAsesor.reduce((s,a)=>s+a.ganadas,0)/Math.max(1,porAsesor.reduce((s,a)=>s+a.total,0))*100)}</td>
                    <td className="py-3 pr-4 font-mono text-brand-text">{fmtM(porAsesor.reduce((s,a)=>s+a.valorAut,0))}</td>
                    <td className="py-3 pr-4 font-mono text-brand-subtle">{fmtM(porAsesor.reduce((s,a)=>s+a.valorAut2025,0))}</td>
                    <td/>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {/* ── DESGLOSE POR ASEGURADORA ─────────────────────────────────── */}
        <Panel title="Desglose por aseguradora" sub="2026 vs 2025 · subastas, conversión y facturación">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Nombre','Sub. 2026','Sub. 2025','Var.','%Conv. Actual','%Conv. Ant.','Var. PP','Factur. 2026','Factur. 2025','Var. $'].map(h=>(
                    <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porAseguradora.map(a=>(
                  <tr key={a.id} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                    <td className="py-3 pr-4 text-brand-text">{a.nombre}</td>
                    <td className="py-3 pr-4 font-mono text-brand-subtle">{a.total}</td>
                    <td className="py-3 pr-4 font-mono text-brand-subtle">{a.total2025||'—'}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{a.varSub!=null?<span className={a.varSub>=0?'text-brand-teal':'text-brand-red'}>{a.varSub>=0?'▲':'▼'} {Math.abs(a.varSub).toFixed(1)}%</span>:'—'}</td>
                    <td className="py-3 pr-4 font-mono text-brand-subtle">{fmtPct(a.convActual)}</td>
                    <td className="py-3 pr-4 font-mono text-brand-subtle">{a.total2025?fmtPct(a.conv2025):'—'}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{a.total2025?<span className={a.varConv>=0?'text-brand-teal':'text-brand-red'}>{a.varConv>=0?'+':''}{a.varConv.toFixed(1)} pp</span>:'—'}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtM(a.valorAut)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{a.valorAut2025?fmtM(a.valorAut2025):'—'}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{a.varFact!=null?<span className={a.varFact>=0?'text-brand-teal':'text-brand-red'}>{a.varFact>=0?'▲':'▼'} {Math.abs(a.varFact).toFixed(1)}%</span>:'—'}</td>
                  </tr>
                ))}
                <tr className="border-t border-brand-border font-bold">
                  <td className="py-3 pr-4 text-brand-text font-mono text-xs uppercase">Total</td>
                  <td className="py-3 pr-4 font-mono text-brand-text">{porAseguradora.reduce((s,a)=>s+a.total,0)}</td>
                  <td className="py-3 pr-4 font-mono text-brand-subtle">{porAseguradora.reduce((s,a)=>s+a.total2025,0)||'—'}</td>
                  <td colSpan={4} className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtPct(porAseguradora.reduce((s,a)=>s+a.ganadas,0)/Math.max(1,porAseguradora.reduce((s,a)=>s+a.total,0))*100)}</td>
                  <td className="py-3 pr-4 font-mono text-brand-text">{fmtM(porAseguradora.reduce((s,a)=>s+a.valorAut,0))}</td>
                  <td className="py-3 pr-4 font-mono text-brand-subtle">{fmtM(porAseguradora.reduce((s,a)=>s+a.valorAut2025,0))}</td>
                  <td/>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ── Sub-componentes ──────────────────────────────────────────────────────────
function MesCard({label,value,color,highlight,small}:{label:string;value:string|number;color:string;highlight?:boolean;small?:boolean}) {
  const cls:Record<string,string>={teal:'text-brand-teal',gold:'text-brand-gold',subtle:'text-brand-subtle'}
  return (
    <div className={`rounded-lg p-3 ${highlight?'bg-brand-gold/10 border border-brand-gold/30':'bg-brand-bg border border-brand-border'}`}>
      <p className="font-mono text-xs text-brand-muted mb-1">{label}</p>
      <p className={`font-title font-bold ${small?'text-base':'text-xl'} ${cls[color]||'text-brand-text'}`}>{value}</p>
    </div>
  )
}
function KpiCard({icon,label,value,accent,small,hint}:{icon:React.ReactNode;label:string;value:string|number;accent:string;small?:boolean;hint?:string}) {
  const bc:Record<string,string>={teal:'#4FD1C5',gold:'#E8A33D',blue:'#60A5FA',red:'#E5484D',muted:'#5B6472'}
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 relative overflow-hidden">
      <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:bc[accent]||'#4FD1C5'}}/>
      <div className="flex items-center gap-2 text-brand-subtle mb-2">{icon}<span className="text-xs">{label}</span></div>
      <div className={`font-title font-bold text-brand-text ${small?'text-lg':'text-2xl'}`}>{value}</div>
      {hint&&<p className="text-brand-muted text-xs mt-1 font-mono">{hint}</p>}
    </div>
  )
}
function StatBadge({icon,label,value,color}:{icon:React.ReactNode;label:string;value:number;color:string}) {
  const cls:Record<string,string>={teal:'text-brand-teal',gold:'text-brand-gold',red:'text-brand-red'}
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
