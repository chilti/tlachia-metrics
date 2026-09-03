"""
api/routers/auth.py - Enrutador de Autenticación ORCID OAuth 2.0 y Doble Verificación
"""
import os
import json
import logging
import urllib.parse
import httpx
from datetime import datetime
from typing import Optional, Dict, Any

from starlette.requests import Request
from starlette.responses import JSONResponse
from dotenv import load_dotenv

from api.db_users import (
    upsert_user,
    get_all_users,
    get_admin_orcids,
    get_valid_user_orcids,
    is_user_authorized,
    is_user_admin
)

load_dotenv()
logger = logging.getLogger('tlachia_auth')

ORCID_CLIENT_ID = os.getenv("ORCID_CLIENT_ID", "")
ORCID_CLIENT_SECRET = os.getenv("ORCID_CLIENT_SECRET", "")
ORCID_REDIRECT_URI = os.getenv("ORCID_REDIRECT_URI", "https://dinamica1.fciencias.unam.mx/infotlachia/")

ORCID_AUTH_URL = "https://orcid.org/oauth/authorize"
ORCID_TOKEN_URL = "https://orcid.org/oauth/token"
ORCID_API_BASE = "https://pub.orcid.org/v3.0"


async def fetch_orcid_affiliation_metadata(orcid_id: str, access_token: Optional[str] = None) -> dict:
    """Consulta la API pública v3.0 de ORCID para extraer la afiliación institucional y país más reciente."""
    headers = {"Accept": "application/json"}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    institution = ""
    country = ""

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            # 1. Consultar resumen de empleos / afiliaciones
            emp_url = f"{ORCID_API_BASE}/{orcid_id}/employments"
            resp = await client.get(emp_url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                groups = data.get("affiliation-group") or []
                if groups:
                    summaries = groups[0].get("summaries") or []
                    if summaries:
                        emp_summary = summaries[0].get("employment-summary") or {}
                        org = emp_summary.get("organization") or {}
                        institution = org.get("name") or ""
                        address = org.get("address") or {}
                        country = address.get("country") or ""

            # 2. Si no hay país en afiliación, consultar sección person
            if not country:
                person_url = f"{ORCID_API_BASE}/{orcid_id}/person"
                p_resp = await client.get(person_url, headers=headers)
                if p_resp.status_code == 200:
                    p_data = p_resp.json()
                    addresses = (p_data.get("addresses") or {}).get("address") or []
                    if addresses:
                        country = (addresses[0].get("country") or {}).get("value") or ""
    except Exception as e:
        logger.warning(f"Error consultando metadatos de ORCID para {orcid_id}: {e}")

    return {
        "institution": institution,
        "country": country
    }


async def get_orcid_auth_url(request: Request):
    """Genera la URL oficial de redirección OAuth 2.0 de ORCID con state='tlachiametrics'."""
    if not ORCID_CLIENT_ID:
        return JSONResponse({'error': 'ORCID_CLIENT_ID no configurado en el servidor.'}, status_code=500)

    redirect_uri = request.query_params.get('redirect_uri') or ORCID_REDIRECT_URI
    state = request.query_params.get('state') or 'tlachiametrics'

    params = {
        'client_id': ORCID_CLIENT_ID,
        'response_type': 'code',
        'scope': '/authenticate',
        'redirect_uri': redirect_uri,
        'state': state
    }
    auth_url = f"{ORCID_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return JSONResponse({
        'auth_url': auth_url,
        'client_id': ORCID_CLIENT_ID,
        'redirect_uri': redirect_uri,
        'state': state
    })


