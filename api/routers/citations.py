"""
TlachIA Metrics - Router de Artículos Citantes
api/routers/citations.py
Motor de identificación y derivación de artículos citantes sin JOINs en ClickHouse.
"""
import os
import json
import logging
from pathlib import Path
from starlette.requests import Request
from starlette.responses import JSONResponse
import clickhouse_connect

from openalex_indicators_engine.core.config import (
    CH_HOST, CH_PORT, CH_USER, CH_PASSWORD, CH_DATABASE, EXPORTS_DIR
)
from api.db_users import save_user_corpus

logger = logging.getLogger("tlachia_metrics.citations")


def _get_ch_client():
    return clickhouse_connect.get_client(
        host=CH_HOST,
        port=CH_PORT,
        username=CH_USER,
        password=CH_PASSWORD,
        database=CH_DATABASE
    )


def _check_auth(request: Request) -> str:
    """Verifica si el usuario está autenticado y devuelve su ORCID."""
    orcid = request.headers.get("X-User-ORCID", "").strip()
    if not orcid:
        orcid = request.query_params.get("orcid", "").strip()
    return orcid


def _normalize_openalex_id(raw_id: str) -> str:
    """Normaliza cualquier identificador OpenAlex al formato canónico URI https://openalex.org/W..."""
    if not raw_id:
        return ""
    s = str(raw_id).strip().rstrip('/')
    suffix = s.split('/')[-1]
    return f"https://openalex.org/{suffix}"


