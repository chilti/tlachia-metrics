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


def _extract_entity_work_ids(works: list, entity_type: str = None, entity_name: str = None) -> list:
    """
    Filtra los IDs de las obras del corpus que corresponden a una entidad específica.
    Si no se especifica entidad, devuelve los IDs de todo el corpus.
    """
    if not entity_type or not entity_name or entity_type.lower() in ('all', 'corpus', 'none'):
        return [w['id'] for w in works if 'id' in w]

    entity_type = entity_type.lower()
    target_name = entity_name.strip().lower()
    matching_ids = []

    for w in works:
        wid = w.get('id')
        if not wid:
            continue

        matched = False

        if entity_type in ('organizations', 'organizations_colab', 'sector_types'):
            # Instituciones directas y en authorships
            inst_names = [i.get('display_name', '') for i in w.get('institutions', [])]
            for auth in w.get('authorships', []):
                for inst in auth.get('institutions', []):
                    inst_names.append(inst.get('display_name', ''))
            if any(target_name in str(name).lower() for name in inst_names if name):
                matched = True

        elif entity_type in ('researchers', 'authors'):
            author_names = []
            for auth in w.get('authorships', []):
                author_obj = auth.get('author', {})
                author_names.append(author_obj.get('display_name', ''))
                author_names.append(auth.get('raw_author_name', ''))
            if any(target_name in str(name).lower() for name in author_names if name):
                matched = True

        elif entity_type in ('locations', 'locations_subnational'):
            countries = []
            for auth in w.get('authorships', []):
                countries.extend(auth.get('countries', []))
            for inst in w.get('institutions', []):
                countries.append(inst.get('country_code', ''))
            if any(target_name in str(c).lower() for c in countries if c):
                matched = True

        elif entity_type in ('publication_sources', 'sources'):
            source_name = ''
            prim_loc = w.get('primary_location') or {}
            source_obj = prim_loc.get('source') or {}
            source_name = source_obj.get('display_name', '')
            if target_name in str(source_name).lower():
                matched = True

        elif entity_type in ('funding_agencies', 'funders'):
            funder_names = []
            for grant in w.get('grants', []) or w.get('awards', []):
                funder_names.append(grant.get('funder_display_name', ''))
            for f in w.get('funders', []):
                funder_names.append(f.get('display_name', ''))
            if any(target_name in str(fn).lower() for fn in funder_names if fn):
                matched = True

        elif entity_type in ('research_areas_macro_topics', 'domains'):
            prim_topic = w.get('primary_topic') or {}
            domain_name = (prim_topic.get('domain') or {}).get('display_name', '')
            if target_name in str(domain_name).lower():
                matched = True

        elif entity_type in ('research_areas_meso_topics', 'fields'):
            prim_topic = w.get('primary_topic') or {}
            field_name = (prim_topic.get('field') or {}).get('display_name', '')
            if target_name in str(field_name).lower():
                matched = True

        elif entity_type in ('research_areas_micro_topics', 'topics', 'subfields'):
            subfield_name = (w.get('primary_topic') or {}).get('subfield', {}).get('display_name', '')
            topic_names = [t.get('display_name', '') for t in w.get('topics', [])]
            if (w.get('primary_topic') or {}).get('display_name'):
                topic_names.append(w['primary_topic']['display_name'])
            if target_name in str(subfield_name).lower() or any(target_name in str(tn).lower() for tn in topic_names if tn):
                matched = True

        elif entity_type == 'concepts':
            concept_names = [c.get('display_name', '') for c in w.get('concepts', [])]
            if any(target_name in str(cn).lower() for cn in concept_names if cn):
                matched = True

        elif entity_type == 'keywords':
            keyword_names = [k.get('display_name', '') or k.get('keyword', '') for k in w.get('keywords', [])]
            if any(target_name in str(kn).lower() for kn in keyword_names if kn):
                matched = True

        else:
            # Fallback a coincidencia en todo el string del objeto de trabajo
            if target_name in json.dumps(w).lower():
                matched = True

        if matched:
            matching_ids.append(wid)

    return matching_ids


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

    # 1. Cargar obras del corpus desde JSON o fallback
    json_path = target_dir / f"{package_name}_openalex_works.json"
    corpus_works = []
    if json_path.exists():
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                corpus_works = json.load(f)
        except Exception as e:
            logger.warning(f"No se pudo leer JSON del corpus {package_name}: {e}")

    # Si no hay JSON, extraer IDs desde ClickHouse o Parquets
    client = _get_ch_client()

    if corpus_works:
        cited_work_ids = _extract_entity_work_ids(corpus_works, entity_type, entity_name)
    else:
        # Fallback: consultar IDs citados directamente en ClickHouse
        cited_work_ids = []

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
    # Para optimizar ordenamiento y búsqueda, traemos los campos clave
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

    # 4. Filtrar por búsqueda si aplica
    if search_q:
        sq = search_q.lower()
        citing_metadata = [
            w for w in citing_metadata
            if sq in w['title'].lower()
            or any(sq in a.lower() for a in w['author_names'])
            or any(sq in inst.lower() for inst in w['institution_names'])
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
    entity_type = body.get('entity_type', '').strip()
    entity_name = body.get('entity_name', '').strip()
    new_corpus_name = body.get('corpus_name', '').strip()
    description = body.get('description', '').strip()
    user_name = body.get('user_name') or auth_orcid
    citing_ids = body.get('citing_ids') or []

    if not new_corpus_name:
        entity_label = f" ({entity_name})" if entity_name else ""
        new_corpus_name = f"Citantes de {package_name}{entity_label}"

    # Si no se enviaron los IDs directamente, calcularlos
    if not citing_ids:
        target_dir = EXPORTS_DIR / package_name
        json_path = target_dir / f"{package_name}_openalex_works.json"
        if not json_path.exists():
            return JSONResponse({'error': f"Paquete '{package_name}' no encontrado."}, status_code=404)

        with open(json_path, 'r', encoding='utf-8') as f:
            corpus_works = json.load(f)

        cited_work_ids = _extract_entity_work_ids(corpus_works, entity_type, entity_name)
        if not cited_work_ids:
            return JSONResponse({'error': 'No se encontraron obras citadas para esta entidad.'}, status_code=400)

        client = _get_ch_client()
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
        description = f"Corpus derivado de los artículos citantes de {package_name} ({len(citing_ids):,} obras citantes únicas)."

    # Persistir en SQLite
    saved = save_user_corpus(
        owner_orcid=auth_orcid,
        owner_name=user_name,
        corpus_name=new_corpus_name,
        description=description,
        source_mode='ids',
        filters={},
        ids_list=citing_ids,
        total_works_estimated=len(citing_ids)
    )

    return JSONResponse({
        'success': True,
        'message': f"Nuevo corpus '{new_corpus_name}' creado con éxito con {len(citing_ids):,} artículos citantes.",
        'corpus': saved
    })
