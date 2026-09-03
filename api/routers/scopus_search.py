"""
api/routers/scopus_search.py - Enrutador para búsqueda en Scopus API y enriquecimiento analítico con OpenAlex ClickHouse
"""
import os
import json
import time
import logging
import urllib.parse
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from concurrent.futures import ThreadPoolExecutor
import requests
import pandas as pd
from starlette.requests import Request
from starlette.responses import JSONResponse

from openalex_indicators_engine.core.gentle_query_engine import GentleQueryEngine

logger = logging.getLogger('scopus_search')

SCOPUS_AREAS = [
    {"code": "AGRI", "name": "Agricultural and Biological Sciences", "name_es": "Ciencias Agrícolas y Biológicas"},
    {"code": "ARTS", "name": "Arts and Humanities", "name_es": "Artes y Humanidades"},
    {"code": "BIOC", "name": "Biochemistry, Genetics and Molecular Biology", "name_es": "Bioquímica, Genética y Biología Molecular"},
    {"code": "BUSI", "name": "Business, Management and Accounting", "name_es": "Negocios, Gestión y Contabilidad"},
    {"code": "CENG", "name": "Chemical Engineering", "name_es": "Ingeniería Química"},
    {"code": "CHEM", "name": "Chemistry", "name_es": "Química"},
    {"code": "COMP", "name": "Computer Science", "name_es": "Ciencias de la Computación"},
    {"code": "DECI", "name": "Decision Sciences", "name_es": "Ciencias de la Decisión"},
    {"code": "DENT", "name": "Dentistry", "name_es": "Odontología"},
    {"code": "EART", "name": "Earth and Planetary Sciences", "name_es": "Ciencias de la Tierra y Planetarias"},
    {"code": "ECON", "name": "Economics, Econometrics and Finance", "name_es": "Economía, Econometría y Finanzas"},
    {"code": "ENGI", "name": "Engineering", "name_es": "Ingeniería"},
    {"code": "ENVI", "name": "Environmental Science", "name_es": "Ciencias Ambientales"},
    {"code": "HEAL", "name": "Health Professions", "name_es": "Profesiones de la Salud"},
    {"code": "IMMU", "name": "Immunology and Microbiology", "name_es": "Inmunología y Microbiología"},
    {"code": "MATE", "name": "Materials Science", "name_es": "Ciencia de Materiales"},
    {"code": "MATH", "name": "Mathematics", "name_es": "Matemáticas"},
    {"code": "MEDI", "name": "Medicine", "name_es": "Medicina"},
    {"code": "NEUR", "name": "Neuroscience", "name_es": "Neurociencia"},
    {"code": "NURS", "name": "Nursing", "name_es": "Enfermería"},
    {"code": "PHAR", "name": "Pharmacology, Toxicology and Pharmaceutics", "name_es": "Farmacología, Toxicología y Farmacéutica"},
    {"code": "PHYS", "name": "Physics and Astronomy", "name_es": "Física y Astronomía"},
    {"code": "PSYC", "name": "Psychology", "name_es": "Psicología"},
    {"code": "SOCI", "name": "Social Sciences", "name_es": "Ciencias Sociales"},
    {"code": "VETE", "name": "Veterinary", "name_es": "Veterinaria"},
    {"code": "MULT", "name": "Multidisciplinary", "name_es": "Multidisciplinaria"}
]


def _get_scopus_api_key() -> Optional[str]:
    """Obtiene la clave de la API de Scopus desde variables de entorno."""
    key = os.environ.get("SCOPUS_API_KEY") or os.environ.get("PYBLIOMETRICS_API_KEY")
    if key and key.strip() and key.strip() != "tu_api_key_aqui":
        return key.strip()
    return None


