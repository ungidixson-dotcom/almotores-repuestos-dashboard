// app/api/sync-dropbox/route.ts
// Endpoint que dispara el workflow de GitHub Actions
// POST /api/sync-dropbox
// Body: { sede?: string, mes?: string }

import { NextRequest, NextResponse } from 'next/server'

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN!
const GITHUB_OWNER  = process.env.GITHUB_OWNER || 'ungidixson-dotcom'
const GITHUB_REPO   = process.env.GITHUB_REPO  || 'almotores-repuestos-dashboard'
const WORKFLOW_FILE = 'sync-dropbox.yml'

export async function POST(req: NextRequest) {
  try {
    // Verificar que hay token de GitHub configurado
    if (!GITHUB_TOKEN) {
      return NextResponse.json({ error: 'GITHUB_TOKEN no configurado' }, { status: 500 })
    }

    // Leer parámetros opcionales
    const body = await req.json().catch(() => ({}))
    const { sede, mes } = body

    // Disparar el workflow via GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept':        'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            sede: sede || '',
            mes:  mes  || '',
          },
        }),
      }
    )

    if (response.status === 204) {
      return NextResponse.json({
        ok:      true,
        mensaje: 'Sync iniciado correctamente',
        detalles: {
          sede: sede || 'Todas',
          mes:  mes  || 'Todos',
          hora: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        },
      })
    }

    const errorText = await response.text()
    return NextResponse.json(
      { error: `GitHub API respondió ${response.status}`, detalle: errorText },
      { status: response.status }
    )

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error interno', detalle: error?.message },
      { status: 500 }
    )
  }
}
