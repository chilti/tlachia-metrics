"""
api/routers/pubmed_search.py
Enrutador para búsqueda en PubMed API (NCBI E-Utilities),
descarga de todos los campos de metadatos, exportación a texto plano MEDLINE
y enriquecimiento opcional con OpenAlex ClickHouse.
"""
import os
import io
import json
import time
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List
import pandas as pd
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, FileResponse

from openalex_indicators_engine.core.pubmed_client import PubMedClient
from openalex_indicators_engine.core.pubmed_parser import parse_pubmed_xml_to_dataframe
from openalex_indicators_engine.core.gentle_query_engine import GentleQueryEngine
from openalex_indicators_engine.core.config import EXPORTS_DIR

logger = logging.getLogger('pubmed_search')

PUBMED_MESH_CATEGORIES = [
    {"code": "A", "name": "Anatomy", "name_es": "Anatomía"},
    {"code": "B", "name": "Organisms", "name_es": "Organismos"},
    {"code": "C", "name": "Diseases", "name_es": "Enfermedades"},
    {"code": "D", "name": "Chemicals and Drugs", "name_es": "Química y Fármacos"},
    {"code": "E", "name": "Analytical, Diagnostic and Therapeutic Techniques", "name_es": "Técnicas Diagnósticas y Terapéuticas"},
    {"code": "F", "name": "Psychiatry and Psychology", "name_es": "Psiquiatría y Psicología"},
    {"code": "G", "name": "Phenomena and Processes", "name_es": "Fenómenos y Procesos Biológicos"},
    {"code": "H", "name": "Disciplines and Occupations", "name_es": "Disciplinas y Ocupaciones"},
    {"code": "I", "name": "Anthropology, Education, Sociology and Social Phenomena", "name_es": "Antropología y Sociología"},
    {"code": "J", "name": "Technology, Industry, and Agriculture", "name_es": "Tecnología, Industria y Agricultura"},
    {"code": "K", "name": "Humanities", "name_es": "Humanidades"},
    {"code": "L", "name": "Information Science", "name_es": "Ciencias de la Información"},
    {"code": "M", "name": "Named Groups", "name_es": "Grupos Poblacionales"},
    {"code": "N", "name": "Health Care", "name_es": "Atención y Servicios de Salud"},
    {"code": "V", "name": "Publication Characteristics", "name_es": "Características de Publicación (Ensayos Clínicos, Revisiones)"},
    {"code": "Z", "name": "Geographical Locations", "name_es": "Ubicaciones Geográficas"}
]


async def get_pubmed_status_endpoint(request: Request):
    """Verifica si la API de NCBI E-Utilities está activa y si hay API Key configurada."""
    client = PubMedClient()
    status = client.get_status()
    return JSONResponse(status)


async def get_mesh_catalog_endpoint(request: Request):
    """Retorna las categorías principales de MeSH para el constructor asistido."""
    return JSONResponse({
        "categories": PUBMED_MESH_CATEGORIES,
        "total": len(PUBMED_MESH_CATEGORIES)
    })


