"""
sync_vehiculos.py
Lee el Sheet de Facturación Vehículos desde Google Sheets API
y actualiza comisiones_acc_vehiculos en Supabase.
La sede del asesor se lee de la columna Vitrina del Sheet (col 23).
USO: python sync_vehiculos.py
"""
import os, json, requests, time
from datetime import datetime
from collections import defaultdict

SUPABASE_URL = os.getenv('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY', '')
SHEET_ID     = os.getenv('GOOGLE_SHEET_ID', '1fs779BGplnVfzkkI247kx30clyQ5lxwMUgzSdPbpyRI')
SA_JSON      = os.getenv('GOOGLE_SERVICE_ACCOUNT_JSON', '')

MESES_MAP = {1:'Enero',2:'Febrero',3:'Marzo',4:'Abril',5:'Mayo',6:'Junio',
             7:'Julio',8:'Agosto',9:'Septiembre',10:'Octubre',11:'Noviembre',12:'Diciembre'}

# Sedes válidas — excluye Mayorista, Gerencia, etc.
SEDES_VALIDAS = {'Norte', 'Pasoancho', 'Calle 9', 'Pance'}

def log(msg): print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def get_google_token():
    import time
    try:
        import jwt as pyjwt
    except ImportError:
        import subprocess
        subprocess.run(['pip','install','PyJWT','cryptography','-q'])
        import jwt as pyjwt

    sa = json.loads(SA_JSON)
    now = int(time.time())
    payload = {
        'iss': sa['client_email'],
        'scope': 'https://www.googleapis.com/auth/spreadsheets.readonly',
        'aud': 'https://oauth2.googleapis.com/token',
        'iat': now, 'exp': now + 3600,
    }
    signed = pyjwt.encode(payload, sa['private_key'], algorithm='RS256')
    resp = requests.post('https://oauth2.googleapis.com/token', data={
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion': signed,
    }, timeout=30)
    return resp.json().get('access_token')

def limpiar_nombre(v):
    """Elimina el código numérico al inicio del nombre del asesor."""
    if not v: return ''
    v = v.strip()
    partes = v.split(' ', 1)
    return partes[1].strip() if partes[0].isdigit() and len(partes) > 1 else v

def parse_fecha(v):
    if not v: return None, None
    for sep in ['/', '-']:
        p = v.strip().replace(sep, '/').split('/')
        if len(p) == 3:
            try:
                d, m, a = int(p[0]), int(p[1]), int(p[2])
                if a < 100: a += 2000
                return a, m
            except: pass
    return None, None

def leer_sheet(token):
    """Lee el Sheet completo via Google Sheets API."""
    url = f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/A:X'
    resp = requests.get(url, headers={'Authorization': f'Bearer {token}'}, timeout=30)
    rows = resp.json().get('values', [])
    log(f"Sheet: {len(rows)} filas leídas")
    return rows

def procesar(rows):
    """
    Procesa filas del Sheet.
    Columnas (0-indexed):
      0=T.venta, 1=Concesi, 2=Refer, 3=Bastidor, ...,
      15=UD, 16=Placa, 17=F.placa, 18=F.cierre, 19=Prefijo/num,
      20=Nombre vendedor, 21=Accesorios, 22=Marca Vh, 23=Vitrina
    """
    contador = defaultdict(int)
    sin_sede = set()

    for row in rows[1:]:  # saltar encabezado
        if len(row) < 19: continue

        ud_str   = row[15].strip() if len(row) > 15 else '0'
        fecha    = row[18].strip() if len(row) > 18 else ''
        vendedor = row[20].strip() if len(row) > 20 else ''
        # Leer sede directamente de la columna Vitrina (col 23)
        vitrina  = row[23].strip() if len(row) > 23 else ''

        try: ud = int(ud_str)
        except: continue
        if ud == 0: continue

        anio, mes_num = parse_fecha(fecha)
        if not anio or anio < 2026: continue

        # Validar sede
        if vitrina not in SEDES_VALIDAS:
            if vitrina and vitrina not in ('Mayorista', 'Genrencia', 'Gerencia'):
                sin_sede.add(f"{vendedor} -> {vitrina}")
            continue

        nombre = limpiar_nombre(vendedor)
        if not nombre: continue

        contador[(anio, mes_num, nombre, vitrina)] += ud

    if sin_sede:
        log(f"  Sin sede válida ({len(sin_sede)}): {list(sin_sede)[:5]}")

    return contador

def sincronizar(contador):
    """Borra el mes y reinserta — garantiza datos limpios."""
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }

    meses = set((a, m) for (a, m, _, _) in contador.keys())

    for anio, mes_num in sorted(meses):
        mes = MESES_MAP.get(mes_num, str(mes_num))

        # Borrar mes existente
        del_url = f'{SUPABASE_URL}/rest/v1/comisiones_acc_vehiculos?anio=eq.{anio}&mes_num=eq.{mes_num}'
        requests.delete(del_url, headers=headers, timeout=15)

        # Construir payload
        payload = []
        resumen = defaultdict(int)
        for (a, m, asesor, sede), vehiculos in contador.items():
            if a == anio and m == mes_num and vehiculos > 0:
                payload.append({
                    'anio': anio, 'mes_num': mes_num, 'mes': mes,
                    'sede': sede, 'asesor': asesor, 'vehiculos': vehiculos,
                })
                resumen[sede] += vehiculos

        if payload:
            resp = requests.post(
                f'{SUPABASE_URL}/rest/v1/comisiones_acc_vehiculos',
                headers=headers, json=payload, timeout=30,
            )
            log(f"  {anio} {mes}: {dict(resumen)} → Total {sum(resumen.values())} vehículos")
            if resp.status_code not in [200, 201]:
                log(f"  ERROR: {resp.text[:200]}")
        else:
            log(f"  {anio} {mes}: sin datos positivos")

def main():
    log("Iniciando sync vehículos desde Google Sheets...")

    if not SA_JSON:
        log("ERROR: GOOGLE_SERVICE_ACCOUNT_JSON no configurado")
        return

    token = get_google_token()
    if not token:
        log("ERROR: No se pudo obtener token de Google")
        return
    log("Token Google OK")

    rows = leer_sheet(token)
    contador = procesar(rows)

    meses = set((a, m) for (a, m, _, _) in contador.keys())
    log(f"Meses detectados: {sorted(meses)}")

    sincronizar(contador)
    log("Sync vehículos completado ✅")

if __name__ == '__main__':
    main()