def _extract_entity_work_ids(works: list, entity_type: str = None, entity_name: str = None) -> list:
    """
    Filtra y normaliza los IDs de las obras del corpus que corresponden a una entidad específica.
    Si no se especifica entidad o es 'all'/'corpus', devuelve todos los IDs del corpus normalizados.
    """
    if not works:
        return []

    if not entity_type or not entity_name or entity_type.lower() in ('all', 'corpus', 'none', ''):
        return list(dict.fromkeys([_normalize_openalex_id(w['id']) for w in works if w.get('id')]))

    entity_type = entity_type.lower()
    target_name = entity_name.strip().lower()
    matching_ids = []

    for w in works:
        wid = w.get('id')
        if not wid:
            continue

        matched = False

        if entity_type in ('organizations', 'organizations_colab'):
            inst_names = list(w.get('institution_names') or [])
            if isinstance(inst_names, str):
                inst_names = [inst_names]
            for inst in w.get('institutions', []):
                if isinstance(inst, dict) and inst.get('display_name'):
                    inst_names.append(inst['display_name'])
            for auth in w.get('authorships', []):
                if isinstance(auth, dict):
                    for inst in auth.get('institutions', []):
                        if isinstance(inst, dict) and inst.get('display_name'):
                            inst_names.append(inst['display_name'])
            if any(target_name in str(name).lower() for name in inst_names if name):
                matched = True

        elif entity_type in ('sector_types', 'sectors'):
            sect_names = list(w.get('institution_types') or w.get('sector_types') or [])
            if isinstance(sect_names, str):
                sect_names = [sect_names]
            if any(target_name in str(s).lower() for s in sect_names if s):
                matched = True

        elif entity_type in ('researchers', 'authors'):
            author_names = list(w.get('author_names') or [])
            if isinstance(author_names, str):
                author_names = [author_names]
            for auth in w.get('authorships', []):
                if isinstance(auth, dict):
                    author_obj = auth.get('author', {})
                    if isinstance(author_obj, dict) and author_obj.get('display_name'):
                        author_names.append(author_obj['display_name'])
                    if auth.get('raw_author_name'):
                        author_names.append(auth['raw_author_name'])
            if any(target_name in str(name).lower() for name in author_names if name):
                matched = True

        elif entity_type in ('locations', 'countries'):
            countries = list(w.get('country_codes') or w.get('all_country_codes') or w.get('countries') or [])
            if isinstance(countries, str):
                countries = [countries]
            c_code = w.get('country_code')
            if c_code:
                countries.append(c_code)
            if any(target_name in str(c).lower() for c in countries if c):
                matched = True

        elif entity_type in ('locations_subnational', 'subnational'):
            sub_locs = list(w.get('locations_subnational') or w.get('subnational') or [])
            if isinstance(sub_locs, str):
                sub_locs = [sub_locs]
            if any(target_name in str(c).lower() for c in sub_locs if c):
                matched = True

        elif entity_type in ('publication_sources', 'sources'):
            source_name = w.get('source_name') or ''
            prim_loc = w.get('primary_location') or {}
            if isinstance(prim_loc, dict):
                source_obj = prim_loc.get('source') or {}
                if isinstance(source_obj, dict) and source_obj.get('display_name'):
                    source_name = source_obj['display_name']
            if target_name in str(source_name).lower():
                matched = True

        elif entity_type in ('funding_agencies', 'funders'):
            funder_names = list(w.get('funder_names') or [])
            if isinstance(funder_names, str):
                funder_names = [funder_names]
            for grant in w.get('grants', []) or w.get('awards', []):
                if isinstance(grant, dict) and grant.get('funder_display_name'):
                    funder_names.append(grant['funder_display_name'])
            for f in w.get('funders', []):
                if isinstance(f, dict) and f.get('display_name'):
                    funder_names.append(f['display_name'])
            if any(target_name in str(fn).lower() for fn in funder_names if fn):
                matched = True

        elif entity_type in ('research_areas_domain', 'research_areas_macro_topics', 'domains', 'domain'):
            dom_name = str(w.get('domain') or w.get('domain_name') or '').strip().lower()
            if target_name in dom_name:
                matched = True

        elif entity_type in ('research_areas_field', 'research_areas_meso_topics', 'fields', 'field'):
            field_name = str(w.get('field') or w.get('field_name') or '').strip().lower()
            if target_name in field_name:
                matched = True

        elif entity_type in ('research_areas_subfield', 'subfields', 'subfield', 'esi', 'research_areas_esi'):
            subfield_name = str(w.get('subfield') or w.get('subfield_name') or '').strip().lower()
            if target_name in subfield_name:
                matched = True

        elif entity_type in ('research_areas_topic', 'research_areas_micro_topics', 'topics', 'topic'):
            topic_name = str(w.get('topic') or w.get('topic_name') or '').strip().lower()
            topic_names = [topic_name] if topic_name else []
            all_top = w.get('topics') or w.get('all_topics') or []
            if isinstance(all_top, list):
                for t in all_top:
                    if isinstance(t, str):
                        topic_names.append(t.lower())
                    elif isinstance(t, dict) and t.get('display_name'):
                        topic_names.append(str(t['display_name']).lower())
            if any(target_name in tn for tn in topic_names if tn):
                matched = True

        elif entity_type in ('research_areas_sdg', 'sdg', 'sdgs'):
            sdg_vals = list(w.get('sdgs') or w.get('sdg_ids') or w.get('sdg') or [])
            if isinstance(sdg_vals, str):
                sdg_vals = [sdg_vals]
            if any(target_name in str(s).lower() for s in sdg_vals if s):
                matched = True

        elif entity_type == 'concepts':
            concepts = list(w.get('concepts') or [])
            if isinstance(concepts, str):
                concepts = [concepts]
            for c in concepts:
                c_name = c if isinstance(c, str) else (c.get('display_name') if isinstance(c, dict) else str(c))
                if target_name in str(c_name).lower():
                    matched = True
                    break

        elif entity_type == 'keywords':
            keywords = list(w.get('keywords') or [])
            if isinstance(keywords, str):
                keywords = [keywords]
            for k in keywords:
                k_name = k if isinstance(k, str) else (k.get('display_name') or k.get('keyword') if isinstance(k, dict) else str(k))
                if target_name in str(k_name).lower():
                    matched = True
                    break

        else:
            # Fallback general sobre el JSON serializado
            if target_name in json.dumps(w, ensure_ascii=False).lower():
                matched = True

        if matched:
            matching_ids.append(_normalize_openalex_id(wid))

    return list(dict.fromkeys(matching_ids))


