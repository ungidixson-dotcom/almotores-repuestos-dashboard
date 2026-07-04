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
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-brand-bg text-brand-text font-sans antialiased">{children}</body>
    </html>
  )
}