def _load_asjc_subareas() -> List[Dict[str, Any]]:
    """Carga el catálogo de 334 subáreas ASJC."""
    subareas_file = Path(__file__).parent.parent.parent / "data" / "scopus_subareas.json"
    if not subareas_file.exists():
        subareas_file = Path("/mnt/expansion/desplegados/Topics/data/scopus_subareas.json")

    subareas_list = []
    if subareas_file.exists():
        try:
            with open(subareas_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                for name, code in sorted(data.items(), key=lambda x: x[0]):
                    subareas_list.append({"name": name, "code": str(code)})
        except Exception as e:
            logger.error(f"Error cargando subareas ASJC: {e}")
    return subareas_list


def _fetch_scopus_page_and_total(session: requests.Session, url: str, headers: dict) -> Tuple[List[dict], int]:
    """Descarga una página de Scopus y retorna (entries, totalResults) en 1 sola llamada HTTP."""
    for attempt in range(3):
        try:
            res = session.get(url, headers=headers, timeout=15)
            if res.status_code == 200:
                data = res.json()
                sr = data.get("search-results", {})
                entries = sr.get("entry", [])
                tot_str = sr.get("opensearch:totalResults", "0")
                tot = int(tot_str) if tot_str.isdigit() else (len(entries) if isinstance(entries, list) else 0)
                if isinstance(entries, list):
                    if len(entries) == 1 and entries[0].get("error"):
                        return [], tot
                    return entries, tot
                return [], tot
            elif res.status_code == 429:
                time.sleep(1.0)
            elif res.status_code == 400:
                return [], 0
        except Exception:
            time.sleep(0.5)
    return [], 0


def _download_scopus_query_entries(
    api_key: str,
    inst_token: Optional[str],
    raw_query: str,
    start_year: Optional[int],
    end_year: Optional[int],
    max_results: int = 15000
) -> Tuple[List[dict], int, str]:
    """
    Descarga registros de Scopus usando count=200 y ThreadPoolExecutor.
    Si el volumen supera 5000 resultados, particiona por rangos de año automáticamente.
    """
    headers = {
        "X-ELS-APIKey": api_key,
        "Accept": "application/json"
    }
    if inst_token:
        headers["X-ELS-Insttoken"] = inst_token.strip()

    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20, max_retries=3)
    session.mount("https://", adapter)

    page_size = 200

    query = raw_query
    if start_year and end_year:
        query = f"({raw_query}) AND PUBYEAR > {int(start_year) - 1} AND PUBYEAR < {int(end_year) + 1}"
    elif start_year:
        query = f"({raw_query}) AND PUBYEAR > {int(start_year) - 1}"
    elif end_year:
        query = f"({raw_query}) AND PUBYEAR < {int(end_year) + 1}"

    # Paso 1: Consultar primera página y total
    first_url = f"https://api.elsevier.com/content/search/scopus?query={urllib.parse.quote(query)}&count={page_size}&start=0"
    first_entries, total_scopus = _fetch_scopus_page_and_total(session, first_url, headers)

    all_entries = list(first_entries)

    if total_scopus <= page_size or len(all_entries) >= min(total_scopus, max_results):
        return all_entries, total_scopus, query

    # Caso A: total_scopus <= 5000 (Se puede descargar directamente con offsets)
    if total_scopus <= 5000:
        starts = list(range(page_size, min(total_scopus, max_results), page_size))
        urls = [f"https://api.elsevier.com/content/search/scopus?query={urllib.parse.quote(query)}&count={page_size}&start={s}" for s in starts]
        with ThreadPoolExecutor(max_workers=5) as executor:
            for page, _ in executor.map(lambda u: _fetch_scopus_page_and_total(session, u, headers), urls):
                if page:
                    all_entries.extend(page)
        return all_entries, total_scopus, query

    # Caso B: total_scopus > 5000 (Particionamos inteligentemente por rangos de año)
    if start_year and end_year:
        sy, ey = int(start_year), int(end_year)
        span = ey - sy
        if span <= 5:
            year_brackets = [(y, y) for y in range(sy, ey + 1)]
        else:
            step = max(2, span // 5)
            year_brackets = []
            for y in range(sy, ey + 1, step):
                year_brackets.append((y, min(y + step - 1, ey)))
    else:
        year_brackets = [
            (1860, 1980),
            (1981, 1995),
            (1996, 2005),
            (2006, 2015),
            (2016, 2026)
        ]

    def fetch_bracket(bracket: Tuple[int, int]) -> List[dict]:
        b_start, b_end = bracket
        b_query = f"({raw_query}) AND PUBYEAR > {b_start - 1} AND PUBYEAR < {b_end + 1}"
        b_url = f"https://api.elsevier.com/content/search/scopus?query={urllib.parse.quote(b_query)}&count={page_size}&start=0"
        b_entries, b_tot = _fetch_scopus_page_and_total(session, b_url, headers)
        if not b_entries:
            return []

        entries_collector = list(b_entries)
        if b_tot > page_size:
            b_starts = list(range(page_size, min(b_tot, 5000), page_size))
            b_urls = [f"https://api.elsevier.com/content/search/scopus?query={urllib.parse.quote(b_query)}&count={page_size}&start={s}" for s in b_starts]
            for u in b_urls:
                p, _ = _fetch_scopus_page_and_total(session, u, headers)
                if p:
                    entries_collector.extend(p)
        return entries_collector

    all_partitioned_entries = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        for bracket_res in executor.map(fetch_bracket, year_brackets):
            if bracket_res:
                all_partitioned_entries.extend(bracket_res)

    # Deduplicar por identificadores
    seen_ids = set()
    deduped_entries = []
    for entry in all_partitioned_entries:
        uid = entry.get("eid") or entry.get("prism:doi") or entry.get("dc:identifier") or entry.get("dc:title")
        if uid and uid not in seen_ids:
            seen_ids.add(uid)
            deduped_entries.append(entry)
        elif not uid:
            deduped_entries.append(entry)

    return deduped_entries, total_scopus, query


async def get_scopus_status_endpoint(request: Request):
    """Verifica si las credenciales de Scopus API están configuradas y disponibles."""
    api_key = _get_scopus_api_key()
    return JSONResponse({
        "available": bool(api_key),
        "has_key": bool(api_key),
        "message": "Credenciales de Scopus API configuradas." if api_key else "No se configuró SCOPUS_API_KEY en .env"
    })


async def get_asjc_catalog_endpoint(request: Request):
    """Retorna el catálogo de 27 Áreas Scopus y 334 Subáreas numéricas ASJC."""
    subareas = _load_asjc_subareas()
    return JSONResponse({
        "areas": SCOPUS_AREAS,
        "subareas": subareas,
        "total_areas": len(SCOPUS_AREAS),
        "total_subareas": len(subareas)
    })


async def estimate_scopus_volume_endpoint(request: Request):
    """Estima el total de documentos que arroja una consulta en la API de Scopus."""
    api_key = _get_scopus_api_key()
    if not api_key:
        return JSONResponse({"error": "La API de Scopus no está configurada. Agrega SCOPUS_API_KEY a .env."}, status_code=400)

    try:
        body = await request.json()
    except Exception:
        body = {}

    raw_query = (body.get("query") or "").strip()
    if not raw_query:
        return JSONResponse({"error": "Debes especificar una consulta de Scopus (query)."}, status_code=400)

    start_year = body.get("start_year")
    end_year = body.get("end_year")

    query = raw_query
    if start_year and end_year:
        query = f"({raw_query}) AND PUBYEAR > {int(start_year) - 1} AND PUBYEAR < {int(end_year) + 1}"
    elif start_year:
        query = f"({raw_query}) AND PUBYEAR > {int(start_year) - 1}"
    elif end_year:
        query = f"({raw_query}) AND PUBYEAR < {int(end_year) + 1}"

    url = f"https://api.elsevier.com/content/search/scopus?query={urllib.parse.quote(query)}&count=1"
    headers = {
        "X-ELS-APIKey": api_key,
        "Accept": "application/json"
    }

    inst_token = os.environ.get("SCOPUS_INST_TOKEN")
    if inst_token:
        headers["X-ELS-Insttoken"] = inst_token.strip()

    try:
        res = requests.get(url, headers=headers, timeout=15)
        if res.status_code == 200:
            data = res.json()
            search_results = data.get("search-results", {})
            total_results_str = search_results.get("opensearch:totalResults", "0")
            total = int(total_results_str) if total_results_str.isdigit() else 0
            return JSONResponse({
                "success": True,
                "total": total,
                "query_formatted": query
            })
        else:
            error_data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            msg = error_data.get("service-error", {}).get("status", {}).get("statusText") or f"Error {res.status_code} desde Elsevier API"
            return JSONResponse({"error": msg, "status_code": res.status_code}, status_code=400)
    except Exception as e:
        logger.error(f"Error consultando volumen Scopus: {e}")
        return JSONResponse({"error": f"Error de conexión con Scopus API: {str(e)}"}, status_code=500)


async def search_and_enrich_scopus_endpoint(request: Request):
    """
    Descarga registros desde Scopus API en paralelo, extrae DOIs y los cruza en ClickHouse (works_flat)
    para devolver los registros enriquecidos con topics, ODS, afiliaciones y métricas OpenAlex.
    """
    api_key = _get_scopus_api_key()
    if not api_key:
        return JSONResponse({"error": "La API de Scopus no está configurada. Agrega SCOPUS_API_KEY a .env."}, status_code=400)

    try:
        body = await request.json()
    except Exception:
        body = {}

    raw_query = (body.get("query") or "").strip()
    if not raw_query:
        return JSONResponse({"error": "Debes especificar una consulta de Scopus (query)."}, status_code=400)

    start_year = body.get("start_year")
    end_year = body.get("end_year")
    max_results = min(int(body.get("max_results") or 10000), 25000)
    inst_token = os.environ.get("SCOPUS_INST_TOKEN")

    try:
        scopus_entries, total_scopus, query = _download_scopus_query_entries(
            api_key=api_key,
            inst_token=inst_token,
            raw_query=raw_query,
            start_year=start_year,
            end_year=end_year,
            max_results=max_results
        )
    except Exception as e:
        logger.error(f"Error descargando registros de Scopus: {e}")
        return JSONResponse({"error": f"Fallo al conectar con Scopus API: {str(e)}"}, status_code=500)

    # 2. Extraer DOIs limpios y variantes
    raw_dois = []
    for entry in scopus_entries:
        doi = entry.get("prism:doi")
        if doi:
            raw_dois.append(str(doi).strip().lower())

    clean_dois = list(dict.fromkeys(raw_dois))
    logger.info(f"Registros Scopus descargados: {len(scopus_entries)}, DOIs extraídos: {len(clean_dois)}")

    if not clean_dois:
        return JSONResponse({
            "success": True,
            "scopus_total_found": total_scopus,
            "scopus_docs_fetched": len(scopus_entries),
            "matched_in_openalex": 0,
            "coverage_pct": 0.0,
            "work_ids": [],
            "preview_results": [],
            "unmatched_dois_count": 0,
            "message": "Se recuperaron registros de Scopus pero ninguno contenía un identificador DOI para cruce con OpenAlex.",
            "query_formatted": query
        })

    # 3. Cruzar DOIs en ClickHouse contra works_flat
    all_doi_variants = set()
    for d in clean_dois:
        clean = d.replace("https://doi.org/", "").replace("http://dx.doi.org/", "").replace("doi.org/", "").strip()
        all_doi_variants.add(f"https://doi.org/{clean}")
        all_doi_variants.add(clean)

    doi_list = list(all_doi_variants)
    chunk_size = 5000
    matched_dfs = []

    try:
        engine = GentleQueryEngine()
        client = engine.get_client()

        for i in range(0, len(doi_list), chunk_size):
            chunk = doi_list[i:i + chunk_size]
            formatted = ", ".join(f"'{str(doi).replace(chr(39), chr(39)+chr(39))}'" for doi in chunk)
            sql = f"""
                SELECT
                    id, doi, title, publication_year, cited_by_count, fwci, is_oa, oa_status,
                    source_id, source_type, author_names, all_country_codes, subfield, field, domain, topic
                FROM works_flat
                WHERE doi IN ({formatted})
            """
            df_chunk = client.query_df(sql)
            if not df_chunk.empty:
                matched_dfs.append(df_chunk)

        if matched_dfs:
            final_df = pd.concat(matched_dfs, ignore_index=True).drop_duplicates(subset=["id"])
        else:
            final_df = pd.DataFrame()
    except Exception as e:
        logger.error(f"Error en cruce ClickHouse works_flat: {e}")
        return JSONResponse({"error": f"Error cruzando DOIs en ClickHouse: {str(e)}"}, status_code=500)

    matched_count = len(final_df)
    coverage_pct = round((matched_count / len(clean_dois)) * 100, 1) if clean_dois else 0.0
    work_ids = final_df["id"].tolist() if not final_df.empty else []

    # 4. Formatear vista previa de los primeros 50 registros
    preview_slice = final_df.head(50) if not final_df.empty else pd.DataFrame()
    preview_results = []
    if not preview_slice.empty:
        for _, row in preview_slice.iterrows():
            author_names = row.get("author_names")
            if isinstance(author_names, (list, tuple)):
                author_str = ", ".join(str(a) for a in author_names[:4])
            else:
                author_str = str(author_names or "Autores no especificados")

            countries = row.get("all_country_codes")
            if isinstance(countries, (list, tuple)):
                countries_str = ", ".join(str(c) for c in countries)
            else:
                countries_str = str(countries or "")

            preview_results.append({
                "id": str(row.get("id") or ""),
                "doi": str(row.get("doi") or ""),
                "title": str(row.get("title") or "Sin título"),
                "publication_year": int(row.get("publication_year") or 0),
                "cited_by_count": int(row.get("cited_by_count") or 0),
                "fwci": float(row.get("fwci") or 0.0),
                "is_oa": bool(row.get("is_oa")),
                "oa_status": str(row.get("oa_status") or "closed"),
                "source_id": str(row.get("source_id") or ""),
                "source_name": str(row.get("source_id") or ""),
                "source_type": str(row.get("source_type") or ""),
                "author_names": author_str,
                "all_country_codes": countries_str,
                "domain": str(row.get("domain") or ""),
                "field": str(row.get("field") or ""),
                "subfield": str(row.get("subfield") or ""),
                "topic": str(row.get("topic") or "")
            })

    return JSONResponse({
        "success": True,
        "scopus_total_found": total_scopus,
        "scopus_docs_fetched": len(scopus_entries),
        "matched_in_openalex": matched_count,
        "coverage_pct": coverage_pct,
        "work_ids": work_ids,
        "preview_results": preview_results,
        "unmatched_dois_count": max(0, len(clean_dois) - matched_count),
        "query_formatted": query
    })