async def get_citing_works_endpoint(request: Request):
    """
    Endpoint principal para obtener las obras citantes de una entidad o corpus.
    Ejecuta el pipeline cienciométrico en 2 etapas en ClickHouse sin JOINs.
    """
    auth_orcid = _check_auth(request)
    if not auth_orcid:
        return JSONResponse({'error': 'Acceso no autorizado. Inicia sesión con ORCID.'}, status_code=401)

    package_name = request.path_params.get('package_name', '').strip()
    entity_type = request.query_params.get('entity_type', '').strip().lower()
    entity_name = request.query_params.get('entity_name', '').strip()
    page = max(1, int(request.query_params.get('page', 1)))
    limit = max(5, min(200, int(request.query_params.get('limit', 25))))
    sort_by = request.query_params.get('sort_by', 'cited_by_count').strip()
    sort_order = request.query_params.get('sort_order', 'desc').strip().lower()
    search_q = request.query_params.get('q', '').strip()

    target_dir = EXPORTS_DIR / package_name
    if not target_dir.exists():
        return JSONResponse({'error': f"Paquete '{package_name}' no encontrado."}, status_code=404)

    # 1. Cargar obras del corpus desde JSON
    json_path = target_dir / f"{package_name}_openalex_works.json"
    corpus_works = []
    if json_path.exists():
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                corpus_works = json.load(f)
        except Exception as e:
            logger.warning(f"No se pudo leer JSON del corpus {package_name}: {e}")

    if not corpus_works:
        return JSONResponse({'error': f"Dataset de obras no encontrado para el paquete '{package_name}'."}, status_code=404)

    cited_work_ids = _extract_entity_work_ids(corpus_works, entity_type, entity_name)

    if not cited_work_ids:
        return JSONResponse({
            'package_name': package_name,
            'entity_type': entity_type,
            'entity_name': entity_name,
            'total_cited_works': 0,
            'total_citations_count': 0,
            'unique_citing_works_count': 0,
            'page': page,
            'limit': limit,
            'total_pages': 1,
            'citing_works': [],
            'all_citing_ids': []
        })

    # 2. Consultar citantes en rag.work_citations en lotes (Sin JOINs)
    client = _get_ch_client()
    BATCH_SIZE = 2000
    citing_edges = []
    
    for i in range(0, len(cited_work_ids), BATCH_SIZE):
        batch = cited_work_ids[i:i + BATCH_SIZE]
        q_str = f"""
            SELECT DISTINCT citing_work_id, citing_publication_year, cited_work_id
            FROM rag.work_citations
            WHERE cited_work_id IN {tuple(batch) if len(batch) > 1 else f"('{batch[0]}')"}
        """
        rows = client.query(q_str).result_rows
        citing_edges.extend(rows)

    total_citations_count = len(citing_edges)
    unique_citing_ids = list(dict.fromkeys([r[0] for r in citing_edges]))
    unique_citing_count = len(unique_citing_ids)

    if not unique_citing_ids:
        return JSONResponse({
            'package_name': package_name,
            'entity_type': entity_type,
            'entity_name': entity_name,
            'total_cited_works': len(cited_work_ids),
            'total_citations_count': 0,
            'unique_citing_works_count': 0,
            'page': page,
            'limit': limit,
            'total_pages': 1,
            'citing_works': [],
            'all_citing_ids': []
        })

    # 3. Consultar metadatos en rag.works_flat para los citantes únicos
    META_BATCH_SIZE = 2000
    citing_metadata = []
    
    for i in range(0, len(unique_citing_ids), META_BATCH_SIZE):
        batch_ids = unique_citing_ids[i:i + META_BATCH_SIZE]
        q_meta = f"""
            SELECT 
                id, doi, title, publication_year, type, 
                author_names, institution_names, cited_by_count, 
                fwci, percentile, is_oa, oa_status, 
                domain_name, field_name, subfield_name
            FROM rag.works_flat
            WHERE id IN {tuple(batch_ids) if len(batch_ids) > 1 else f"('{batch_ids[0]}')"}
        """
        meta_rows = client.query(q_meta).result_rows
        for r in meta_rows:
            citing_metadata.append({
                'id': r[0],
                'doi': r[1] or '',
                'title': r[2] or 'Sin título registrado',
                'publication_year': r[3],
                'type': r[4] or 'article',
                'author_names': list(r[5]) if r[5] else [],
                'institution_names': list(r[6]) if r[6] else [],
                'cited_by_count': int(r[7] or 0),
                'fwci': round(float(r[8] or 0), 2),
                'percentile': round(float(r[9] or 0), 1),
                'is_oa': bool(r[10]),
                'oa_status': r[11] or 'closed',
                'domain_name': r[12] or '',
                'field_name': r[13] or '',
                'subfield_name': r[14] or ''
            })

    # 4. Filtrar por búsqueda textual si aplica
    if search_q:
        sq = search_q.lower()
        citing_metadata = [
            w for w in citing_metadata
            if sq in w['title'].lower()
            or any(sq in str(a).lower() for a in w['author_names'])
            or any(sq in str(inst).lower() for inst in w['institution_names'])
            or sq in w['field_name'].lower()
            or sq in w['doi'].lower()
        ]

    # 5. Ordenamiento dinámico
    reverse_sort = (sort_order == 'desc')
    if sort_by in ('cited_by_count', 'publication_year', 'fwci', 'percentile'):
        citing_metadata.sort(key=lambda x: x.get(sort_by) or 0, reverse=reverse_sort)
    elif sort_by in ('title', 'type', 'oa_status'):
        citing_metadata.sort(key=lambda x: str(x.get(sort_by) or '').lower(), reverse=reverse_sort)

    # 6. Paginación
    total_matching = len(citing_metadata)
    total_pages = (total_matching + limit - 1) // limit if limit > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    page_data = citing_metadata[start_idx:end_idx]

    return JSONResponse({
        'package_name': package_name,
        'entity_type': entity_type,
        'entity_name': entity_name,
        'total_cited_works': len(cited_work_ids),
        'total_citations_count': total_citations_count,
        'unique_citing_works_count': unique_citing_count,
        'filtered_count': total_matching,
        'page': page,
        'limit': limit,
        'total_pages': total_pages,
        'citing_works': page_data,
        'all_citing_ids': unique_citing_ids
    })