async def estimate_pubmed_volume_endpoint(request: Request):
    """Estima el total de documentos que arroja una consulta en PubMed."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    raw_query = (body.get("query") or "").strip()
    if not raw_query:
        return JSONResponse({"error": "Debes especificar una consulta de PubMed (query)."}, status_code=400)

    start_year = body.get("start_year")
    end_year = body.get("end_year")

    client = PubMedClient()
    try:
        total = client.estimate_count(
            term=raw_query,
            mindate=int(start_year) if start_year else None,
            maxdate=int(end_year) if end_year else None
        )
        return JSONResponse({
            "success": True,
            "total": total,
            "query_formatted": raw_query
        })
    except Exception as e:
        logger.error(f"Error estimando volumen PubMed: {e}")
        return JSONResponse({"error": f"Error conectando con PubMed NCBI: {str(e)}"}, status_code=500)


async def search_and_enrich_pubmed_endpoint(request: Request):
    """
    Descarga metadatos desde PubMed en lotes, extrae DOIs y opcionalmente los cruza en ClickHouse (works_flat)
    para devolver los registros enriquecidos con métricas OpenAlex (FWCI, topics, ODS).
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    raw_query = (body.get("query") or "").strip()
    if not raw_query:
        return JSONResponse({"error": "Debes especificar una consulta de PubMed (query)."}, status_code=400)

    start_year = body.get("start_year")
    end_year = body.get("end_year")
    max_results = min(int(body.get("max_results") or 5000), 20000)

    client = PubMedClient()
    try:
        df_pubmed, total_pubmed = client.search_and_download_corpus(
            term=raw_query,
            max_results=max_results,
            mindate=int(start_year) if start_year else None,
            maxdate=int(end_year) if end_year else None
        )
    except Exception as e:
        logger.error(f"Error descargando desde PubMed: {e}")
        return JSONResponse({"error": f"Error conectando con PubMed: {str(e)}"}, status_code=500)

    if df_pubmed.empty:
        return JSONResponse({
            "success": True,
            "pubmed_total_found": total_pubmed,
            "pubmed_docs_fetched": 0,
            "matched_in_openalex": 0,
            "coverage_pct": 0.0,
            "work_ids": [],
            "preview_results": [],
            "unmatched_dois_count": 0,
            "message": "No se recuperaron artículos para la consulta especificada.",
            "query_formatted": raw_query
        })

    # Extraer DOIs limpios
    clean_dois = []
    if "doi" in df_pubmed.columns:
        for d in df_pubmed["doi"].dropna():
            d_str = str(d).strip().lower()
            if d_str and d_str not in clean_dois:
                clean_dois.append(d_str)

    matched_dfs = []
    if clean_dois:
        all_doi_variants = set()
        for d in clean_dois:
            clean = d.replace("https://doi.org/", "").replace("http://dx.doi.org/", "").replace("doi.org/", "").strip()
            all_doi_variants.add(f"https://doi.org/{clean}")
            all_doi_variants.add(clean)

        doi_list = list(all_doi_variants)
        chunk_size = 5000
        try:
            engine = GentleQueryEngine()
            ch_client = engine.get_client()

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
                df_chunk = ch_client.query_df(sql)
                if not df_chunk.empty:
                    matched_dfs.append(df_chunk)
        except Exception as e:
            logger.warning(f"Aviso en cruce ClickHouse works_flat: {e}")

    if matched_dfs:
        final_matched_df = pd.concat(matched_dfs, ignore_index=True).drop_duplicates(subset=["id"])
    else:
        final_matched_df = pd.DataFrame()

    matched_count = len(final_matched_df)
    coverage_pct = round((matched_count / len(clean_dois)) * 100, 1) if clean_dois else 0.0
    work_ids = final_matched_df["id"].tolist() if not final_matched_df.empty else []

    # Construir vista previa: si se cruzó con ClickHouse mostrar esa, o si no mostrar los datos nativos de PubMed
    preview_results = []
    if not final_matched_df.empty:
        preview_slice = final_matched_df.head(50)
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
    else:
        # Usar datos nativos de PubMed para el preview
        preview_slice = df_pubmed.head(50)
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
                "cited_by_count": 0,
                "fwci": 0.0,
                "is_oa": bool(row.get("is_oa")),
                "oa_status": str(row.get("oa_status") or "closed"),
                "source_id": str(row.get("journal_issn_linking") or ""),
                "source_name": str(row.get("journal_title") or ""),
                "source_type": "journal",
                "author_names": author_str,
                "all_country_codes": countries_str,
                "domain": "Health Sciences",
                "field": str(row.get("journal_title") or ""),
                "subfield": str(row.get("subfield") or ""),
                "topic": str(row.get("subfield") or "")
            })

    return JSONResponse({
        "success": True,
        "pubmed_total_found": total_pubmed,
        "pubmed_docs_fetched": len(df_pubmed),
        "matched_in_openalex": matched_count,
        "coverage_pct": coverage_pct,
        "work_ids": work_ids if work_ids else df_pubmed["id"].tolist(),
        "preview_results": preview_results,
        "unmatched_dois_count": max(0, len(clean_dois) - matched_count),
        "query_formatted": raw_query
    })


async def export_medline_plain_text_endpoint(request: Request):
    """
    Descarga y retorna directamente el Formato PubMed oficial en texto plano etiquetado (.txt)
    (PMID-, TI -, AB -, FAU -, AU -, AID -, etc.) para una lista de PMIDs o para una consulta de PubMed.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    pmids = body.get("pmids") or []
    query = (body.get("query") or "").strip()
    max_results = min(int(body.get("max_results") or 5000), 15000)

    client = PubMedClient()
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    temp_file = EXPORTS_DIR / f"pubmed_export_{int(time.time())}.txt"

    try:
        if pmids:
            client.download_corpus_from_pmids(
                pmids=pmids,
                batch_size=500,
                save_medline_path=temp_file
            )
        elif query:
            client.search_and_download_corpus(
                term=query,
                max_results=max_results,
                save_medline_path=temp_file
            )
        else:
            return JSONResponse({"error": "Debes especificar una lista de PMIDs o un query de búsqueda."}, status_code=400)

        if not temp_file.exists() or temp_file.stat().st_size == 0:
            return JSONResponse({"error": "No se encontraron registros de PubMed para exportar."}, status_code=404)

        return FileResponse(
            path=str(temp_file),
            filename="corpus_pubmed.txt",
            media_type="text/plain; charset=utf-8"
        )
    except Exception as e:
        logger.error(f"Error exportando texto plano formato PubMed: {e}")
        return JSONResponse({"error": f"Error exportando formato PubMed: {str(e)}"}, status_code=500)


# Alias
export_pubmed_plain_text_endpoint = export_medline_plain_text_endpoint

