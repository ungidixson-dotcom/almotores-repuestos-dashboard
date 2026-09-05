'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useInformeAcc } from '../../useInformeAcc'
import {
  fmtM, fmtCOP, fmtNum, fmtPct, calcDelta,
  VITRINA_COLORS, VITRINAS, semaforoVentas, semaforoTicket,
  SEMAFORO_CLS, SEMAFORO_BADGE, VITRINA_BG, MESES,
} from '../../utils'
import {
  KpiCard, VitrinaBadge, DeltaBadge, SemaforoBadge,
  ProgressBar, MesSelector, TablaHeader, RankBadge,
} from '../../components/Shared'
import TabComparativo from '../../components/TabComparativo'
