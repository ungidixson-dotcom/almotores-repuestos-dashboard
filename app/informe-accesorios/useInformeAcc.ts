'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  InformeResumen, InformeVitrina, InformeAsesor,
  InformeArea, MesDisponible,
} from './types'
import { mesAnterior } from './utils'

// ── Tipos de retorno ──────────────────────────────────────────────────────────

export interface InformeData {
  resumen:              InformeResumen | null
  vitrinas:             InformeVitrina[]
  asesores:             InformeAsesor[]
  areas:                InformeArea[]
  // Comparativos
  resumenMesAnt:        InformeResumen | null
  resumenAnioAnt:       InformeResumen | null
  vitrinasMesAnt:       InformeVitrina[]
  vitrinasAnioAnt:      InformeVitrina[]
  // Meses disponibles para el selector
  meses:                MesDisponible[]
  loading:              boolean
  error:                string | null
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useInformeAcc(anio: number, mes: number): InformeData {
  const [data, setData] = useState<InformeData>({
    resumen: null, vitrinas: [], asesores: [], areas: [],
    resumenMesAnt: null, resumenAnioAnt: null,
    vitrinasMesAnt: [], vitrinasAnioAnt: [],
    meses: [], loading: true, error: null,
  })

  useEffect(() => {
    if (!anio || !mes) return
    let cancelled = false

    async function fetchAll() {
      setData(prev => ({ ...prev, loading: true, error: null }))

      const ant = mesAnterior(anio, mes)

      try {
        const [
          { data: resumen,         error: e1 },
          { data: vitrinas,        error: e2 },
          { data: asesores,        error: e3 },
          { data: areas,           error: e4 },
          { data: resumenMesAnt,   error: e5 },
          { data: vitrinasMesAnt,  error: e6 },
          { data: resumenAnioAnt,  error: e7 },
          { data: vitrinasAnioAnt, error: e8 },
          { data: meses,           error: e9 },
        ] = await Promise.all([
          // Resumen mes actual
          supabase
            .from('v_informe_acc_resumen')
            .select('*')
            .eq('anio', anio).eq('mes_num', mes)
            .single(),

          // Vitrinas mes actual
          supabase
            .from('v_informe_acc_vitrinas')
            .select('*')
            .eq('anio', anio).eq('mes_num', mes)
            .in('vitrina', ['Pasoancho', 'Calle 9', 'Norte', 'Pance']),

          // Asesores mes actual
          supabase
            .from('v_informe_acc_asesores')
            .select('*')
            .eq('anio', anio).eq('mes_num', mes)
            .order('ventas_neto', { ascending: false }),

          // Áreas mes actual
          supabase
            .from('v_informe_acc_areas')
            .select('*')
            .eq('anio', anio).eq('mes_num', mes),

          // Resumen mes anterior
          supabase
            .from('v_informe_acc_resumen')
            .select('*')
            .eq('anio', ant.anio).eq('mes_num', ant.mes)
            .single(),

          // Vitrinas mes anterior
          supabase
            .from('v_informe_acc_vitrinas')
            .select('*')
            .eq('anio', ant.anio).eq('mes_num', ant.mes)
            .in('vitrina', ['Pasoancho', 'Calle 9', 'Norte', 'Pance']),

          // Resumen mismo mes año anterior
          supabase
            .from('v_informe_acc_resumen')
            .select('*')
            .eq('anio', anio - 1).eq('mes_num', mes)
            .single(),

          // Vitrinas mismo mes año anterior
          supabase
            .from('v_informe_acc_vitrinas')
            .select('*')
            .eq('anio', anio - 1).eq('mes_num', mes)
            .in('vitrina', ['Pasoancho', 'Calle 9', 'Norte', 'Pance']),

          // Meses disponibles para el selector
          supabase
            .from('v_informe_acc_resumen')
            .select('anio, mes_num, mes')
            .order('anio',    { ascending: false })
            .order('mes_num', { ascending: false }),
        ])

        const firstError = [e1,e2,e3,e4,e5,e6,e7,e8,e9].find(
          e => e && e.code !== 'PGRST116' // PGRST116 = not found (comparativos vacíos)
        )
        if (firstError) throw new Error(firstError.message)

        if (!cancelled) {
          setData({
            resumen:         resumen         ?? null,
            vitrinas:        vitrinas        ?? [],
            asesores:        asesores        ?? [],
            areas:           areas           ?? [],
            resumenMesAnt:   resumenMesAnt   ?? null,
            resumenAnioAnt:  resumenAnioAnt  ?? null,
            vitrinasMesAnt:  vitrinasMesAnt  ?? [],
            vitrinasAnioAnt: vitrinasAnioAnt ?? [],
            meses:           (meses          ?? []) as MesDisponible[],
            loading: false,
            error:   null,
          })
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setData(prev => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : 'Error desconocido',
          }))
        }
      }
    }

    fetchAll()
    return () => { cancelled = true }
  }, [anio, mes])

  return data
}
