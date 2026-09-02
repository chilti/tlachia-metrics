"""
TlachIA Metrics - API Backend (Starlette / ASGI)
api/main.py
Servicios REST no bloqueantes para:
1. Búsqueda y autocompletado de entidades (Tópicos, Fuentes/Revistas, Instituciones, Autores).
2. Construcción, filtrado y vista previa interactiva de corpus bibliográficos en ClickHouse.
3. Orquestación y ejecución en segundo plano del cómputo de 48 indicadores analíticos.
4. Consulta de estado en tiempo real (progreso 0-100% y etapas).
5. Descarga de paquetes .ZIP y catálogo de exportaciones.
"""
import os
import sys
import time
import json
import uuid
import shutil
import logging
import threading
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, List

import httpx
import pandas as pd
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.requests import Request
from starlette.responses import JSONResponse, FileResponse, Response
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

# Rutas del sistema
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from openalex_indicators_engine import TlachIAMetricsEngine
from openalex_indicators_engine.core.config import EXPORTS_DIR, OPENALEX_LOCAL_API, CACHE_DIR
from openalex_indicators_engine.core.corpus_builder import CorpusBuilder

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
logger = logging.getLogger('tlachia_api')

engine = TlachIAMetricsEngine()

# Almacén en memoria de trabajos en segundo plano
JOBS_STORE: Dict[str, Dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()

TEMP_UPLOADS_DIR = ROOT_DIR / 'data' / 'temp_uploads'
TEMP_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


# --- Endpoints de Salud y Estado ---
async def health_check(request: Request):
    return JSONResponse({
        'status': 'healthy',
        'service': 'TlachIA Metrics API',
        'version': '1.0.0',
        'timestamp': datetime.now().isoformat()
    })


# --- Autocompletado y Búsqueda de Entidades ---
async def search_entities(request: Request):
    """
    Busca tópicos, revistas/fuentes, instituciones o autores.
    Usa la API OpenAlex local (puerto 5012) con fallback a ClickHouse.
    """
    entity_type = request.query_params.get('type', 'topics').strip().lower()
    query = request.query_params.get('q', '').strip()
    limit = int(request.query_params.get('limit', 10))

    if not query:
        return JSONResponse({'results': []})

    valid_types = {
        'topics': 'topics',
        'topic': 'topics',
        'sources': 'sources',
        'source': 'sources',
        'institutions': 'institutions',
        'institution': 'institutions',
        'authors': 'authors',
        'author': 'authors',
        'countries': 'countries',
        'country': 'countries',
        'types': 'work_types',
        'type': 'work_types',
        'work_types': 'work_types',
        'work_type': 'work_types'
    }
    normalized_type = valid_types.get(entity_type, 'topics')

    if normalized_type == 'work_types':
        WORK_TYPES_CATALOG = [
            {"id": "article", "name": "Artículo de Revista (Journal Article)", "type_name": "Artículo de Revista", "flag": "📄", "works_count": 191850783},
            {"id": "dataset", "name": "Conjunto de Datos (Dataset)", "type_name": "Conjunto de Datos", "flag": "📊", "works_count": 58720955},
            {"id": "other", "name": "Otro / Misceláneo (Other)", "type_name": "Otro / Misceláneo", "flag": "📁", "works_count": 54804373},
            {"id": "book-chapter", "name": "Capítulo de Libro (Book Chapter)", "type_name": "Capítulo de Libro", "flag": "📑", "works_count": 18024570},
            {"id": "dissertation", "name": "Tesis / Disertación Doctoral (Dissertation)", "type_name": "Tesis / Disertación", "flag": "🎓", "works_count": 7568954},
            {"id": "book", "name": "Libro Completo (Book)", "type_name": "Libro", "flag": "📚", "works_count": 6242037},
            {"id": "preprint", "name": "Preprint (Manuscrito Previo)", "type_name": "Preprint", "flag": "📝", "works_count": 5965389},
            {"id": "review", "name": "Artículo de Revisión (Review Article)", "type_name": "Artículo de Revisión", "flag": "🔍", "works_count": 3008809},
            {"id": "paratext", "name": "Paratexto / Índices / Prefacio (Paratext)", "type_name": "Paratexto", "flag": "📰", "works_count": 2805841},
            {"id": "report", "name": "Informe Técnico / Reporte (Report)", "type_name": "Informe Técnico", "flag": "📋", "works_count": 1547890},
            {"id": "letter", "name": "Carta al Editor / Comunicación (Letter)", "type_name": "Carta / Comunicación", "flag": "✉️", "works_count": 1262759},
            {"id": "peer-review", "name": "Revisión por Pares (Peer Review)", "type_name": "Revisión por Pares", "flag": "✍️", "works_count": 789736},
            {"id": "libguides", "name": "Guía de Biblioteca (LibGuide)", "type_name": "Guía de Biblioteca", "flag": "🏷️", "works_count": 711587},
            {"id": "reference-entry", "name": "Entrada de Referencia / Enciclopedia", "type_name": "Entrada de Referencia", "flag": "📖", "works_count": 648251},
            {"id": "editorial", "name": "Editorial / Nota del Editor", "type_name": "Editorial", "flag": "✒️", "works_count": 602036},
            {"id": "standard", "name": "Norma / Estándar Técnico (Standard)", "type_name": "Estándar Técnico", "flag": "📏", "works_count": 292985},
            {"id": "erratum", "name": "Fe de Erratas / Corrección (Erratum)", "type_name": "Fe de Erratas", "flag": "⚠️", "works_count": 292534},
            {"id": "supplementary-materials", "name": "Material Suplementario", "type_name": "Material Suplementario", "flag": "📎", "works_count": 61363},
            {"id": "retraction", "name": "Retracción de Obra (Retraction)", "type_name": "Retracción", "flag": "🚫", "works_count": 17853},
            {"id": "software", "name": "Software / Código Científico", "type_name": "Software / Código", "flag": "💻", "works_count": 8633},
            {"id": "database", "name": "Base de Datos (Database)", "type_name": "Base de Datos", "flag": "🗄️", "works_count": 1708},
            {"id": "book-section", "name": "Sección de Libro (Book Section)", "type_name": "Sección de Libro", "flag": "📕", "works_count": 1190},
            {"id": "report-component", "name": "Componente de Informe", "type_name": "Componente de Informe", "flag": "🧩", "works_count": 618},
            {"id": "grant", "name": "Subvención / Concesión (Grant)", "type_name": "Subvención", "flag": "💰", "works_count": 102}
        ]
        q_clean = query.strip().lower()
        matches = [
            {
                'id': t['id'],
                'full_id': t['id'],
                'name': f"{t['flag']} {t['name']}",
                'type': 'work_types',
                'type_id': t['id'],
                'type_name': t['type_name'],
                'flag': t['flag'],
                'works_count': t['works_count'],
                'extra': {'works_count': t['works_count']}
            }
            for t in WORK_TYPES_CATALOG
            if q_clean in t['id'].lower() or q_clean in t['name'].lower() or q_clean in t['type_name'].lower()
        ]
        return JSONResponse({'results': matches[:limit]})

    if normalized_type == 'countries':
        COUNTRIES_CATALOG = [
            {"code": "MX", "name": "México", "name_en": "Mexico", "flag": "🇲🇽"},
            {"code": "US", "name": "Estados Unidos", "name_en": "United States", "flag": "🇺🇸"},
            {"code": "ES", "name": "España", "name_en": "Spain", "flag": "🇪🇸"},
            {"code": "CO", "name": "Colombia", "name_en": "Colombia", "flag": "🇨🇴"},
            {"code": "AR", "name": "Argentina", "name_en": "Argentina", "flag": "🇦🇷"},
            {"code": "BR", "name": "Brasil", "name_en": "Brazil", "flag": "🇧🇷"},
            {"code": "CL", "name": "Chile", "name_en": "Chile", "flag": "🇨🇱"},
            {"code": "PE", "name": "Perú", "name_en": "Peru", "flag": "🇵🇪"},
            {"code": "EC", "name": "Ecuador", "name_en": "Ecuador", "flag": "🇪🇨"},
            {"code": "CU", "name": "Cuba", "name_en": "Cuba", "flag": "🇨🇺"},
            {"code": "VE", "name": "Venezuela", "name_en": "Venezuela", "flag": "🇻🇪"},
            {"code": "UY", "name": "Uruguay", "name_en": "Uruguay", "flag": "🇺🇾"},
            {"code": "CR", "name": "Costa Rica", "name_en": "Costa Rica", "flag": "🇨🇷"},
            {"code": "PA", "name": "Panamá", "name_en": "Panama", "flag": "🇵🇦"},
            {"code": "GT", "name": "Guatemala", "name_en": "Guatemala", "flag": "🇬🇹"},
            {"code": "DO", "name": "República Dominicana", "name_en": "Dominican Republic", "flag": "🇩🇴"},
            {"code": "BO", "name": "Bolivia", "name_en": "Bolivia", "flag": "🇧🇴"},
            {"code": "PY", "name": "Paraguay", "name_en": "Paraguay", "flag": "🇵🇾"},
            {"code": "HN", "name": "Honduras", "name_en": "Honduras", "flag": "🇭🇳"},
            {"code": "SV", "name": "El Salvador", "name_en": "El Salvador", "flag": "🇸🇻"},
            {"code": "NI", "name": "Nicaragua", "name_en": "Nicaragua", "flag": "🇳🇮"},
            {"code": "PR", "name": "Puerto Rico", "name_en": "Puerto Rico", "flag": "🇵🇷"},
            {"code": "CA", "name": "Canadá", "name_en": "Canada", "flag": "🇨🇦"},
            {"code": "GB", "name": "Reino Unido", "name_en": "United Kingdom", "flag": "🇬🇧"},
            {"code": "FR", "name": "Francia", "name_en": "France", "flag": "🇫🇷"},
            {"code": "DE", "name": "Alemania", "name_en": "Germany", "flag": "🇩🇪"},
            {"code": "IT", "name": "Italia", "name_en": "Italy", "flag": "🇮🇹"},
            {"code": "PT", "name": "Portugal", "name_en": "Portugal", "flag": "🇵🇹"},
            {"code": "NL", "name": "Países Bajos", "name_en": "Netherlands", "flag": "🇳🇱"},
            {"code": "CH", "name": "Suiza", "name_en": "Switzerland", "flag": "🇨🇭"},
            {"code": "SE", "name": "Suecia", "name_en": "Sweden", "flag": "🇸🇪"},
            {"code": "BE", "name": "Bélgica", "name_en": "Belgium", "flag": "🇧🇪"},
            {"code": "CN", "name": "China", "name_en": "China", "flag": "🇨🇳"},
            {"code": "JP", "name": "Japón", "name_en": "Japan", "flag": "🇯🇵"},
            {"code": "IN", "name": "India", "name_en": "India", "flag": "🇮🇳"},
            {"code": "AU", "name": "Australia", "name_en": "Australia", "flag": "🇦🇺"},
            {"code": "KR", "name": "Corea del Sur", "name_en": "South Korea", "flag": "🇰🇷"},
            {"code": "ZA", "name": "Sudáfrica", "name_en": "South Africa", "flag": "🇿🇦"},
            {"code": "RU", "name": "Rusia", "name_en": "Russia", "flag": "🇷🇺"},
            {"code": "IL", "name": "Israel", "name_en": "Israel", "flag": "🇮🇱"},
            {"code": "SG", "name": "Singapur", "name_en": "Singapore", "flag": "🇸🇬"},
            {"code": "NZ", "name": "Nueva Zelanda", "name_en": "New Zealand", "flag": "🇳🇿"},
            {"code": "NO", "name": "Noruega", "name_en": "Norway", "flag": "🇳🇴"},
            {"code": "DK", "name": "Dinamarca", "name_en": "Denmark", "flag": "🇩🇰"},
            {"code": "FI", "name": "Finlandia", "name_en": "Finland", "flag": "🇫🇮"},
            {"code": "IE", "name": "Irlanda", "name_en": "Ireland", "flag": "🇮🇪"},
            {"code": "AT", "name": "Austria", "name_en": "Austria", "flag": "🇦🇹"},
            {"code": "PL", "name": "Polonia", "name_en": "Poland", "flag": "🇵🇱"}
        ]
        q_clean = query.strip().lower()
        matches = [
            {
                'id': c['code'],
                'full_id': c['code'],
                'name': f"{c['flag']} {c['name']} ({c['code']})",
                'type': 'countries',
                'code': c['code'],
                'flag': c['flag'],
                'country_name': c['name'],
                'extra': {'code': c['code'], 'flag': c['flag']}
            }
            for c in COUNTRIES_CATALOG
            if q_clean == c['code'].lower() or q_clean in c['name'].lower() or q_clean in c['name_en'].lower()
        ]
        return JSONResponse({'results': matches[:limit]})

    # Intento 1: API REST OpenAlex Local
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            url = f"{OPENALEX_LOCAL_API}/{normalized_type}"
            resp = await client.get(url, params={"search": query, "per-page": limit})
            if resp.status_code == 200:
                data = resp.json()
                raw_results = data.get('results', [])
                formatted = []
                for item in raw_results:
                    raw_id = str(item.get('id', '')).split('/')[-1]
                    name = item.get('display_name') or item.get('title') or 'Sin nombre'
                    extra = {}
                    if normalized_type == 'topics':
                        sub = item.get('subfield', {}) or {}
                        fld = item.get('field', {}) or {}
                        extra['subfield'] = sub.get('display_name', '')
                        extra['field'] = fld.get('display_name', '')
                    elif normalized_type == 'sources':
                        extra['issn_l'] = item.get('issn_l', '')
                        extra['type'] = item.get('type', '')
                        extra['is_oa'] = item.get('is_oa', False)
                    elif normalized_type == 'institutions':
                        extra['country_code'] = item.get('country_code', '')
                        extra['ror'] = item.get('ror', '')
                    elif normalized_type == 'authors':
                        affils = item.get('last_known_institutions', []) or []
                        extra['institution'] = affils[0].get('display_name', '') if affils else ''

                    formatted.append({
                        'id': raw_id,
                        'full_id': f"https://openalex.org/{raw_id}",
                        'name': name,
                        'type': normalized_type,
                        'works_count': item.get('works_count', 0),
                        'cited_by_count': item.get('cited_by_count', 0),
                        'extra': extra
                    })
                return JSONResponse({'results': formatted})
    except Exception as e:
        logger.warning(f"Fallback a ClickHouse para búsqueda de entidades ({normalized_type}): {e}")

    # Intento 2: Fallback ClickHouse directo
    try:
        clean_q = query.replace("'", "\\'")
        if normalized_type == 'topics':
            sql = f"SELECT id, topic as name, subfield, field, count(*) as works_count FROM works_flat WHERE positionCaseInsensitiveUTF8(topic, '{clean_q}') > 0 GROUP BY id, topic, subfield, field ORDER BY works_count DESC LIMIT {limit}"
        elif normalized_type == 'sources':
            sql = f"SELECT source_id as id, source_name as name, count(*) as works_count FROM works_flat WHERE positionCaseInsensitiveUTF8(source_name, '{clean_q}') > 0 GROUP BY source_id, source_name ORDER BY works_count DESC LIMIT {limit}"
        elif normalized_type == 'institutions':
            sql = f"SELECT arrayJoin(institution_ids) as id, arrayJoin(institution_names) as name, count(*) as works_count FROM works_flat WHERE positionCaseInsensitiveUTF8(arrayStringConcat(institution_names, ' '), '{clean_q}') > 0 GROUP BY id, name ORDER BY works_count DESC LIMIT {limit}"
        else:
            sql = f"SELECT arrayJoin(author_ids) as id, arrayJoin(author_names) as name, count(*) as works_count FROM works_flat WHERE positionCaseInsensitiveUTF8(arrayStringConcat(author_names, ' '), '{clean_q}') > 0 GROUP BY id, name ORDER BY works_count DESC LIMIT {limit}"

        df = engine.query_engine.query_df(sql)
        results = []
        for _, row in df.iterrows():
            clean_id = str(row.get('id', '')).split('/')[-1]
            results.append({
                'id': clean_id,
                'full_id': f"https://openalex.org/{clean_id}",
                'name': str(row.get('name', 'Sin nombre')),
                'type': normalized_type,
                'works_count': int(row.get('works_count', 0)),
                'extra': {}
            })
        return JSONResponse({'results': results})
    except Exception as ex:
        logger.error(f"Error en búsqueda fallback de entidades: {ex}")
        return JSONResponse({'results': []})


# --- Búsqueda y Vista Previa de Corpus ---
async def preview_corpus(request: Request):
    """
    Recibe filtros de búsqueda y devuelve el conteo total estimado y una muestra paginada de artículos.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    limit = int(body.get('limit', 25))
    offset = int(body.get('offset', 0))

    try:
        preview_data = engine.corpus_builder.preview_from_filters(body, limit=limit, offset=offset)
        return JSONResponse(preview_data)
    except Exception as e:
        logger.error(f"Error al obtener preview del corpus: {e}", exc_info=True)
        return JSONResponse({'error': str(e), 'total': 0, 'results': []}, status_code=500)


async def preview_ids(request: Request):
    """
    Resuelve una lista de DOIs o IDs de OpenAlex y devuelve los artículos encontrados.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    dois = body.get('dois', [])
    work_ids = body.get('work_ids', [])

    try:
        df = None
        if dois:
            df = engine.corpus_builder.from_dois(dois)
        elif work_ids:
            df = engine.corpus_builder.from_openalex_ids(work_ids)
        else:
            return JSONResponse({'total': 0, 'results': []})

        total = len(df) if df is not None else 0
        sample = []
        if df is not None and total > 0:
            df_sub = df.head(50)
            for _, r in df_sub.iterrows():
                sample.append({
                    'id': str(r.get('id', '')),
                    'doi': str(r.get('doi', '')),
                    'title': str(r.get('title', 'Sin título')),
                    'publication_year': int(r.get('publication_year', 0)),
                    'cited_by_count': int(r.get('cited_by_count', 0)),
                    'fwci': float(r.get('fwci', 0.0)),
                    'is_oa': bool(r.get('is_oa', 0)),
                    'oa_status': str(r.get('oa_status', 'closed')),
                    'source_name': str(r.get('source_name', '')),
                    'topic': str(r.get('topic', '')),
                    'authors': r.get('author_names', [])[:4] if isinstance(r.get('author_names'), list) else []
                })

        return JSONResponse({
            'total': total,
            'limit': 50,
            'offset': 0,
            'results': sample
        })
    except Exception as e:
        logger.error(f"Error resolviendo IDs: {e}", exc_info=True)
        return JSONResponse({'error': str(e), 'total': 0, 'results': []}, status_code=500)


# --- Subida de Archivos ---
async def upload_corpus_preview(request: Request):
    """
    Permite subir un archivo JSON, CSV o Parquet para vista previa y procesamiento posterior.
    """
    form = await request.form()
    uploaded_file = form.get('file')
    if not uploaded_file:
        return JSONResponse({'error': 'No se adjuntó ningún archivo.'}, status_code=400)

    filename = uploaded_file.filename or 'uploaded_corpus.json'
    file_id = f"upload_{uuid.uuid4().hex[:10]}"
    ext = Path(filename).suffix.lower()
    saved_path = TEMP_UPLOADS_DIR / f"{file_id}{ext}"

    content = await uploaded_file.read()
    with open(saved_path, 'wb') as f:
        f.write(content)

    try:
        df = engine.load_corpus(saved_path)
        total = len(df) if df is not None else 0
        sample = []
        if df is not None and total > 0:
            df_sub = df.head(25)
            for _, r in df_sub.iterrows():
                sample.append({
                    'id': str(r.get('id', '')),
                    'doi': str(r.get('doi', '')),
                    'title': str(r.get('title', 'Sin título')),
                    'publication_year': int(r.get('publication_year', 0)),
                    'cited_by_count': int(r.get('cited_by_count', 0)),
                    'oa_status': str(r.get('oa_status', 'closed')),
                    'authors': r.get('author_names', [])[:3] if isinstance(r.get('author_names'), list) else []
                })

        return JSONResponse({
            'file_id': file_id,
            'filename': filename,
            'file_path': str(saved_path),
            'total_works': total,
            'sample_results': sample
        })
    except Exception as e:
        if saved_path.exists():
            saved_path.unlink()
        logger.error(f"Error procesando archivo subido: {e}")
        return JSONResponse({'error': f"Error al procesar archivo: {str(e)}"}, status_code=400)


# --- Ejecución de Trabajos de Cálculo en Segundo Plano ---
def _run_metrics_job_worker(job_id: str, payload: Dict[str, Any]):
    """Función de trabajador ejecutada en hilo independiente."""
    with JOBS_LOCK:
        job = JOBS_STORE.get(job_id)
        if not job:
            return
        job['status'] = 'processing'
        job['started_at'] = datetime.now().isoformat()
        job['stage_label'] = 'Extrayendo y estructurando corpus...'
        job['progress'] = 5

    def progress_callback(pct: int, msg: str):
        with JOBS_LOCK:
            if job_id in JOBS_STORE:
                JOBS_STORE[job_id]['progress'] = pct
                JOBS_STORE[job_id]['stage_label'] = msg
                JOBS_STORE[job_id]['updated_at'] = datetime.now().isoformat()

    try:
        source_mode = payload.get('source_mode', 'filters')
        package_name = payload.get('package_name', 'TlachIA_Report').strip().replace(' ', '_')
        if not package_name:
            package_name = f"Corpus_{int(time.time())}"

        df = None
        raw_json_source = None

        if source_mode == 'filters':
            filters = payload.get('filters', {})
            limit_val = filters.get('limit')
            limit = int(limit_val) if limit_val and int(limit_val) > 0 else None
            progress_callback(8, 'Consultando artículos en ClickHouse con filtros aplicados...')
            df = engine.corpus_builder.from_filters(filters, limit=limit)

        elif source_mode == 'ids':
            ids_list = payload.get('ids', [])
            progress_callback(8, f'Consultando {len(ids_list)} identificadores en ClickHouse...')
            df = engine.load_corpus(ids_list)

        elif source_mode == 'upload':
            file_path = payload.get('file_path')
            if not file_path or not Path(file_path).exists():
                raise FileNotFoundError(f"Archivo subido no encontrado: {file_path}")
            progress_callback(8, 'Cargando y normalizando archivo de corpus...')
            df = engine.load_corpus(file_path)
            raw_json_source = file_path

        if df is None or len(df) == 0:
            raise ValueError("No se encontraron artículos para el corpus especificado.")

        with JOBS_LOCK:
            JOBS_STORE[job_id]['total_works'] = len(df)

        # Ejecutar pipeline completo de 16 agregadores y 48 Excel + ZIP
        result = engine.process_and_export_package(
            df=df,
            package_name=package_name,
            export_parquet=True,
            export_json=True,
            raw_json_source=raw_json_source,
            progress_callback=progress_callback
        )

        with JOBS_LOCK:
            JOBS_STORE[job_id]['status'] = 'completed'
            JOBS_STORE[job_id]['progress'] = 100
            JOBS_STORE[job_id]['stage_label'] = '¡Proceso finalizado con éxito!'
            JOBS_STORE[job_id]['completed_at'] = datetime.now().isoformat()
            JOBS_STORE[job_id]['result'] = {
                'package_name': package_name,
                'total_works': len(df),
                'total_excel_files': result.get('total_excel_files', 48),
                'zip_path': result.get('zip_path'),
                'download_url': f"/api/indicators/download/{package_name}",
                'tables_summary': result.get('tables_summary', {})
            }

    except Exception as e:
        logger.error(f"Error en job {job_id}: {e}", exc_info=True)
        with JOBS_LOCK:
            JOBS_STORE[job_id]['status'] = 'failed'
            JOBS_STORE[job_id]['progress'] = 100
            JOBS_STORE[job_id]['stage_label'] = f"Error: {str(e)}"
            JOBS_STORE[job_id]['error'] = str(e)
            JOBS_STORE[job_id]['completed_at'] = datetime.now().isoformat()


async def create_computation_job(request: Request):
    """
    Inicia una tarea de cálculo de métricas en segundo plano.
    """
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({'error': 'Cuerpo de solicitud inválido.'}, status_code=400)

    job_id = f"job_{uuid.uuid4().hex[:12]}"
    package_name = payload.get('package_name', 'TlachIA_Report').strip().replace(' ', '_')
    if not package_name:
        package_name = f"Corpus_{int(time.time())}"

    job_data = {
        'job_id': job_id,
        'package_name': package_name,
        'status': 'queued',
        'progress': 0,
        'stage_label': 'En cola de procesamiento...',
        'created_at': datetime.now().isoformat(),
        'started_at': None,
        'completed_at': None,
        'total_works': 0,
        'result': None,
        'error': None
    }

    with JOBS_LOCK:
        JOBS_STORE[job_id] = job_data

    # Lanzar hilo desacoplado
    thread = threading.Thread(target=_run_metrics_job_worker, args=(job_id, payload), daemon=True)
    thread.start()

    return JSONResponse({
        'job_id': job_id,
        'package_name': package_name,
        'status': 'queued',
        'message': 'Tarea de cálculo iniciada en segundo plano.'
    })


async def get_job_status(request: Request):
    """Consulta el estado, progreso y resultados de una tarea."""
    job_id = request.path_params.get('job_id')
    with JOBS_LOCK:
        job = JOBS_STORE.get(job_id)
        if not job:
            return JSONResponse({'error': 'Tarea no encontrada.'}, status_code=404)
        return JSONResponse(job)


async def list_jobs(request: Request):
    """Lista las tareas recientes."""
    with JOBS_LOCK:
        jobs = list(JOBS_STORE.values())
        jobs.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return JSONResponse({'jobs': jobs[:20]})


# --- Descarga y Exploración de Paquetes Generados ---
async def list_exported_packages(request: Request):
    """Lista todos los paquetes .ZIP generados disponibles en disco."""
    packages = []
    if EXPORTS_DIR.exists():
        for item in EXPORTS_DIR.iterdir():
            if item.is_dir():
                zip_file = item / f"{item.name}.zip"
                json_file = item / f"{item.name}_openalex_works.json"
                excel_dir = item / "excel_reports"
                if zip_file.exists():
                    stat = zip_file.stat()
                    excel_count = len(list(excel_dir.glob('*.xlsx'))) if excel_dir.exists() else 0
                    packages.append({
                        'package_name': item.name,
                        'zip_filename': f"{item.name}.zip",
                        'zip_size_bytes': stat.st_size,
                        'zip_size_mb': round(stat.st_size / (1024 * 1024), 2),
                        'created_at': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        'has_json': json_file.exists(),
                        'excel_files_count': excel_count,
                        'download_url': f"/api/indicators/download/{item.name}"
                    })
    
    packages.sort(key=lambda x: x['created_at'], reverse=True)
    return JSONResponse({'packages': packages})


async def download_indicators_zip(request: Request):
    """Descarga el paquete .ZIP generado."""
    package_name = request.path_params.get('package_name', '').strip()
    zip_path = EXPORTS_DIR / package_name / f"{package_name}.zip"
    
    if not zip_path.exists():
        return JSONResponse({'error': f"Paquete '{package_name}.zip' no encontrado."}, status_code=404)

    return FileResponse(
        str(zip_path),
        media_type='application/zip',
        filename=f"{package_name}.zip",
        headers={'Content-Disposition': f'attachment; filename="{package_name}.zip"'}
    )


async def delete_exported_package(request: Request):
    """Elimina un paquete generado y sus archivos asociados del disco."""
    package_name = request.path_params.get('package_name', '').strip()
    if not package_name or '..' in package_name or '/' in package_name or '\\' in package_name:
        return JSONResponse({'error': 'Nombre de paquete no válido.'}, status_code=400)
    
    target_dir = EXPORTS_DIR / package_name
    if not target_dir.exists():
        return JSONResponse({'error': f"Paquete '{package_name}' no encontrado en disco."}, status_code=404)
    
    try:
        shutil.rmtree(str(target_dir))
        logger.info(f"Paquete eliminado de disco: {package_name}")
        return JSONResponse({
            'success': True,
            'message': f"Paquete '{package_name}' eliminado exitosamente del disco.",
            'package_name': package_name
        })
    except Exception as e:
        logger.error(f"Error eliminando paquete {package_name}: {e}", exc_info=True)
        return JSONResponse({'error': f"Error al eliminar paquete: {str(e)}"}, status_code=500)


# --- Definición de Rutas ASGI ---
routes = [
    Route('/api/health', health_check, methods=['GET']),
    Route('/api/entities/search', search_entities, methods=['GET']),
    Route('/api/corpus/preview', preview_corpus, methods=['POST']),
    Route('/api/corpus/preview-ids', preview_ids, methods=['POST']),
    Route('/api/corpus/upload-preview', upload_corpus_preview, methods=['POST']),
    Route('/api/jobs/create', create_computation_job, methods=['POST']),
    Route('/api/jobs/status/{job_id}', get_job_status, methods=['GET']),
    Route('/api/jobs', list_jobs, methods=['GET']),
    Route('/api/indicators/packages', list_exported_packages, methods=['GET']),
    Route('/api/indicators/packages/{package_name}', delete_exported_package, methods=['DELETE']),
    Route('/api/indicators/delete/{package_name}', delete_exported_package, methods=['DELETE', 'POST']),
    Route('/api/indicators/download/{package_name}', download_indicators_zip, methods=['GET']),
]

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*']
    )
]

app = Starlette(
    debug=True,
    routes=routes,
    middleware=middleware
)
