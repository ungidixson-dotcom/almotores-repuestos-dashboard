"""
sync_vehiculos.py
Lee el Sheet de Facturación Vehículos desde Google Sheets API
y actualiza comisiones_acc_vehiculos en Supabase.

USO: python sync_vehiculos.py
Requiere: SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON
"""
import os, json, csv, io, requests
from datetime import datetime
from collections import defaultdict

SUPABASE_URL = os.getenv('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY', '')
SHEET_ID     = os.getenv('GOOGLE_SHEET_ID', '1fs779BGplnVfzkkI247kx30clyQ5lxwMUgzSdPbpyRI')
SA_JSON      = os.getenv('GOOGLE_SERVICE_ACCOUNT_JSON', '')

MESES_MAP = {1:'Enero',2:'Febrero',3:'Marzo',4:'Abril',5:'Mayo',6:'Junio',
             7:'Julio',8:'Agosto',9:'Septiembre',10:'Octubre',11:'Noviembre',12:'Diciembre'}

ASESOR_SEDE = {
    'ANDRES FELIPE MONTAÑO BRAVO':'Norte','MORALES ESCOBAR YESIKA STEFANIA':'Norte',
    'DANEIDA LINETH NIEVES DORADO':'Norte','GOMEZ MARTINEZ JORGE MARIO':'Norte',
    'DIANA CAROLINA ZAMBRANO':'Norte','HURTADO OREJUELA SEBASTIAN':'Norte',
    'FARLEY HUMBERTO VELASQUEZ MONCAYO':'Norte','NATALY PEÑA LOZANO':'Norte',
    'CLARET YAZMIN MELENDEZ LOPEZ':'Norte','SALAZAR PEREZ ISRAEL':'Norte',
    'INGRID CAROLINA PANTOJA PANTOJA':'Norte','ACURIA GUERRERO JUAN CAMILO':'Norte',
    'SALINAS RODRIGUEZ PAULA ANDREA':'Norte','BURBANO BUSTAMANTE CARLOS ANDRES':'Norte',
    'GINA MARIA MUÑOZ HERRERA':'Norte','MUÑOZ ORDOÑEZ PAULA ANDREA':'Norte',
    'DIAZ MEJIA MILTON FABIAN':'Norte','VALENCIA PAREDES JOHN FELIPE':'Norte',
    'CATACOLA VILLEGAS NADIA VANESSA':'Pasoancho','CATACORA VILLEGAS NADIA VANESSA':'Pasoancho',
    'CRISTHIAN JARAMILLO IDARRAGA':'Pasoancho','LOPEZ VELEZ MARIA DEL MAR':'Pasoancho',
    'ANA MILENA CORONEL LOZANO':'Pasoancho','WILMER MOTATO MUÑOZ':'Pasoancho',
    'ANDREA SANCHEZ VELEZ':'Pasoancho','ANDRES FELIPE RIOS HORMIGA':'Pasoancho',
    'CARLOS DANIEL VALENCIA CANO':'Pasoancho','CORRALES COTACIO JENNIFER ALEJANDRA':'Pasoancho',
    'MONICA MARIA MILLAN CAICEDO':'Pasoancho','MARQUEZ ARIAS LITHER ESTEVEN':'Pasoancho',
    'LIZETH YURANY PARADA GUTIERREZ':'Pasoancho','RAMIREZ VILLANUEVA JEIBER':'Pasoancho',
    'PEREZ VINASCO WALTHER ENRIQUE':'Pasoancho','PARADA ARIAS MIGUEL ANGEL':'Pasoancho',
    'DIANA MARCELA TORRES OCAMPO':'Pasoancho','GLORIA MARINA MORENO IBARGUEN':'Pasoancho',
    'CABRERA BERNAL LIZANDRO ALFONSO':'Calle 9','MUÑOZ QUICENO VICENTE EMILIO':'Calle 9',
    'DANIELA ZAMORA HOYOS':'Calle 9','ALEJANDRO PARRA PRADO':'Calle 9',
    'MARIN QUINTERO LORENA':'Calle 9','BRYAN LOSADA QUICENO':'Calle 9',
    'JARAMILLO ROJAS NATALY':'Calle 9','DUARTE TRONCOSO JOHN ALEXANDER':'Calle 9',
    'GIRALDO VARGAS LUIS GABRIEL':'Calle 9','SERNA GONZALEZ JUAN FELIPE':'Calle 9',
    'GERARDO PINEDA SANCHEZ':'Calle 9','ESCOBAR DIAZ SAMUEL ANDREI':'Calle 9',
    'CALDAS CARVAJAL OSCAR FERNANDO':'Calle 9','BARRERA ARTUNDUAGA YESSICA YURANY':'Calle 9',
    'LAURA XIMENA TRUJILLO DUSSAN':'Calle 9',
}

