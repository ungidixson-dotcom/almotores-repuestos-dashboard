'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardHome() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/facturacion/canales/subasta')
  }, [router])
  return (
    <div className="p-6">
      <p className="text-brand-subtle font-mono text-sm">Redirigiendo…</p>
    </div>
  )
}