async def exchange_orcid_token(request: Request):
    """
    Intercambia el código de autorización temporal, ejecuta la SEGUNDA VERIFICACIÓN
    contra 'valid_users' y 'admins', y registra al usuario si está autorizado.
    """
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({'error': 'Payload JSON inválido.'}, status_code=400)

    code = payload.get('code', '').strip()
    if not code:
        return JSONResponse({'error': 'Código de autorización faltante.'}, status_code=400)

    final_redirect = payload.get('redirect_uri') or ORCID_REDIRECT_URI
    token_payload = {
        'client_id': ORCID_CLIENT_ID,
        'client_secret': ORCID_CLIENT_SECRET,
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': final_redirect
    }
    headers = {'Accept': 'application/json'}

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(ORCID_TOKEN_URL, data=token_payload, headers=headers)

            if resp.status_code != 200:
                error_text = resp.text
                try:
                    j_err = resp.json()
                    error_text = j_err.get('error_description') or j_err.get('error') or resp.text
                except Exception:
                    pass
                logger.warning(f"Fallo en intercambio de token ORCID ({resp.status_code}): {error_text}")
                return JSONResponse({'error': f"Error al autenticar con ORCID: {error_text}"}, status_code=resp.status_code)

            token_data = resp.json()
            orcid_val = token_data.get('orcid', '').strip()
            name_val = token_data.get('name') or f"Investigador ({orcid_val})"
            token_val = token_data.get('access_token')

            # --- 🛡️ SEGUNDA VERIFICACIÓN: Whitelist de valid_users / admins ---
            authorized = is_user_authorized(orcid_val)
            if not authorized:
                logger.warning(f"[ACCESO DENEGADO] Intento de login de ORCID no autorizado: {orcid_val} ({name_val})")
                return JSONResponse({
                    'authenticated': False,
                    'error': 'unauthorized_user',
                    'message': f"Acceso Denegado: El identificador ORCID '{orcid_val}' ({name_val}) no está dado de alta en la lista de usuarios autorizados de TlachIA Metrics. Contacta al administrador para solicitar acceso.",
                    'orcid': orcid_val,
                    'name': name_val
                }, status_code=403)

            # 1. Extraer país e institución automáticamente vía API de ORCID
            profile_meta = await fetch_orcid_affiliation_metadata(orcid_val, token_val)
            inst_val = profile_meta.get('institution', '')
            country_val = profile_meta.get('country', '')

            # 2. Chequeo de privilegios de administrador
            admin_val = is_user_admin(orcid_val)
            role_val = 'admin' if admin_val else 'user'

            # 3. Persistir en la base de datos de usuarios
            user_record = upsert_user(
                orcid=orcid_val,
                name=name_val,
                institution=inst_val,
                country=country_val,
                role=role_val,
                raw_metadata=json.dumps(token_data)
            )

            logger.info(f"[AUTH EXITOSA] ORCID: {orcid_val} | Nombre: {name_val} | Rol: {role_val} | Logins: {user_record.get('login_count')}")

            return JSONResponse({
                'authenticated': True,
                'orcid': orcid_val,
                'name': name_val,
                'institution': inst_val,
                'country': country_val,
                'role': role_val,
                'is_admin': admin_val,
                'login_count': user_record.get('login_count', 1),
                'access_token': token_val,
                'token_type': token_data.get('token_type', 'bearer'),
                'scope': token_data.get('scope', '/authenticate')
            })

    except Exception as e:
        logger.error(f"Error procesando autenticación ORCID: {e}", exc_info=True)
        return JSONResponse({'error': f"Error en comunicación con ORCID: {str(e)}"}, status_code=500)


async def list_registered_users(request: Request):
    """Retorna el listado consolidado de usuarios para administradores."""
    users = get_all_users()
    admin_set = get_admin_orcids()
    valid_set = get_valid_user_orcids()

    total_admins = sum(1 for u in users if u.get('is_admin'))
    total_logins = sum(u.get('login_count', 1) for u in users)
    distinct_countries = len({u.get('country') for u in users if u.get('country') and u.get('country') != 'No especificado'})

    return JSONResponse({
        'total_registered_users': len(users),
        'total_admins': total_admins,
        'total_logins': total_logins,
        'distinct_countries': distinct_countries,
        'admin_orcids_configured': list(admin_set),
        'valid_orcids_configured': list(valid_set),
        'users': users
    })


async def get_current_user_profile(request: Request):
    """Verifica el estado de autorización para un ORCID enviado por cabecera o sesión."""
    orcid = request.headers.get('X-User-ORCID', '').strip()
    if not orcid:
        return JSONResponse({'authenticated': False, 'authorized': False, 'user': None})

    auth = is_user_authorized(orcid)
    adm = is_user_admin(orcid)
    return JSONResponse({
        'authenticated': True,
        'authorized': auth,
        'is_admin': adm,
        'orcid': orcid
    })