def log(msg): print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def get_google_token():
    """Obtiene token de acceso usando Service Account."""
    import time, jwt as pyjwt
    sa = json.loads(SA_JSON)
    now = int(time.time())
    payload = {
        'iss': sa['client_email'],
        'scope': 'https://www.googleapis.com/auth/spreadsheets.readonly',
        'aud': 'https://oauth2.googleapis.com/token',
        'iat': now,
        'exp': now + 3600,
    }
    signed = pyjwt.encode(payload, sa['private_key'], algorithm='RS256')
    resp = requests.post('https://oauth2.googleapis.com/token', data={
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion': signed,
    }, timeout=30)
    return resp.json().get('access_token')

def limpiar_nombre(v):
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
    """Lee el Sheet de vehículos via Google Sheets API."""
    url = f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/A:V'
    resp = requests.get(url, headers={'Authorization': f'Bearer {token}'}, timeout=30)
    data = resp.json()
    rows = data.get('values', [])
    log(f"Sheet: {len(rows)} filas")
    return rows

def procesar(rows):
    """Procesa las filas y devuelve vehículos agrupados por mes/sede/asesor."""
    contador = defaultdict(int)
    for row in rows[1:]:  # saltar header
        if len(row) < 21: continue
        ud_str  = row[15].strip() if len(row) > 15 else '0'
        fecha   = row[18].strip() if len(row) > 18 else ''
        vendedor = row[20].strip() if len(row) > 20 else ''
        try: ud = int(ud_str)
        except: continue
        if ud == 0: continue
        anio, mes_num = parse_fecha(fecha)
        if not anio or anio < 2026: continue
        nombre = limpiar_nombre(vendedor)
        sede = ASESOR_SEDE.get(nombre)
        if not sede: continue
        contador[(anio, mes_num, nombre, sede)] += ud
    return contador

def sincronizar(contador):
    """Upsert en Supabase — borra el mes y reinserta."""
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }

    # Detectar meses con datos
    meses = set((a, m) for (a, m, _, _) in contador.keys())
    
    for anio, mes_num in sorted(meses):
        mes = MESES_MAP[mes_num]
        
        # Borrar mes existente
        del_url = f'{SUPABASE_URL}/rest/v1/comisiones_acc_vehiculos?anio=eq.{anio}&mes_num=eq.{mes_num}'
        requests.delete(del_url, headers=headers, timeout=15)
        
        # Insertar nuevos
        payload = []
        for (a, m, asesor, sede), vehiculos in contador.items():
            if a == anio and m == mes_num and vehiculos > 0:
                payload.append({'anio': anio, 'mes_num': mes_num, 'mes': mes,
                                 'sede': sede, 'asesor': asesor, 'vehiculos': vehiculos})
        
        if payload:
            resp = requests.post(
                f'{SUPABASE_URL}/rest/v1/comisiones_acc_vehiculos',
                headers=headers,
                json=payload,
                timeout=30,
            )
            resumen = defaultdict(int)
            for r in payload: resumen[r['sede']] += r['vehiculos']
            log(f"  {anio} {mes}: {dict(resumen)} → Total {sum(resumen.values())} vehículos")
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
