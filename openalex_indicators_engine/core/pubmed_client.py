"""
TlachIA Metrics - openalex_indicators_engine
core/pubmed_client.py
Cliente de alto rendimiento y concurrencia para NCBI Entrez E-Utilities.
Soporta:
- Búsqueda y estimación de volumen por términos/MeSH (esearch)
- Resolución masiva de DOIs y Títulos a PMIDs
- Descarga masiva de metadatos XML completos (efetch)
- Exportación directa a texto plano oficial MEDLINE (.medline)
- Control estricto de rate limit (hasta 10 req/s con API Key)
"""
import os
import re
import time
import json
import logging
import urllib.parse
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Union, Callable
import requests
import pandas as pd

from .pubmed_parser import parse_pubmed_xml_to_dataframe, parse_pubmed_xml_to_records

logger = logging.getLogger(__name__)

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


class PubMedClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        email: Optional[str] = None,
        tool: Optional[str] = None
    ):
        self.api_key = api_key or os.environ.get("NCBI_API_KEY") or os.environ.get("PUBMED_API_KEY")
        if self.api_key:
            self.api_key = self.api_key.strip()
        self.email = email or os.environ.get("NCBI_EMAIL", "jlja@ciencias.unam.mx")
        self.tool = tool or os.environ.get("NCBI_TOOL", "tlachia_metrics")

        self.rate_limit_delay = 0.11 if self.api_key else 0.35
        self._last_request_time = 0.0

        self.session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=15, pool_maxsize=15, max_retries=3)
        self.session.mount("https://", adapter)

    def _wait_rate_limit(self):
        elapsed = time.time() - self._last_request_time
        if elapsed < self.rate_limit_delay:
            time.sleep(self.rate_limit_delay - elapsed)
        self._last_request_time = time.time()

    def _build_params(self, base_params: Dict[str, Any]) -> Dict[str, Any]:
        params = dict(base_params)
        if self.api_key:
            params["api_key"] = self.api_key
        if self.email:
            params["email"] = self.email
        if self.tool:
            params["tool"] = self.tool
        return params

    def get_status(self) -> Dict[str, Any]:
        """Comprueba el estado de la API y la validez de la API Key."""
        try:
            cnt = self.estimate_count("asthma[mesh]")
            return {
                "available": True,
                "has_api_key": bool(self.api_key),
                "rate_limit_per_second": 10 if self.api_key else 3,
                "message": "Conexión a NCBI E-Utilities activa."
            }
        except Exception as e:
            return {
                "available": False,
                "has_api_key": bool(self.api_key),
                "error": str(e),
                "message": f"Error conectando con PubMed NCBI: {e}"
            }

    def estimate_count(self, term: str, mindate: Optional[int] = None, maxdate: Optional[int] = None) -> int:
        """Retorna el conteo total de documentos para una consulta en PubMed."""
        params = self._build_params({
            "db": "pubmed",
            "term": term,
            "rettype": "count",
            "retmode": "json"
        })
        if mindate and maxdate:
            params["mindate"] = str(mindate)
            params["maxdate"] = str(maxdate)
            params["datetype"] = "pdat"
        elif mindate:
            params["mindate"] = str(mindate)
            params["datetype"] = "pdat"
        elif maxdate:
            params["maxdate"] = str(maxdate)
            params["datetype"] = "pdat"

        self._wait_rate_limit()
        url = f"{EUTILS_BASE}/esearch.fcgi"
        res = self.session.get(url, params=params, timeout=20)
        if res.status_code == 200:
            data = res.json()
            cnt_str = data.get("esearchresult", {}).get("count", "0")
            return int(cnt_str) if str(cnt_str).isdigit() else 0
        raise RuntimeError(f"Error {res.status_code} desde NCBI esearch: {res.text[:200]}")

    def esearch(
        self,
        term: str,
        retstart: int = 0,
        retmax: int = 10000,
        mindate: Optional[int] = None,
        maxdate: Optional[int] = None,
        usehistory: bool = True
    ) -> Tuple[int, Optional[str], Optional[str], List[str]]:
        """
        Ejecuta esearch.fcgi usando HTTP POST para soportar consultas arbitrariamente largas sin HTTP 414.
        Retorna (total_count, webenv, query_key, idlist).
        """
        params = self._build_params({
            "db": "pubmed",
            "term": term,
            "retstart": retstart,
            "retmax": min(retmax, 10000),
            "retmode": "json",
            "usehistory": "y" if usehistory else "n"
        })
        if mindate and maxdate:
            params["mindate"] = str(mindate)
            params["maxdate"] = str(maxdate)
            params["datetype"] = "pdat"
        elif mindate:
            params["mindate"] = str(mindate)
            params["datetype"] = "pdat"
        elif maxdate:
            params["maxdate"] = str(maxdate)
            params["datetype"] = "pdat"

        self._wait_rate_limit()
        url = f"{EUTILS_BASE}/esearch.fcgi"
        res = self.session.post(url, data=params, timeout=30)
        if res.status_code == 200:
            data = res.json()
            sr = data.get("esearchresult", {})
            cnt = int(sr.get("count", 0))
            webenv = sr.get("webenv")
            query_key = sr.get("querykey")
            idlist = sr.get("idlist", [])
            return cnt, webenv, query_key, idlist
        raise RuntimeError(f"Error {res.status_code} en esearch: {res.text[:200]}")

    def resolve_pmids_from_dois(
        self,
        dois: List[str],
        chunk_size: int = 60,
        callback_progress: Optional[Callable[[int, int], None]] = None
    ) -> Dict[str, str]:
        """
        Resuelve una lista de DOIs a PMIDs de PubMed mediante lotes optimizados vía HTTP POST.
        Retorna diccionario {doi_limpio: pmid}.
        """
        clean_dois = []
        for d in dois:
            if not d or pd.isna(d):
                continue
            cd = str(d).lower().replace("https://doi.org/", "").replace("http://dx.doi.org/", "").replace("doi.org/", "").strip()
            if cd and cd not in clean_dois and cd not in ("nan", "none"):
                clean_dois.append(cd)

        doi_to_pmid: Dict[str, str] = {}
        total = len(clean_dois)

        for idx in range(0, total, chunk_size):
            chunk = clean_dois[idx:idx + chunk_size]
            terms = [f'"{doi}"[doi]' for doi in chunk]
            term = " OR ".join(terms)
            try:
                cnt, _, _, pmids = self.esearch(term, retmax=len(chunk) * 2, usehistory=False)
                if pmids:
                    self._wait_rate_limit()
                    summary_params = self._build_params({
                        "db": "pubmed",
                        "id": ",".join(pmids),
                        "retmode": "json"
                    })
                    s_res = self.session.post(f"{EUTILS_BASE}/esummary.fcgi", data=summary_params, timeout=30)
                    if s_res.status_code == 200:
                        s_data = s_res.json().get("result", {})
                        for pmid in pmids:
                            item = s_data.get(pmid)
                            if isinstance(item, dict):
                                for aid in item.get("articleids", []):
                                    if aid.get("idtype") == "doi":
                                        ret_doi = aid.get("value", "").lower().replace("https://doi.org/", "").replace("http://dx.doi.org/", "").replace("doi.org/", "").strip()
                                        if ret_doi:
                                            doi_to_pmid[ret_doi] = pmid
            except Exception as ex:
                logger.warning(f"Aviso resolviendo lote de DOIs en PubMed: {ex}")

            if callback_progress:
                callback_progress(min(idx + chunk_size, total), total)

        return doi_to_pmid

    @staticmethod
    def _verify_title_similarity(original_title: str, retrieved_title: str, min_ratio: float = 0.80) -> bool:
        """Verifica que el título recuperado sea genuinamente el mismo artículo y no un falso positivo."""
        def _norm(s):
            s = re.sub(r'<[^>]+>', ' ', str(s))
            s = s.replace('[', ' ').replace(']', ' ')  # Preservar títulos en corchetes
            s = re.sub(r'[^a-zA-Z0-9\s]', ' ', s)
            return ' '.join(s.lower().split())

        co = _norm(original_title)
        cr = _norm(retrieved_title)
        if not co or not cr:
            return False

        # 1. Similitud difusa exacta
        import difflib
        ratio = difflib.SequenceMatcher(None, co, cr).ratio()
        if ratio >= min_ratio:
            return True

        # 2. Solapamiento de tokens (para variaciones de subtítulos o puntuación)
        tok_o = set(co.split())
        tok_r = set(cr.split())
        if tok_o and tok_r:
            jaccard = len(tok_o & tok_r) / len(tok_o | tok_r)
            containment = len(tok_o & tok_r) / min(len(tok_o), len(tok_r))
            if containment >= 0.85 and jaccard >= 0.65:
                return True

        return False

    def resolve_pmid_from_title(self, title: str) -> Optional[str]:
        """
        Busca un PMID por título limpiando etiquetas HTML/caracteres especiales
        y verificando estrictamente que el documento recuperado coincida con el título (>= 80% similitud).
        """
        if not title or not str(title).strip():
            return None

        # Limpiar tags HTML (<SUP>, <i>, etc.) y puntuación
        clean_title = re.sub(r'<[^>]+>', ' ', str(title))
        clean_title = re.sub(r'[^\w\s]', ' ', clean_title).strip()
        words = clean_title.split()
        if not words:
            return None

        # Usar hasta 10 palabras significativas
        query_words = [w for w in words if len(w) > 2][:10]
        if not query_words:
            query_words = words[:6]

        term = " ".join(query_words) + "[ti]"
        try:
            cnt, _, _, pmids = self.esearch(term, retmax=3, usehistory=False)
            if pmids:
                # Verificar con esummary el título de los candidatos para evitar falsos positivos
                self._wait_rate_limit()
                summary_params = self._build_params({
                    "db": "pubmed",
                    "id": ",".join(pmids[:3]),
                    "retmode": "json"
                })
                s_res = self.session.post(f"{EUTILS_BASE}/esummary.fcgi", data=summary_params, timeout=20)
                if s_res.status_code == 200:
                    s_data = s_res.json().get("result", {})
                    for candidate_pmid in pmids[:3]:
                        item = s_data.get(candidate_pmid)
                        if isinstance(item, dict):
                            ret_title = item.get("title", "")
                            if self._verify_title_similarity(clean_title, ret_title):
                                return candidate_pmid
        except Exception:
            pass
        return None

    def resolve_corpus_identifiers(
        self,
        df: pd.DataFrame,
        resolve_titles_doc_types: Optional[List[str]] = None,
        callback_progress: Optional[Callable[[str, int, int], None]] = None
    ) -> Tuple[Dict[int, str], Dict[str, int]]:
        """
        Resolvedor multi-etapa robusto para cualquier corpus bibliográfico (WoS, Scopus, CSV):
        1. PMIDs directos existentes.
        2. DOIs resueltos en lotes POST contra PubMed.
        3. Fallback por Título limpio para artículos/revisiones restantes.
        """
        pmid_map: Dict[int, str] = {}
        missing_indices: List[int] = []

        # Etapa 1: PMIDs directos
        for idx, row in df.iterrows():
            pmid_col_val = ""
            for candidate in ("Pubmed ID", "PubmedID", "PMID", "pmid", "id"):
                if candidate in row and pd.notna(row[candidate]):
                    val = str(row[candidate]).replace("MEDLINE:", "").strip()
                    if val.isdigit():
                        pmid_col_val = val
                        break
            if pmid_col_val:
                pmid_map[idx] = pmid_col_val
            else:
                missing_indices.append(idx)

        stats = {
            "initial_pmids": len(pmid_map),
            "resolved_by_doi": 0,
            "resolved_by_title": 0
        }

        if callback_progress:
            callback_progress("pmids_direct", len(pmid_map), len(df))

        # Etapa 2: Resolver DOIs para registros faltantes
        missing_dois = []
        idx_by_doi = {}
        for idx in missing_indices:
            doi_val = ""
            for candidate in ("DOI", "doi", "DI"):
                if candidate in df.columns and pd.notna(df.at[idx, candidate]):
                    cd = str(df.at[idx, candidate]).lower().replace("https://doi.org/", "").replace("http://dx.doi.org/", "").replace("doi.org/", "").strip()
                    if cd and cd not in ("nan", "none"):
                        doi_val = cd
                        break
            if doi_val:
                missing_dois.append(doi_val)
                idx_by_doi[doi_val] = idx

        if missing_dois:
            if callback_progress:
                callback_progress("resolving_dois", 0, len(missing_dois))
            resolved_dois = self.resolve_pmids_from_dois(missing_dois, chunk_size=60)
            stats["resolved_by_doi"] = len(resolved_dois)
            for doi, pmid in resolved_dois.items():
                if doi in idx_by_doi:
                    pmid_map[idx_by_doi[doi]] = pmid

        # Etapa 3: Fallback por Título para registros biomédicos aún sin PMID
        target_types = [t.lower() for t in (resolve_titles_doc_types or ["Article", "Review", "Journal Article", "Clinical Trial"])]
        still_missing = [idx for idx in missing_indices if idx not in pmid_map]

        eligible_for_title = []
        for idx in still_missing:
            doc_type = ""
            for candidate in ("Document Type", "type", "document_type"):
                if candidate in df.columns and pd.notna(df.at[idx, candidate]):
                    doc_type = str(df.at[idx, candidate]).strip().lower()
                    break
            if not doc_type or doc_type in target_types:
                eligible_for_title.append(idx)

        if eligible_for_title:
            title_resolved_cnt = 0
            tot_titles = len(eligible_for_title)
            for i, idx in enumerate(eligible_for_title):
                title_val = ""
                for candidate in ("Article Title", "title", "Title", "TI"):
                    if candidate in df.columns and pd.notna(df.at[idx, candidate]):
                        title_val = str(df.at[idx, candidate]).strip()
                        break
                if title_val:
                    res_pmid = self.resolve_pmid_from_title(title_val)
                    if res_pmid:
                        pmid_map[idx] = res_pmid
                        title_resolved_cnt += 1

                if callback_progress and i % 50 == 0:
                    callback_progress("resolving_titles", i, tot_titles)

            stats["resolved_by_title"] = title_resolved_cnt

        stats["total_with_pmid"] = len(pmid_map)
        stats["unique_pmids"] = len(set(pmid_map.values()))
        return pmid_map, stats

    def fetch_xml_chunk(
        self,
        pmids: Optional[List[str]] = None,
        webenv: Optional[str] = None,
        query_key: Optional[str] = None,
        retstart: int = 0,
        retmax: int = 500
    ) -> bytes:
        """Descarga un bloque de registros en XML (retmode=xml)."""
        params = self._build_params({
            "db": "pubmed",
            "retmode": "xml",
            "rettype": "abstract"
        })
        if webenv and query_key is not None:
            params["WebEnv"] = webenv
            params["query_key"] = query_key
            params["retstart"] = retstart
            params["retmax"] = retmax
        elif pmids:
            params["id"] = ",".join(str(p).strip() for p in pmids[:retmax])
        else:
            raise ValueError("Debes especificar pmids o (webenv + query_key).")

        self._wait_rate_limit()
        url = f"{EUTILS_BASE}/efetch.fcgi"
        for attempt in range(3):
            try:
                res = self.session.post(url, data=params, timeout=60)
                if res.status_code == 200:
                    return res.content
                elif res.status_code == 429:
                    time.sleep(2.0)
            except Exception as e:
                time.sleep(1.0)

        return b""

    def fetch_medline_chunk(
        self,
        pmids: Optional[List[str]] = None,
        webenv: Optional[str] = None,
        query_key: Optional[str] = None,
        retstart: int = 0,
        retmax: int = 1000
    ) -> str:
        """Descarga un bloque de registros en texto plano oficial de MEDLINE (rettype=medline, retmode=text)."""
        params = self._build_params({
            "db": "pubmed",
            "retmode": "text",
            "rettype": "medline"
        })
        if webenv and query_key is not None:
            params["WebEnv"] = webenv
            params["query_key"] = query_key
            params["retstart"] = retstart
            params["retmax"] = retmax
        elif pmids:
            params["id"] = ",".join(str(p).strip() for p in pmids[:retmax])
        else:
            raise ValueError("Debes especificar pmids o (webenv + query_key).")

        self._wait_rate_limit()
        url = f"{EUTILS_BASE}/efetch.fcgi"
        for attempt in range(3):
            try:
                res = self.session.post(url, data=params, timeout=60)
                if res.status_code == 200:
                    return res.text
                elif res.status_code == 429:
                    time.sleep(2.0)
            except Exception:
                time.sleep(1.0)

        return ""

    def download_corpus_from_pmids(
        self,
        pmids: List[str],
        batch_size: int = 500,
        save_medline_path: Optional[Path] = None,
        callback_progress: Optional[Callable[[int, int, str], None]] = None
    ) -> pd.DataFrame:
        """
        Descarga exhaustiva en lotes de una lista de PMIDs.
        Genera DataFrame estructurado con el 100% de campos y opcionalmente exporta texto plano MEDLINE.
        """
        clean_pmids = list(dict.fromkeys(str(p).strip() for p in pmids if str(p).strip().isdigit()))
        total = len(clean_pmids)
        if total == 0:
            return pd.DataFrame()

        dfs = []
        medline_file = open(save_medline_path, "w", encoding="utf-8") if save_medline_path else None

        try:
            for idx in range(0, total, batch_size):
                chunk = clean_pmids[idx:idx + batch_size]
                if callback_progress:
                    callback_progress(idx, total, f"Descargando lote XML {idx // batch_size + 1} ({len(chunk)} registros)...")

                # Descargar XML
                xml_data = self.fetch_xml_chunk(pmids=chunk, retmax=len(chunk))
                if xml_data:
                    df_chunk = parse_pubmed_xml_to_dataframe(xml_data)
                    if not df_chunk.empty:
                        dfs.append(df_chunk)

                # Descargar texto plano MEDLINE si se solicitó
                if medline_file:
                    if callback_progress:
                        callback_progress(idx, total, f"Descargando lote MEDLINE texto plano {idx // batch_size + 1}...")
                    medline_text = self.fetch_medline_chunk(pmids=chunk, retmax=len(chunk))
                    if medline_text:
                        medline_file.write(medline_text)
                        if not medline_text.endswith("\n\n"):
                            medline_file.write("\n\n")

            if callback_progress:
                callback_progress(total, total, "Descarga completada y consolidada.")
        finally:
            if medline_file:
                medline_file.close()

        if dfs:
            final_df = pd.concat(dfs, ignore_index=True).drop_duplicates(subset=["id"])
            return final_df
        return pd.DataFrame()

    def search_and_download_corpus(
        self,
        term: str,
        max_results: int = 10000,
        mindate: Optional[int] = None,
        maxdate: Optional[int] = None,
        save_medline_path: Optional[Path] = None,
        callback_progress: Optional[Callable[[int, int, str], None]] = None
    ) -> Tuple[pd.DataFrame, int]:
        """
        Búsqueda por consulta booleana/MeSH en PubMed, descarga de todos sus metadatos
        y generación opcional de archivo de texto plano MEDLINE.
        """
        cnt, webenv, qkey, initial_pmids = self.esearch(
            term=term,
            retmax=min(max_results, 10000),
            mindate=mindate,
            maxdate=maxdate,
            usehistory=True
        )
        total_to_fetch = min(cnt, max_results)
        if total_to_fetch == 0:
            return pd.DataFrame(), 0

        dfs = []
        batch_size = 500
        medline_file = open(save_medline_path, "w", encoding="utf-8") if save_medline_path else None

        try:
            for start in range(0, total_to_fetch, batch_size):
                cur_limit = min(batch_size, total_to_fetch - start)
                if callback_progress:
                    callback_progress(start, total_to_fetch, f"Descargando registros {start + 1} a {start + cur_limit} de {total_to_fetch}...")

                xml_data = self.fetch_xml_chunk(webenv=webenv, query_key=qkey, retstart=start, retmax=cur_limit)
                if xml_data:
                    df_chunk = parse_pubmed_xml_to_dataframe(xml_data)
                    if not df_chunk.empty:
                        dfs.append(df_chunk)

                if medline_file:
                    medline_txt = self.fetch_medline_chunk(webenv=webenv, query_key=qkey, retstart=start, retmax=cur_limit)
                    if medline_txt:
                        medline_file.write(medline_txt)
                        if not medline_txt.endswith("\n\n"):
                            medline_file.write("\n\n")

            if callback_progress:
                callback_progress(total_to_fetch, total_to_fetch, "Descarga PubMed finalizada.")
        finally:
            if medline_file:
                medline_file.close()

        if dfs:
            final_df = pd.concat(dfs, ignore_index=True).drop_duplicates(subset=["id"])
            return final_df, cnt
        return pd.DataFrame(), cnt
