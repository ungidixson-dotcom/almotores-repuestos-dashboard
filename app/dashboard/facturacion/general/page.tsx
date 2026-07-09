'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'

const BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgv_V93SUlbyd5gXHKs0znKRVwwTgUSF4WpkmJurZ8N4RxaRj1cTAgCqG0klE4i8BBoiUpbjOMnsxt/pub'
const GID = {
  taller:       '1968437267',
  mostrador:    '143806698',
  credito:      '1646038872',
  presupuesto:  '1013471630',
  prefijos:     '83279873',
  tipoClientes: '1039901350',
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
               'Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const SEDES_LIST = ['Todas','Norte','Pasoancho','Sede 39']

const FESTIVOS = new Set([
  '2025-01-01','2025-01-06','2025-03-24','2025-04-17','2025-04-18','2025-05-01',
  '2025-06-02','2025-06-23','2025-06-30','2025-07-20','2025-08-07','2025-08-18',
  '2025-10-13','2025-11-03','2025-11-17','2025-12-08','2025-12-25',
  '2026-01-01','2026-01-05','2026-03-23','2026-04-02','2026-04-03','2026-05-01',
  '2026-05-18','2026-06-08','2026-06-29','2026-07-20','2026-08-07','2026-08-17',
  '2026-10-12','2026-11-02','2026-11-16','2026-12-08','2026-12-25',
])

const fmtCOP = (v: number, d=1) => {
  const abs=Math.abs(v), s=v<0?'-':''
  if(abs>=1e9) return `${s}$${(abs/1e9).toFixed(d)}B`
  if(abs>=1e6) return `${s}$${(abs/1e6).toFixed(d)}M`
  if(abs>=1e3) return `${s}$${(abs/1e3).toFixed(0)}K`
  return `${s}$${abs.toFixed(0)}`
}
const fmtPct = (v: number) => `${v.toFixed(1)}%`

const parseCOP = (s: string|undefined): number => {
  if(!s) return 0
  let str=s.toString().replace(/"/g,'').trim()
  if(str.startsWith('(')&&str.endsWith(')')) str='-'+str.slice(1,-1)
  str=str.replace(/[$\s]/g,'').replace(/,/g,'')
  const n=parseFloat(str); return isNaN(n)?0:n
}

const parseFecha = (s: string|undefined): Date|null => {
  if(!s) return null
  const str=s.trim().replace(/"/g,'')
  if(/^\d{4}-\d{2}-\d{2}/.test(str)){const[y,m,d]=str.slice(0,10).split('-').map(Number);return new Date(y,m-1,d)}
  if(str.includes('/')){const[d,m,y]=str.split('/');const a=parseInt(y)<100?2000+parseInt(y):parseInt(y);return new Date(a,parseInt(m)-1,parseInt(d))}
  return null
}

const normCuenta=(v:unknown):string=>{try{return String(parseInt(String(parseFloat(String(v))),10)).trim()}catch{return String(v??'').trim()}}
const esDiaHabil=(d:Date)=>d.getDay()!==0&&!FESTIVOS.has(d.toISOString().slice(0,10))
const diasHabilesEnMes=(a:number,m:number)=>{const d=new Date(a,m-1,1);let c=0;while(d.getMonth()===m-1){if(esDiaHabil(d))c++;d.setDate(d.getDate()+1)}return c}
const diasHabilesHasta=(a:number,m:number,dia:number)=>{const d=new Date(a,m-1,1);let c=0;while(d.getDate()<=dia&&d.getMonth()===m-1){if(esDiaHabil(d))c++;d.setDate(d.getDate()+1)}return c}

const fetchCSV=async(gid:string):Promise<string[][]>=>{
  const r=await fetch(`${BASE_URL}?gid=${gid}&single=true&output=csv`,{cache:'no-store'})
  const txt=await r.text()
  return txt.split('\n').map(row=>{
    const cells:string[]=[]; let cur='',inQ=false
    for(const ch of row){if(ch==='"'){inQ=!inQ;continue}if(ch===','&&!inQ){cells.push(cur.trim());cur='';continue}cur+=ch}
    cells.push(cur.trim()); return cells
  })
}

function Panel({children,className=''}:{children:React.ReactNode;className?:string}){
  return <div className={`rounded-xl border border-brand-border bg-brand-surface p-5 ${className}`}>{children}</div>
}
function KpiCard({label,value,sub,sub2,accent='text-brand-teal',alert=false}:{label:string;value:string;sub?:string;sub2?:string;accent?:string;alert?:boolean}){
  return(<Panel className={alert?'border-red-500/40':''}><p className="text-xs font-mono uppercase tracking-wider text-brand-subtle mb-1">{label}</p><p className={`text-2xl font-bold font-title ${accent}`}>{value}</p>{sub&&<p className="text-xs text-brand-subtle mt-1">{sub}</p>}{sub2&&<p className="text-xs text-brand-subtle mt-0.5">{sub2}</p>}</Panel>)
}
function ProgressBar({pct,color,h='h-2'}:{pct:number;color:string;h?:string}){
  return(<div className={`w-full ${h} bg-brand-border rounded-full overflow-hidden`}><div className="h-full rounded-full transition-all duration-700" style={{width:`${Math.min(100,Math.max(0,pct))}%`,background:color}}/></div>)
}
function Badge({tipo}:{tipo:'ok'|'alerta'|'riesgo'}){
  if(tipo==='ok') return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-mono">✓ En meta</span>
  if(tipo==='alerta') return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-mono">⚠ Alerta</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-mono">✗ Riesgo</span>
}

const CANALES_CONFIG=[
  {canal:'Taller',    icon:'🔧',color:'#4FD1C5'},
  {canal:'Colisión',  icon:'🚗',color:'#68D391'},
  {canal:'Accesorios',icon:'🎁',color:'#F6AD55'},
  {canal:'Mostrador', icon:'🛒',color:'#63B3ED'},
  {canal:'Mayoristas',icon:'📦',color:'#B794F4'},
  {canal:'Subastas',  icon:'🔨',color:'#FC8181'},
]

export default function FacGeneralPage(){
  const hoy=new Date()
  const[anio,setAnio]=useState(hoy.getFullYear())
  const[mes,setMes]=useState(hoy.getMonth()+1)
  const[sede,setSede]=useState('Todas')
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')
  const[ultimaAct,setUltimaAct]=useState<Date|null>(null)
  const[tallerRaw,setTallerRaw]=useState<string[][]>([])
  const[mostradorRaw,setMostradorRaw]=useState<string[][]>([])
  const[creditoRaw,setCreditoRaw]=useState<string[][]>([])
  const[pptoRaw,setPptoRaw]=useState<string[][]>([])
  const[prefijosRaw,setPrefijosRaw]=useState<string[][]>([])
  const[tipoCliRaw,setTipoCliRaw]=useState<string[][]>([])

  const cargar=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const[tal,most,cred,ppto,pref,tipoC]=await Promise.all([
        fetchCSV(GID.taller),fetchCSV(GID.mostrador),fetchCSV(GID.credito),
        fetchCSV(GID.presupuesto),fetchCSV(GID.prefijos),fetchCSV(GID.tipoClientes),
      ])
      setTallerRaw(tal);setMostradorRaw(most);setCreditoRaw(cred)
      setPptoRaw(ppto);setPrefijosRaw(pref);setTipoCliRaw(tipoC)
      setUltimaAct(new Date())
    }catch{setError('Error cargando datos del Sheet.')}
    setLoading(false)
  },[])

  useEffect(()=>{cargar()},[cargar])
  useEffect(()=>{const id=setInterval(cargar,6*60*60*1000);return()=>clearInterval(id)},[cargar])

  const totalDH=useMemo(()=>diasHabilesEnMes(anio,mes),[anio,mes])
  const dhTransc=useMemo(()=>(anio===hoy.getFullYear()&&mes===hoy.getMonth()+1)?diasHabilesHasta(anio,mes,hoy.getDate()):totalDH,[anio,mes,totalDH])
  const dhRest=totalDH-dhTransc
  const pctDias=totalDH?(dhTransc/totalDH)*100:0

  const prefMap=useMemo(()=>{
    const m:Record<string,{canal:string;sede:string}>={};
    prefijosRaw.slice(1).forEach(r=>{
      const p=r[0]?.trim(),canal=r[10]?.trim(),s=r[1]?.trim();if(!p||!canal)return
      const sede=s==='Norte'?'Norte':s==='Pasoancho'?'Pasoancho':s==='Sede 39'?'Sede 39':
        canal.includes('Norte')?'Norte':canal.includes('Pasoancho')?'Pasoancho':canal.includes('39')?'Sede 39':'Sin sede'
      m[p]={canal,sede}
    });return m
  },[prefijosRaw])

  const cuentasMayoristas=useMemo(()=>{const s=new Set<string>();tipoCliRaw.slice(1).forEach(r=>{if(r[2]?.toLowerCase().includes('mayorist'))s.add(normCuenta(r[0]))});return s},[tipoCliRaw])
  const cuentasSubastas=useMemo(()=>{const s=new Set<string>();tipoCliRaw.slice(1).forEach(r=>{if(r[2]?.toLowerCase().includes('subast'))s.add(normCuenta(r[0]))});return s},[tipoCliRaw])

  const presupuestos=useMemo(()=>{
    const mesIdx=mes-1+7
    const m:Record<string,Record<string,number>>={}
    pptoRaw.slice(1).forEach(r=>{
      const s=r[0]?.trim()||'',canal=r[4]?.trim()||'',val=parseCOP(r[mesIdx])
      if(!canal||!val)return
      if(!m[canal])m[canal]={Norte:0,Pasoancho:0,'Sede 39':0,Total:0}
      const sd=s==='Norte'?'Norte':s==='Pasoancho'?'Pasoancho':s==='Sede 39'?'Sede 39':'Total'
      if(sd!=='Total')m[canal][sd]+=val
      m[canal]['Total']+=val
    });return m
  },[pptoRaw,mes])

  const getPpto=(canal:string,sd:string)=>{
    const c=presupuestos[canal];if(!c)return 0
    return sd==='Todas'?c['Total']:(c[sd]||0)
  }

  const dataTaller=useMemo(()=>{
    const r:Record<string,{neto:number;costo:number}>={Norte:{neto:0,costo:0},Pasoancho:{neto:0,costo:0},'Sede 39':{neto:0,costo:0},Colisión:{neto:0,costo:0},Accesorios:{neto:0,costo:0}}
    tallerRaw.slice(1).forEach(row=>{
      const t=row[0]?.toString().trim().toUpperCase();if(!t||!row[14])return
      const fec=parseFecha(row[6]);if(!fec||fec.getFullYear()!==anio||fec.getMonth()+1!==mes)return
      const neto=parseCOP(row[14]),costo=parseCOP(row[15])
      if(t==='16'){r.Colisión.neto+=neto;r.Colisión.costo+=costo}
      else if(['11A','12A','13A'].includes(t)){r.Accesorios.neto+=neto;r.Accesorios.costo+=costo}
      else if(t==='11'){r.Norte.neto+=neto;r.Norte.costo+=costo}
      else if(t==='12'){r.Pasoancho.neto+=neto;r.Pasoancho.costo+=costo}
      else if(t==='13'){r['Sede 39'].neto+=neto;r['Sede 39'].costo+=costo}
    });return r
  },[tallerRaw,anio,mes])

  const dataMostrador=useMemo(()=>{
    type CV={neto:number;costo:number}
    const canales:Record<string,Record<string,CV>>={};
    const asesores:Record<string,{neto:number;costo:number;canales:Record<string,number>}>={};
    const init=(c:string,s:string)=>{if(!canales[c])canales[c]={};if(!canales[c][s])canales[c][s]={neto:0,costo:0}}

    mostradorRaw.slice(1).forEach(r=>{
      if(!r[14])return
      const fec=parseFecha(r[6]);if(!fec||fec.getFullYear()!==anio||fec.getMonth()+1!==mes)return
      const cuenta=normCuenta(r[4]),pref=r[7]?.trim()||''
      const neto=parseCOP(r[14]),costo=parseCOP(r[15])
      const asesor=r[3]?.trim()||r[2]?.trim()||'Sin asesor'
      const pi=prefMap[pref],s=pi?.sede||'Sin sede'
      let canal='Mostrador'
      if(cuentasMayoristas.has(cuenta))canal='Mayoristas'
      else if(cuentasSubastas.has(cuenta))canal='Subastas'
      else if(pi?.canal?.includes('Accesorio'))canal='Accesorios'
      else if(pi?.canal?.includes('Subasta'))canal='Subastas'
      init(canal,s);canales[canal][s].neto+=neto;canales[canal][s].costo+=costo
      if(['Mostrador','Accesorios'].includes(canal)){
        if(!asesores[asesor])asesores[asesor]={neto:0,costo:0,canales:{}}
        asesores[asesor].neto+=neto;asesores[asesor].costo+=costo
        asesores[asesor].canales[canal]=(asesores[asesor].canales[canal]||0)+neto
      }
    })

    let curCuenta='',curFecha='',curPrefijo='',curAsesor='',curRefer=''
    creditoRaw.slice(1).forEach(r=>{
      if(r[0]?.trim()){curRefer=r[1];curCuenta=r[4];curFecha=r[6];curPrefijo=r[8];curAsesor=r[3]?.trim()||r[2]?.trim()||'Sin asesor'}
      if(!curFecha||!r[16])return
      const fec=parseFecha(curFecha);if(!fec||fec.getFullYear()!==anio||fec.getMonth()+1!==mes)return
      const cuenta=normCuenta(curCuenta),neto=parseCOP(r[16]),costo=parseCOP(r[17])
      const pi=prefMap[curPrefijo],s=pi?.sede||'Norte'
      let canal='Mostrador'
      if(cuentasSubastas.has(cuenta))canal='Subastas'
      else if(cuentasMayoristas.has(cuenta))canal='Mayoristas'
      const netoF=(canal==='Subastas'&&curPrefijo==='ENR2')?-neto:neto
      init(canal,s);canales[canal][s].neto+=netoF;canales[canal][s].costo+=costo
      if(canal==='Mostrador'){
        if(!asesores[curAsesor])asesores[curAsesor]={neto:0,costo:0,canales:{}}
        asesores[curAsesor].neto+=netoF;asesores[curAsesor].costo+=costo
        asesores[curAsesor].canales['Mostrador']=(asesores[curAsesor].canales['Mostrador']||0)+netoF
      }
    })
    return{canales,asesores}
  },[mostradorRaw,creditoRaw,cuentasMayoristas,cuentasSubastas,prefMap,anio,mes])

  const getNetoCanal=(canal:string)=>{
    if(canal==='Taller'){if(sede==='Todas')return dataTaller.Norte.neto+dataTaller.Pasoancho.neto+dataTaller['Sede 39'].neto;return dataTaller[sede]?.neto||0}
    if(canal==='Colisión')return dataTaller.Colisión.neto
    if(canal==='Accesorios'){
      const talAcc=sede==='Todas'?dataTaller.Accesorios.neto:0
      const m=dataMostrador.canales['Accesorios']||{}
      return talAcc+(sede==='Todas'?Object.values(m).reduce((s,v)=>s+v.neto,0):(m[sede]?.neto||0))
    }
    const m=dataMostrador.canales[canal]||{}
    return sede==='Todas'?Object.values(m).reduce((s,v)=>s+v.neto,0):(m[sede]?.neto||0)
  }
  const getCostoCanal=(canal:string)=>{
    if(canal==='Taller'){if(sede==='Todas')return dataTaller.Norte.costo+dataTaller.Pasoancho.costo+dataTaller['Sede 39'].costo;return dataTaller[sede]?.costo||0}
    if(canal==='Colisión')return dataTaller.Colisión.costo
    if(canal==='Accesorios'){
      const talAcc=sede==='Todas'?dataTaller.Accesorios.costo:0
      const m=dataMostrador.canales['Accesorios']||{}
      return talAcc+(sede==='Todas'?Object.values(m).reduce((s,v)=>s+v.costo,0):(m[sede]?.costo||0))
    }
    const m=dataMostrador.canales[canal]||{}
    return sede==='Todas'?Object.values(m).reduce((s,v)=>s+v.costo,0):(m[sede]?.costo||0)
  }

  const canalesData=useMemo(()=>CANALES_CONFIG
    .filter(c => sede==='Todas' || c.canal!=='Colisión')
    .map(c=>{
    const neto=getNetoCanal(c.canal),costo=getCostoCanal(c.canal)
    const ppto=sede==='Todas'?getPpto(c.canal,'Todas'):getPpto(c.canal,sede)
    const util=neto-costo,pctUtil=neto?(util/neto)*100:0
    const pct=ppto?(neto/ppto)*100:0
    const porDia=dhTransc?neto/dhTransc:0
    const neces=dhRest>0?(ppto-neto)/dhRest:0
    const pron=neto+porDia*dhRest
    const pctPron=ppto?(pron/ppto)*100:0
    const estado:('ok'|'alerta'|'riesgo')=pctPron>=95?'ok':pctPron>=85?'alerta':'riesgo'
    return{...c,neto,costo,util,pctUtil,ppto,pct,porDia,neces,pron,pctPron,estado}
  }),[dataTaller,dataMostrador,presupuestos,sede,dhTransc,dhRest])

  const totalNeto=canalesData.reduce((s,c)=>s+c.neto,0)
  const totalCosto=canalesData.reduce((s,c)=>s+c.costo,0)
  const totalUtil=totalNeto-totalCosto
  const totalPpto=canalesData.reduce((s,c)=>s+c.ppto,0)
  const totalPct=totalPpto?(totalNeto/totalPpto)*100:0
  const totalPctUtil=totalNeto?(totalUtil/totalNeto)*100:0
  const porDiaTotal=dhTransc?totalNeto/dhTransc:0
  const necesTotal=dhRest>0?(totalPpto-totalNeto)/dhRest:0
  const pronTotal=totalNeto+porDiaTotal*dhRest
  const pctPronTotal=totalPpto?(pronTotal/totalPpto)*100:0
  const estadoGeneral:('ok'|'alerta'|'riesgo')=pctPronTotal>=95?'ok':pctPronTotal>=85?'alerta':'riesgo'
  const colorGeneral=estadoGeneral==='ok'?'#68D391':estadoGeneral==='alerta'?'#F6AD55':'#FC8181'

  const asesoresData=useMemo(()=>Object.entries(dataMostrador.asesores).map(([n,d])=>({nombre:n,...d})).sort((a,b)=>b.neto-a.neto),[dataMostrador])

  if(loading)return(
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-teal border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
        <p className="text-brand-subtle text-sm font-mono">Cargando datos del Sheet...</p>
      </div>
    </div>
  )

  return(
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-title text-brand-text">Facturación General</h1>
          <p className="text-sm text-brand-subtle mt-0.5">Seguimiento vs presupuesto · pronóstico · utilidad · {MESES[mes-1]} {anio}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-brand-border overflow-hidden">
            {SEDES_LIST.map(s=>(
              <button key={s} onClick={()=>setSede(s)}
                className={`px-3 py-2 text-xs font-mono transition-colors ${sede===s?'bg-brand-teal text-black':'text-brand-subtle hover:text-brand-text'}`}>
                {s}
              </button>
            ))}
          </div>
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
          {ultimaAct&&<span className="text-xs text-brand-subtle font-mono">Act: {ultimaAct.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</span>}
        </div>
      </div>

      {error&&<div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-400 text-sm font-mono">{error}</div>}

      {/* Días hábiles */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle">Días hábiles — {MESES[mes-1]} {anio} {sede!=='Todas'?`· ${sede}`:''}</p>
            <p className="text-lg font-bold font-title text-brand-text mt-0.5">{dhTransc} de {totalDH} transcurridos · {dhRest} restantes</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold font-title text-brand-teal">{pctDias.toFixed(0)}%</p>
            <p className="text-xs text-brand-subtle font-mono">del mes avanzado</p>
          </div>
        </div>
        <ProgressBar pct={pctDias} color="#4FD1C5"/>
      </Panel>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Facturado total" value={fmtCOP(totalNeto)} sub={`de ${fmtCOP(totalPpto)} presupuestado`} sub2={`${fmtPct(totalPct)} de avance`} accent="text-brand-teal"/>
        <KpiCard label="Utilidad" value={fmtCOP(totalUtil)} sub={`Margen: ${fmtPct(totalPctUtil)}`} sub2={`Costo: ${fmtCOP(totalCosto)}`} accent="text-green-400"/>
        <KpiCard label="Facturación / día" value={fmtCOP(porDiaTotal)} sub={`Necesario: ${fmtCOP(necesTotal)}/día`} sub2={porDiaTotal>=necesTotal?'✓ Por encima del ritmo':'✗ Por debajo del ritmo'} accent={porDiaTotal>=necesTotal?'text-green-400':'text-yellow-400'}/>
        <KpiCard label="Pronóstico cierre" value={fmtCOP(pronTotal)} sub={`${fmtPct(pctPronTotal)} del presupuesto`} accent={pctPronTotal>=95?'text-green-400':pctPronTotal>=85?'text-yellow-400':'text-red-400'} alert={estadoGeneral==='riesgo'}/>
      </div>

      {/* Barra general */}
      <Panel>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-mono uppercase tracking-wider text-brand-subtle">Avance general vs presupuesto</p>
          <Badge tipo={estadoGeneral}/>
        </div>
        <div className="relative mb-1">
          <ProgressBar pct={totalPct} color={colorGeneral} h="h-3"/>
          <div className="absolute top-0 h-full flex items-center pointer-events-none" style={{left:`${pctDias}%`}}>
            <div className="w-0.5 h-5 bg-white/60 -mt-1"/>
          </div>
        </div>
        <div className="flex justify-between text-xs font-mono text-brand-subtle">
          <span>{fmtPct(totalPct)} facturado · {fmtCOP(totalNeto)}</span>
          <span className="opacity-40">{fmtPct(pctDias)} días hábiles</span>
          <span>{fmtCOP(totalPpto)} presupuesto</span>
        </div>
      </Panel>

      {/* Tabla por canal */}
      <Panel>
        <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Detalle por canal {sede!=='Todas'?`· ${sede}`:''}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Canal','Presupuesto','Neto','Costo','Utilidad','% Util','% Avance','$/Día','Necesario/día','Pronóstico','Estado'].map(h=>(
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {canalesData.map(c=>(
                <tr key={c.canal} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                  <td className="py-3 pr-3"><div className="flex items-center gap-2"><span>{c.icon}</span><span className="font-medium text-brand-text">{c.canal}</span></div></td>
                  <td className="py-3 pr-3 font-mono text-xs text-brand-subtle">{fmtCOP(c.ppto)}</td>
                  <td className="py-3 pr-3 font-mono text-xs font-semibold" style={{color:c.color}}>{fmtCOP(c.neto)}</td>
                  <td className="py-3 pr-3 font-mono text-xs text-brand-subtle">{fmtCOP(c.costo)}</td>
                  <td className="py-3 pr-3 font-mono text-xs text-green-400">{fmtCOP(c.util)}</td>
                  <td className="py-3 pr-3 font-mono text-xs text-brand-subtle">{fmtPct(c.pctUtil)}</td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <div className="w-12 h-1.5 bg-brand-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${Math.min(100,c.pct)}%`,background:c.color}}/>
                      </div>
                      <span className="font-mono text-xs text-brand-subtle">{fmtPct(c.pct)}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs text-brand-subtle">{fmtCOP(c.porDia)}</td>
                  <td className="py-3 pr-3 font-mono text-xs"><span className={c.porDia>=c.neces?'text-green-400':'text-red-400'}>{fmtCOP(c.neces)}</span></td>
                  <td className="py-3 pr-3 font-mono text-xs text-brand-subtle">{fmtCOP(c.pron)}</td>
                  <td className="py-3 pr-3"><Badge tipo={c.estado}/></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brand-border font-bold">
                <td className="pt-3 pr-3 font-mono text-xs uppercase text-brand-text">Total</td>
                <td className="pt-3 pr-3 font-mono text-xs text-brand-subtle">{fmtCOP(totalPpto)}</td>
                <td className="pt-3 pr-3 font-mono text-xs text-brand-teal">{fmtCOP(totalNeto)}</td>
                <td className="pt-3 pr-3 font-mono text-xs text-brand-subtle">{fmtCOP(totalCosto)}</td>
                <td className="pt-3 pr-3 font-mono text-xs text-green-400">{fmtCOP(totalUtil)}</td>
                <td className="pt-3 pr-3 font-mono text-xs text-brand-subtle">{fmtPct(totalPctUtil)}</td>
                <td className="pt-3 pr-3 font-mono text-xs text-brand-subtle">{fmtPct(totalPct)}</td>
                <td className="pt-3 pr-3 font-mono text-xs text-brand-subtle">{fmtCOP(porDiaTotal)}</td>
                <td className="pt-3 pr-3 font-mono text-xs"><span className={porDiaTotal>=necesTotal?'text-green-400':'text-red-400'}>{fmtCOP(necesTotal)}</span></td>
                <td className="pt-3 pr-3 font-mono text-xs text-brand-subtle">{fmtCOP(pronTotal)}</td>
                <td className="pt-3 pr-3"><Badge tipo={estadoGeneral}/></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      {/* Cards por canal */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {canalesData.map(c=>(
          <Panel key={c.canal} className={c.estado==='riesgo'?'border-red-500/30':c.estado==='alerta'?'border-yellow-500/20':''}>
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{c.icon}</span>
                <div>
                  <p className="font-semibold text-brand-text">{c.canal}</p>
                  <p className="text-xs text-brand-subtle font-mono">{fmtCOP(c.neto)} / {fmtCOP(c.ppto)}</p>
                </div>
              </div>
              <Badge tipo={c.estado}/>
            </div>
            <ProgressBar pct={c.pct} color={c.color}/>
            <div className="flex justify-between mt-2 text-xs font-mono text-brand-subtle">
              <span>{fmtPct(c.pct)} avance</span>
              <span>Pron: {fmtPct(c.pctPron)}</span>
            </div>
            <div className="mt-3 pt-3 border-t border-brand-border/40 grid grid-cols-3 gap-2 text-xs font-mono">
              <div><p className="text-brand-subtle">Utilidad</p><p className="text-green-400 font-semibold">{fmtCOP(c.util)}</p><p className="text-brand-subtle">{fmtPct(c.pctUtil)}</p></div>
              <div><p className="text-brand-subtle">$/día actual</p><p className="text-brand-text font-semibold">{fmtCOP(c.porDia)}</p></div>
              <div><p className="text-brand-subtle">$/día neces.</p><p className={c.porDia>=c.neces?'text-green-400 font-semibold':'text-red-400 font-semibold'}>{fmtCOP(c.neces)}</p></div>
            </div>
          </Panel>
        ))}
      </div>

      {/* Asesores */}
      <Panel>
        <h2 className="text-sm font-mono uppercase tracking-wider text-brand-subtle mb-4">Facturación por asesor — Mostrador y Accesorios</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                {['Asesor','Mostrador','Accesorios','Neto Total','Costo','Utilidad','% Utilidad'].map(h=>(
                  <th key={h} className="text-left font-mono text-xs text-brand-subtle uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {asesoresData.map(a=>{
                const util=a.neto-a.costo,pctU=a.neto?(util/a.neto)*100:0
                return(
                  <tr key={a.nombre} className="border-b border-brand-border/40 hover:bg-brand-surface/50 transition-colors">
                    <td className="py-3 pr-4 font-medium text-brand-text">{a.nombre}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(a.canales['Mostrador']||0)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(a.canales['Accesorios']||0)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-teal font-semibold">{fmtCOP(a.neto)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(a.costo)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-green-400">{fmtCOP(util)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-brand-subtle">{fmtPct(pctU)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brand-border font-bold">
                <td className="pt-3 pr-4 font-mono text-xs uppercase text-brand-text">Total</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(asesoresData.reduce((s,a)=>s+(a.canales['Mostrador']||0),0))}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(asesoresData.reduce((s,a)=>s+(a.canales['Accesorios']||0),0))}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-teal">{fmtCOP(asesoresData.reduce((s,a)=>s+a.neto,0))}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">{fmtCOP(asesoresData.reduce((s,a)=>s+a.costo,0))}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-green-400">{fmtCOP(asesoresData.reduce((s,a)=>s+(a.neto-a.costo),0))}</td>
                <td className="pt-3 pr-4 font-mono text-xs text-brand-subtle">
                  {(()=>{const n=asesoresData.reduce((s,a)=>s+a.neto,0),u=asesoresData.reduce((s,a)=>s+(a.neto-a.costo),0);return fmtPct(n?u/n*100:0)})()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <p className="text-xs text-brand-subtle font-mono text-center pb-4">
        Datos desde Google Sheets · Actualización automática cada 6 horas · Días hábiles lunes–sábado sin festivos Colombia
      </p>
    </div>
  )
}