async def derive_citing_corpus_endpoint(request: Request):
    """
    Toma los artículos citantes de una entidad o corpus y los guarda automáticamente
    como un nuevo corpus de usuario en SQLite para posterior cálculo de indicadores.
    """
    auth_orcid = _check_auth(request)
    if not auth_orcid:
        return JSONResponse({'error': 'Acceso no autorizado. Inicia sesión con ORCID.'}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        body = {}

    package_name = body.get('package_name', '').strip()
    work_id = body.get('work_id', '').strip()
    entity_type = body.get('entity_type', '').strip()
    entity_name = body.get('entity_name', '').strip()
    new_corpus_name = body.get('corpus_name', '').strip()
    description = body.get('description', '').strip()
    user_name = body.get('user_name') or auth_orcid
    citing_ids = body.get('citing_ids') or []

    if not new_corpus_name:
        entity_label = f" ({entity_name})" if entity_name else ""
        prefix = f"Citantes de {package_name}" if package_name else "Citantes de Artículo"
        new_corpus_name = f"{prefix}{entity_label}"

    # Si no se enviaron los IDs directamente, calcularlos
    if not citing_ids:
        client = _get_ch_client()
        if work_id:
            norm_id = _normalize_openalex_id(work_id)
            q_str = f"SELECT DISTINCT citing_work_id FROM rag.work_citations WHERE cited_work_id = '{norm_id}'"
            rows = client.query(q_str).result_rows
            citing_ids = list(dict.fromkeys([r[0] for r in rows]))
        elif package_name:
            target_dir = EXPORTS_DIR / package_name
            json_path = target_dir / f"{package_name}_openalex_works.json"
            if not json_path.exists():
                return JSONResponse({'error': f"Paquete '{package_name}' no encontrado."}, status_code=404)

            with open(json_path, 'r', encoding='utf-8') as f:
                corpus_works = json.load(f)

            cited_work_ids = _extract_entity_work_ids(corpus_works, entity_type, entity_name)
            if not cited_work_ids:
                return JSONResponse({'error': 'No se encontraron obras citadas para esta entidad.'}, status_code=400)

            BATCH_SIZE = 2000
            citing_edges = []
            for i in range(0, len(cited_work_ids), BATCH_SIZE):
                batch = cited_work_ids[i:i + BATCH_SIZE]
                q_str = f"""
                    SELECT DISTINCT citing_work_id
                    FROM rag.work_citations
                    WHERE cited_work_id IN {tuple(batch) if len(batch) > 1 else f"('{batch[0]}')"}
                """
                rows = client.query(q_str).result_rows
                citing_edges.extend(rows)

            citing_ids = list(dict.fromkeys([r[0] for r in citing_edges]))

    if not citing_ids:
        return JSONResponse({'error': 'No se encontraron artículos citantes para crear el nuevo corpus.'}, status_code=400)

    if not description:
        description = f"Corpus derivado de los artículos citantes ({len(citing_ids):,} obras citantes únicas)."

    # Persistir en SQLite con metadatos de linaje
    saved = save_user_corpus(
        owner_orcid=auth_orcid,
        owner_name=user_name,
        corpus_name=new_corpus_name,
        description=description,
        source_mode='ids',
        filters={},
        ids_list=citing_ids,
        total_works_estimated=len(citing_ids),
        parent_corpus_id=package_name or work_id or None,
        lineage_type='citing_impact'
    )

    return JSONResponse({
        'success': True,
        'message': f"Nuevo corpus '{new_corpus_name}' creado con éxito con {len(citing_ids):,} artículos citantes.",
        'corpus': saved
    })


async def get_single_work_citing_endpoint(request: Request):
    """
    Consulta directa en ClickHouse de los artículos citantes para un paper individual (por su ID OpenAlex).
    No requiere un paquete exportado previo; responde en < 15ms.
    """
    auth_orcid = _check_auth(request)
    if not auth_orcid:
        return JSONResponse({'error': 'Acceso no autorizado. Inicia sesión con ORCID.'}, status_code=401)

    raw_work_id = request.path_params.get('work_id', '').strip() or request.query_params.get('work_id', '').strip()
    work_title = request.query_params.get('work_title', '').strip()
    page = max(1, int(request.query_params.get('page', 1)))
    limit = max(5, min(200, int(request.query_params.get('limit', 25))))
    sort_by = request.query_params.get('sort_by', 'cited_by_count').strip()
    sort_order = request.query_params.get('sort_order', 'desc').strip().lower()
    search_q = request.query_params.get('q', '').strip()

    if not raw_work_id:
        return JSONResponse({'error': 'work_id es requerido.'}, status_code=400)

    norm_id = _normalize_openalex_id(raw_work_id)
    client = _get_ch_client()

    # 1. Consultar aristas de citación en ClickHouse (sin JOINs)
    q_str = f"""
        SELECT DISTINCT citing_work_id, citing_publication_year, cited_work_id
        FROM rag.work_citations
        WHERE cited_work_id = '{norm_id}'
    """
    rows = client.query(q_str).result_rows

    total_citations_count = len(rows)
    unique_citing_ids = list(dict.fromkeys([r[0] for r in rows]))
    unique_citing_count = len(unique_citing_ids)

    if not unique_citing_ids:
        return JSONResponse({
            'work_id': norm_id,
            'work_title': work_title or 'Artículo',
            'package_name': '',
            'entity_type': 'work',
            'entity_name': work_title or norm_id,
            'total_cited_works': 1,
            'total_citations_count': 0,
            'unique_citing_works_count': 0,
            'filtered_count': 0,
            'page': page,
            'limit': limit,
            'total_pages': 1,
            'citing_works': [],
            'all_citing_ids': []
        })

    # 2. Consultar metadatos en rag.works_flat para los citantes únicos
    META_BATCH_SIZE = 2000
    citing_metadata = []
    
    for i in range(0, len(unique_citing_ids), META_BATCH_SIZE):
        batch_ids = unique_citing_ids[i:i + META_BATCH_SIZE]
        q_meta = f"""
            SELECT 
                id, doi, title, publication_year, type, 
                author_names, institution_names, cited_by_count, 
                fwci, percentile, is_oa, oa_status, 
                domain_name, field_name, subfield_name
            FROM rag.works_flat
            WHERE id IN {tuple(batch_ids) if len(batch_ids) > 1 else f"('{batch_ids[0]}')"}
        """
        meta_rows = client.query(q_meta).result_rows
        for r in meta_rows:
            citing_metadata.append({
                'id': r[0],
                'doi': r[1] or '',
                'title': r[2] or 'Sin título registrado',
                'publication_year': r[3],
                'type': r[4] or 'article',
                'author_names': list(r[5]) if r[5] else [],
                'institution_names': list(r[6]) if r[6] else [],
                'cited_by_count': int(r[7] or 0),
                'fwci': round(float(r[8] or 0), 2),
                'percentile': round(float(r[9] or 0), 1),
                'is_oa': bool(r[10]),
                'oa_status': r[11] or 'closed',
                'domain_name': r[12] or '',
                'field_name': r[13] or '',
                'subfield_name': r[14] or ''
            })

    # 3. Filtrar por búsqueda textual si aplica
    if search_q:
        sq = search_q.lower()
        citing_metadata = [
            w for w in citing_metadata
            if sq in w['title'].lower()
            or any(sq in str(a).lower() for a in w['author_names'])
            or any(sq in str(inst).lower() for inst in w['institution_names'])
            or sq in w['field_name'].lower()
            or sq in w['doi'].lower()
        ]

    # 4. Ordenamiento dinámico
    reverse_sort = (sort_order == 'desc')
    if sort_by in ('cited_by_count', 'publication_year', 'fwci', 'percentile'):
        citing_metadata.sort(key=lambda x: x.get(sort_by) or 0, reverse=reverse_sort)
    elif sort_by in ('title', 'type', 'oa_status'):
        citing_metadata.sort(key=lambda x: str(x.get(sort_by) or '').lower(), reverse=reverse_sort)

    # 5. Paginación
    total_matching = len(citing_metadata)
    total_pages = (total_matching + limit - 1) // limit if limit > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    page_data = citing_metadata[start_idx:end_idx]

    return JSONResponse({
        'work_id': norm_id,
        'work_title': work_title or 'Artículo',
        'package_name': '',
        'entity_type': 'work',
        'entity_name': work_title or norm_id,
        'total_cited_works': 1,
        'total_citations_count': total_citations_count,
        'unique_citing_works_count': unique_citing_count,
        'filtered_count': total_matching,
        'page': page,
        'limit': limit,
        'total_pages': total_pages,
        'citing_works': page_data,
        'all_citing_ids': unique_citing_ids
    })


# ==============================================================================
# SECCIÓN 2: BASE INTELECTUAL (REFERENCIAS BIBLIOGRÁFICAS / ARTÍCULOS CITADOS)
# ==============================================================================

async def get_referenced_works_endpoint(request: Request):
    """
    Obtiene las referencias bibliográficas únicas (Base Intelectual) para un paquete de indicadores
    o una entidad específica dentro del paquete.
    """
    auth_orcid = _check_auth(request)
    if not auth_orcid:
        return JSONResponse({'error': 'Acceso no autorizado. Inicia sesión con ORCID.'}, status_code=401)

    package_name = request.path_params.get('package_name', '').strip()
    entity_type = request.query_params.get('entity_type', '').strip()
    entity_name = request.query_params.get('entity_name', '').strip()
    page = max(1, int(request.query_params.get('page', 1)))
    limit = max(5, min(200, int(request.query_params.get('limit', 25))))
    sort_by = request.query_params.get('sort_by', 'cited_by_count').strip()
    sort_order = request.query_params.get('sort_order', 'desc').strip().lower()
    search_q = request.query_params.get('q', '').strip()

    pkg_dir = EXPORTS_DIR / package_name
    if not pkg_dir.exists():
        return JSONResponse({'error': f'Paquete {package_name} no encontrado.'}, status_code=404)

    works_json_path = pkg_dir / f"{package_name}_openalex_works.json"
    if not works_json_path.exists():
        return JSONResponse({'error': f'Metadatos de obras no encontrados en {package_name}.'}, status_code=404)

    try:
        with open(works_json_path, 'r', encoding='utf-8') as f:
            corpus_works = json.load(f)
    except Exception as e:
        logger.error(f"Error leyendo obras del corpus {package_name}: {e}")
        return JSONResponse({'error': f'Error leyendo obras del corpus: {str(e)}'}, status_code=500)

    # Filtrar obras del corpus que pertenecen a la entidad solicitada
    matching_work_ids_set = set(_extract_entity_work_ids(corpus_works, entity_type, entity_name))
    
    # Extraer referenced_works de las obras coincidentes
    all_ref_ids_ordered = []
    seen_refs = set()
    total_refs_count = 0
    total_matching_works = 0

    for w in corpus_works:
        norm_wid = _normalize_openalex_id(w.get('id') or '')
        if not matching_work_ids_set or norm_wid in matching_work_ids_set:
            total_matching_works += 1
            refs = w.get('referenced_works') or []
            total_refs_count += len(refs)
            for r in refs:
                if r:
                    norm_ref = _normalize_openalex_id(r)
                    if norm_ref not in seen_refs:
                        seen_refs.add(norm_ref)
                        all_ref_ids_ordered.append(norm_ref)

    unique_ref_count = len(all_ref_ids_ordered)

    if not all_ref_ids_ordered:
        return JSONResponse({
            'package_name': package_name,
            'entity_type': entity_type,
            'entity_name': entity_name,
            'total_referencing_works': total_matching_works,
            'total_references_count': 0,
            'unique_referenced_works_count': 0,
            'filtered_count': 0,
            'page': page,
            'limit': limit,
            'total_pages': 1,
            'referenced_works': [],
            'all_referenced_ids': []
        })

    client = _get_ch_client()
    META_BATCH_SIZE = 2000
    ref_metadata = []

    for i in range(0, len(all_ref_ids_ordered), META_BATCH_SIZE):
        batch_ids = all_ref_ids_ordered[i:i + META_BATCH_SIZE]
        q_meta = f"""
            SELECT 
                id, doi, title, publication_year, type, 
                author_names, institution_names, cited_by_count, 
                fwci, percentile, is_oa, oa_status, 
                domain_name, field_name, subfield_name
            FROM rag.works_flat
            WHERE id IN {tuple(batch_ids) if len(batch_ids) > 1 else f"('{batch_ids[0]}')"}
        """
        meta_rows = client.query(q_meta).result_rows
        for r in meta_rows:
            ref_metadata.append({
                'id': r[0],
                'doi': r[1] or '',
                'title': r[2] or 'Sin título registrado',
                'publication_year': r[3],
                'type': r[4] or 'article',
                'author_names': list(r[5]) if r[5] else [],
                'institution_names': list(r[6]) if r[6] else [],
                'cited_by_count': int(r[7] or 0),
                'fwci': round(float(r[8] or 0), 2),
                'percentile': round(float(r[9] or 0), 1),
                'is_oa': bool(r[10]),
                'oa_status': r[11] or 'closed',
                'domain_name': r[12] or '',
                'field_name': r[13] or '',
                'subfield_name': r[14] or ''
            })

    # Filtrar por búsqueda textual si aplica
    if search_q:
        sq = search_q.lower()
        ref_metadata = [
            w for w in ref_metadata
            if sq in w['title'].lower()
            or any(sq in str(a).lower() for a in w['author_names'])
            or any(sq in str(inst).lower() for inst in w['institution_names'])
            or sq in w['field_name'].lower()
            or sq in w['doi'].lower()
        ]

    # Ordenamiento
    reverse_sort = (sort_order == 'desc')
    if sort_by in ('cited_by_count', 'publication_year', 'fwci', 'percentile'):
        ref_metadata.sort(key=lambda x: x.get(sort_by) or 0, reverse=reverse_sort)
    elif sort_by in ('title', 'type', 'oa_status'):
        ref_metadata.sort(key=lambda x: str(x.get(sort_by) or '').lower(), reverse=reverse_sort)

    # Paginación
    total_matching = len(ref_metadata)
    total_pages = (total_matching + limit - 1) // limit if limit > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    page_data = ref_metadata[start_idx:end_idx]

    return JSONResponse({
        'package_name': package_name,
        'entity_type': entity_type,
        'entity_name': entity_name,
        'total_referencing_works': total_matching_works,
        'total_references_count': total_refs_count,
        'unique_referenced_works_count': unique_ref_count,
        'filtered_count': total_matching,
        'page': page,
        'limit': limit,
        'total_pages': total_pages,
        'referenced_works': page_data,
        'all_referenced_ids': all_ref_ids_ordered
    })


async def get_single_work_references_endpoint(request: Request):
    """
    Obtiene las referencias bibliográficas directas de un artículo individual (por su ID OpenAlex).
    Responde en < 15ms directamente desde ClickHouse.
    """
    auth_orcid = _check_auth(request)
    if not auth_orcid:
        return JSONResponse({'error': 'Acceso no autorizado. Inicia sesión con ORCID.'}, status_code=401)

    raw_work_id = request.path_params.get('work_id', '').strip() or request.query_params.get('work_id', '').strip()
    work_title = request.query_params.get('work_title', '').strip()
    page = max(1, int(request.query_params.get('page', 1)))
    limit = max(5, min(200, int(request.query_params.get('limit', 25))))
    sort_by = request.query_params.get('sort_by', 'cited_by_count').strip()
    sort_order = request.query_params.get('sort_order', 'desc').strip().lower()
    search_q = request.query_params.get('q', '').strip()

    if not raw_work_id:
        return JSONResponse({'error': 'work_id es requerido.'}, status_code=400)

    norm_id = _normalize_openalex_id(raw_work_id)
    client = _get_ch_client()

    # 1. Obtener los referenced_works del artículo
    q_work = f"SELECT id, title, referenced_works FROM rag.works_flat WHERE id = '{norm_id}'"
    work_rows = client.query(q_work).result_rows
    if not work_rows:
        return JSONResponse({
            'work_id': norm_id,
            'work_title': work_title or 'Artículo',
            'package_name': '',
            'entity_type': 'work',
            'entity_name': work_title or norm_id,
            'total_referencing_works': 1,
            'total_references_count': 0,
            'unique_referenced_works_count': 0,
            'filtered_count': 0,
            'page': page,
            'limit': limit,
            'total_pages': 1,
            'referenced_works': [],
            'all_referenced_ids': []
        })

    title_from_db = work_rows[0][1] or work_title
    raw_refs = list(work_rows[0][2] or [])
    norm_ref_ids = list(dict.fromkeys([_normalize_openalex_id(r) for r in raw_refs if r]))
    total_refs_count = len(raw_refs)
    unique_ref_count = len(norm_ref_ids)

    if not norm_ref_ids:
        return JSONResponse({
            'work_id': norm_id,
            'work_title': title_from_db or norm_id,
            'package_name': '',
            'entity_type': 'work',
            'entity_name': title_from_db or norm_id,
            'total_referencing_works': 1,
            'total_references_count': 0,
            'unique_referenced_works_count': 0,
            'filtered_count': 0,
            'page': page,
            'limit': limit,
            'total_pages': 1,
            'referenced_works': [],
            'all_referenced_ids': []
        })

    # 2. Consultar metadatos en rag.works_flat
    META_BATCH_SIZE = 2000
    ref_metadata = []

    for i in range(0, len(norm_ref_ids), META_BATCH_SIZE):
        batch_ids = norm_ref_ids[i:i + META_BATCH_SIZE]
        q_meta = f"""
            SELECT 
                id, doi, title, publication_year, type, 
                author_names, institution_names, cited_by_count, 
                fwci, percentile, is_oa, oa_status, 
                domain_name, field_name, subfield_name
            FROM rag.works_flat
            WHERE id IN {tuple(batch_ids) if len(batch_ids) > 1 else f"('{batch_ids[0]}')"}
        """
        meta_rows = client.query(q_meta).result_rows
        for r in meta_rows:
            ref_metadata.append({
                'id': r[0],
                'doi': r[1] or '',
                'title': r[2] or 'Sin título registrado',
                'publication_year': r[3],
                'type': r[4] or 'article',
                'author_names': list(r[5]) if r[5] else [],
                'institution_names': list(r[6]) if r[6] else [],
                'cited_by_count': int(r[7] or 0),
                'fwci': round(float(r[8] or 0), 2),
                'percentile': round(float(r[9] or 0), 1),
                'is_oa': bool(r[10]),
                'oa_status': r[11] or 'closed',
                'domain_name': r[12] or '',
                'field_name': r[13] or '',
                'subfield_name': r[14] or ''
            })

    # 3. Filtrar por búsqueda textual si aplica
    if search_q:
        sq = search_q.lower()
        ref_metadata = [
            w for w in ref_metadata
            if sq in w['title'].lower()
            or any(sq in str(a).lower() for a in w['author_names'])
            or any(sq in str(inst).lower() for inst in w['institution_names'])
            or sq in w['field_name'].lower()
            or sq in w['doi'].lower()
        ]

    # 4. Ordenamiento
    reverse_sort = (sort_order == 'desc')
    if sort_by in ('cited_by_count', 'publication_year', 'fwci', 'percentile'):
        ref_metadata.sort(key=lambda x: x.get(sort_by) or 0, reverse=reverse_sort)
    elif sort_by in ('title', 'type', 'oa_status'):
        ref_metadata.sort(key=lambda x: str(x.get(sort_by) or '').lower(), reverse=reverse_sort)

    # 5. Paginación
    total_matching = len(ref_metadata)
    total_pages = (total_matching + limit - 1) // limit if limit > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    page_data = ref_metadata[start_idx:end_idx]

    return JSONResponse({
        'work_id': norm_id,
        'work_title': title_from_db or norm_id,
        'package_name': '',
        'entity_type': 'work',
        'entity_name': title_from_db or norm_id,
        'total_referencing_works': 1,
        'total_references_count': total_refs_count,
        'unique_referenced_works_count': unique_ref_count,
        'filtered_count': total_matching,
        'page': page,
        'limit': limit,
        'total_pages': total_pages,
        'referenced_works': page_data,
        'all_referenced_ids': norm_ref_ids
    })


async def derive_referenced_corpus_endpoint(request: Request):
    """
    Guarda las obras referenciadas (Base Intelectual) como un nuevo corpus de usuario en SQLite
    con source_mode = 'ids' y metadatos de linaje parent_corpus_id y lineage_type = 'intellectual_base'.
    """
    auth_orcid = _check_auth(request)
    if not auth_orcid:
        return JSONResponse({'error': 'Acceso no autorizado. Inicia sesión con ORCID.'}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        body = {}

    package_name = body.get('package_name', '').strip()
    work_id = body.get('work_id', '').strip()
    entity_type = body.get('entity_type', '').strip()
    entity_name = body.get('entity_name', '').strip()
    user_name = body.get('user_name', '').strip() or auth_orcid
    corpus_name_req = body.get('corpus_name', '').strip()
    referenced_ids = body.get('referenced_ids', [])
    description = body.get('description', '').strip()

    if not corpus_name_req:
        if work_id:
            new_corpus_name = f"Base_Intelectual_{entity_name[:30] if entity_name else 'Paper'}"
        elif entity_name:
            new_corpus_name = f"Base_Intelectual_{entity_name[:30]}_{package_name}"
        elif package_name:
            new_corpus_name = f"Base_Intelectual_{package_name}"
        else:
            new_corpus_name = "Base_Intelectual_Corpus"
    else:
        new_corpus_name = corpus_name_req

    new_corpus_name = "".join(c if c.isalnum() or c in ('_', '-') else '_' for c in new_corpus_name).strip('_')

    if not referenced_ids:
        return JSONResponse({'error': 'No se recibieron IDs de referencias para conformar el nuevo corpus.'}, status_code=400)

    # Normalizar IDs
    norm_ref_ids = list(dict.fromkeys([_normalize_openalex_id(rid) for rid in referenced_ids if rid]))

    if not description:
        description = f"Base Intelectual derivada de las referencias bibliográficas ({len(norm_ref_ids):,} obras citadas únicas)."

    # Persistir en SQLite con metadatos de linaje
    saved = save_user_corpus(
        owner_orcid=auth_orcid,
        owner_name=user_name,
        corpus_name=new_corpus_name,
        description=description,
        source_mode='ids',
        filters={},
        ids_list=norm_ref_ids,
        total_works_estimated=len(norm_ref_ids),
        parent_corpus_id=package_name or work_id or None,
        lineage_type='intellectual_base'
    )

    return JSONResponse({
        'success': True,
        'message': f"Nuevo corpus de Base Intelectual '{new_corpus_name}' creado con éxito con {len(norm_ref_ids):,} obras citadas.",
        'corpus': saved
    })
