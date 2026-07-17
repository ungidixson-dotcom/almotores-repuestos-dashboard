import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Almotores KIA · Repuestos',
  description: 'Torre de Control — Subastas & Facturación',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Geist Mono — fuente monoespaciada oficial de Vercel, ideal para cifras financieras */}
        <link
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-brand-bg text-brand-text font-sans antialiased">{children}</body>
    </html>
  )
}
