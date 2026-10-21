'use client'
import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** true si el usuario pidió en su sistema operativo reducir las animaciones. */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    setReduce(media.matches)
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return reduce
}
