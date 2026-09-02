"""
TlachIA Metrics - openalex_indicators_engine
core/corpus_builder.py
Constructor y normalizador universal de corpus bibliográficos:
- Desanida y extrae entidades desde JSON de OpenAlex, CSV (88 columnas) o Parquet
- Extracción por IDs de OpenAlex, DOIs, Revistas, Instituciones, Autores, Tópicos o Países desde ClickHouse
"""
import os
import json
import logging
import pandas as pd
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional, Union

from .gentle_query_engine import GentleQueryEngine

logger = logging.getLogger(__name__)

STANDARD_COLUMNS = [
    'id', 'doi', 'title', 'publication_year', 'cited_by_count', 'fwci', 'percentile',
    'is_top_10', 'is_top_1', 'is_oa', 'oa_status', 'source_id', 'source_name', 'source_type',
    'author_names', 'author_ids', 'institution_names', 'institution_ids', 'institution_rors',
    'institution_types', 'all_country_codes', 'country_code', 'subfield', 'field', 'domain', 'topic',
    'topic_id', 'subfield_id', 'field_id', 'domain_id', 'sdg_ids', 'sdgs', 'concept_ids',
    'concepts', 'keywords', 'funder_names', 'funder_ids', 'awards', 'apc_paid_usd',
    'apc_list_usd', 'counts_by_year', 'referenced_works', 'referenced_works_count',
    'is_retracted', 'is_paratext', 'is_doaj_indexed', 'is_core_journal',
    'has_repository_fulltext', 'license'
]

class CorpusBuilder:
    def __init__(self, query_engine: Optional[GentleQueryEngine] = None):
        self.engine = query_engine or GentleQueryEngine()

    def from_file(self, file_path: Union[str, Path]) -> pd.DataFrame:
        p = Path(file_path)
        if not p.exists():
            raise FileNotFoundError(f'Archivo no encontrado: {file_path}')
        
        ext = p.suffix.lower()
        if ext == '.parquet':
            df = pd.read_parquet(p)
            return self._normalize_dataframe(df)
        elif ext == '.csv':
            df = pd.read_csv(p, sep=None, engine='python')
            return self._normalize_dataframe(df)
        elif ext in ('.json', '.jsonl'):
            if ext == '.jsonl':
                df = pd.read_json(p, lines=True)
                return self._normalize_dataframe(df)
            else:
                with open(p, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                items = data if isinstance(data, list) else (data.get('results', [data]) if isinstance(data, dict) else [data])
                rows = [self._flatten_json_work(w) for w in items if isinstance(w, dict)]
                return self._normalize_dataframe(pd.DataFrame(rows))
        else:
            raise ValueError(f'Formato no soportado: {ext}')

    def _flatten_json_work(self, w: Dict[str, Any]) -> Dict[str, Any]:
        """Aplana un objeto JSON completo de OpenAlex a un diccionario estándar con strings y listas de strings."""
        # Autores e Instituciones
        authorships = w.get('authorships', []) or []
        author_names = []
        author_ids = []
        institution_names = []
        institution_ids = []
        institution_rors = []
        institution_types = []
        country_codes = []

        for a in authorships:
            if not isinstance(a, dict):
                continue
            auth = a.get('author', {}) or {}
            if auth.get('display_name'):
                author_names.append(str(auth['display_name']).strip())
            if auth.get('id'):
                author_ids.append(str(auth['id']).split('/')[-1])
            
            for inst in a.get('institutions', []) or []:
                if isinstance(inst, dict):
                    if inst.get('display_name'):
                        institution_names.append(str(inst['display_name']).strip())
                    if inst.get('id'):
                        institution_ids.append(str(inst['id']).split('/')[-1])
                    if inst.get('ror'):
                        institution_rors.append(str(inst['ror']).strip())
                    if inst.get('type'):
                        institution_types.append(str(inst['type']).strip())
                    if inst.get('country_code'):
                        country_codes.append(str(inst['country_code']).strip())

            for c in a.get('countries', []) or []:
                if c:
                    country_codes.append(str(c).strip())

        # Taxonomía (primary_topic / topics)
        pt = w.get('primary_topic') or {}
        topic_name = pt.get('display_name') if isinstance(pt, dict) else None
        topic_id = pt.get('id', '').split('/')[-1] if isinstance(pt, dict) and pt.get('id') else None
        subfield_name = pt.get('subfield', {}).get('display_name') if isinstance(pt, dict) and isinstance(pt.get('subfield'), dict) else None
        subfield_id = pt.get('subfield', {}).get('id', '').split('/')[-1] if isinstance(pt, dict) and isinstance(pt.get('subfield'), dict) else None
        field_name = pt.get('field', {}).get('display_name') if isinstance(pt, dict) and isinstance(pt.get('field'), dict) else None
        field_id = pt.get('field', {}).get('id', '').split('/')[-1] if isinstance(pt, dict) and isinstance(pt.get('field'), dict) else None
        domain_name = pt.get('domain', {}).get('display_name') if isinstance(pt, dict) and isinstance(pt.get('domain'), dict) else None
        domain_id = pt.get('domain', {}).get('id', '').split('/')[-1] if isinstance(pt, dict) and isinstance(pt.get('domain'), dict) else None

        # Conceptos, Keywords, ODS
        concepts = [c.get('display_name') for c in (w.get('concepts') or []) if isinstance(c, dict) and c.get('display_name')]
        concept_ids = [c.get('id', '').split('/')[-1] for c in (w.get('concepts') or []) if isinstance(c, dict) and c.get('id')]
        
        keywords = [k.get('display_name') for k in (w.get('keywords') or []) if isinstance(k, dict) and k.get('display_name')]
        
        sdgs_raw = w.get('sustainable_development_goals') or w.get('sdgs') or []
        sdgs = [s.get('display_name') for s in sdgs_raw if isinstance(s, dict) and s.get('display_name')]
        sdg_ids = [s.get('id', '').split('/')[-1] for s in sdgs_raw if isinstance(s, dict) and s.get('id')]

        # Fuentes / Revista
        pl = w.get('primary_location') or {}
        src = pl.get('source') or {} if isinstance(pl, dict) else {}
        source_id = src.get('id', '').split('/')[-1] if isinstance(src, dict) and src.get('id') else (w.get('source_id') or '')
        source_name = src.get('display_name') if isinstance(src, dict) else ''
        source_type = src.get('type') if isinstance(src, dict) else ''
        is_doaj = 1 if (isinstance(src, dict) and src.get('is_in_doaj')) or 'doaj' in (w.get('indexed_in') or []) else 0
        is_core = 1 if (isinstance(src, dict) and src.get('is_core')) or (isinstance(src, dict) and src.get('is_core_journal')) else 0

        # Acceso Abierto
        oa = w.get('open_access') or {}
        is_oa = 1 if (isinstance(oa, dict) and oa.get('is_oa')) or w.get('is_oa') else 0
        oa_status = oa.get('oa_status') if isinstance(oa, dict) else (w.get('oa_status') or 'closed')

        # Percentil
        cnp = w.get('citation_normalized_percentile')
        if isinstance(cnp, dict):
            percentile_val = cnp.get('value', 0.0)
            is_top_10 = 1 if cnp.get('is_in_top_10_percent') else 0
            is_top_1 = 1 if cnp.get('is_in_top_1_percent') else 0
        else:
            percentile_val = w.get('percentile', 0.0)
            is_top_10 = 1 if w.get('is_top_10') else 0
            is_top_1 = 1 if w.get('is_top_1') else 0

        # APC
        apc_p = w.get('apc_paid') or {}
        apc_paid_val = apc_p.get('value_usd', 0.0) if isinstance(apc_p, dict) else (w.get('apc_paid_usd') or 0.0)
        apc_l = w.get('apc_list') or {}
        apc_list_val = apc_l.get('value_usd', 0.0) if isinstance(apc_l, dict) else (w.get('apc_list_usd') or 0.0)

        # Funders
        funders_raw = w.get('funders') or w.get('grants') or []
        funder_names = [f.get('display_name') or f.get('funder_display_name') for f in funders_raw if isinstance(f, dict) and (f.get('display_name') or f.get('funder_display_name'))]
        funder_ids = [f.get('id', '').split('/')[-1] for f in funders_raw if isinstance(f, dict) and f.get('id')]

        return {
            'id': str(w.get('id', '')).split('/')[-1],
            'doi': w.get('doi', ''),
            'title': w.get('title') or w.get('display_name') or 'Sin título',
            'publication_year': w.get('publication_year', 0),
            'cited_by_count': w.get('cited_by_count', 0),
            'fwci': w.get('fwci', 0.0),
            'percentile': percentile_val,
            'is_top_10': is_top_10,
            'is_top_1': is_top_1,
            'is_oa': is_oa,
            'oa_status': oa_status,
            'source_id': source_id,
            'source_name': source_name,
            'source_type': source_type,
            'author_names': list(set(author_names)),
            'author_ids': list(set(author_ids)),
            'institution_names': list(set(institution_names)),
            'institution_ids': list(set(institution_ids)),
            'institution_rors': list(set(institution_rors)),
            'institution_types': list(set(institution_types)),
            'all_country_codes': list(set(country_codes)),
            'country_code': country_codes[0] if country_codes else '',
            'subfield': subfield_name or w.get('subfield', ''),
            'field': field_name or w.get('field', ''),
            'domain': domain_name or w.get('domain', ''),
            'topic': topic_name or w.get('topic', ''),
            'topic_id': topic_id or '',
            'subfield_id': subfield_id or '',
            'field_id': field_id or '',
            'domain_id': domain_id or '',
            'sdg_ids': list(set(sdg_ids)),
            'sdgs': list(set(sdgs)),
            'concept_ids': list(set(concept_ids)),
            'concepts': list(set(concepts)),
            'keywords': list(set(keywords)),
            'funder_names': list(set(funder_names)),
            'funder_ids': list(set(funder_ids)),
            'awards': w.get('awards', []) or [],
            'apc_paid_usd': apc_paid_val,
            'apc_list_usd': apc_list_val,
            'counts_by_year': str(w.get('counts_by_year', '')),
            'referenced_works': w.get('referenced_works', []) or [],
            'referenced_works_count': w.get('referenced_works_count', 0),
            'is_retracted': 1 if w.get('is_retracted') else 0,
            'is_paratext': 1 if w.get('is_paratext') else 0,
            'is_doaj_indexed': is_doaj,
            'is_core_journal': is_core,
            'has_repository_fulltext': 1 if w.get('has_repository_fulltext') else 0,
            'license': pl.get('license', '') if isinstance(pl, dict) else (w.get('license') or '')
        }

    def from_openalex_ids(self, work_ids: List[str]) -> pd.DataFrame:
        clean_ids = [w.split('/')[-1].strip() for w in work_ids if w]
        if not clean_ids:
            return pd.DataFrame(columns=STANDARD_COLUMNS)
        template = """
        SELECT *
        FROM works_flat
        WHERE id IN {ids} OR replaceOne(id, 'https://openalex.org/', '') IN {ids}
        """
        df = self.engine.query_in_chunks_by_ids(template, clean_ids)
        return self._normalize_dataframe(df)

    def from_dois(self, dois: List[str]) -> pd.DataFrame:
        clean_dois = [d.replace('https://doi.org/', '').replace('http://doi.org/', '').strip().lower() for d in dois if d]
        if not clean_dois:
            return pd.DataFrame(columns=STANDARD_COLUMNS)
        template = """
        SELECT *
        FROM works_flat
        WHERE lower(replaceOne(replaceOne(doi, 'https://doi.org/', ''), 'http://doi.org/', '')) IN {ids}
        """
        df = self.engine.query_in_chunks_by_ids(template, clean_dois)
        return self._normalize_dataframe(df)

    def from_source_id(self, source_id: str, start_year: int = 1970, end_year: int = 2026) -> pd.DataFrame:
        s_id = source_id.split('/')[-1].strip()
        query = f"""
        SELECT *
        FROM works_flat
        WHERE (source_id = '{s_id}' OR source_id = 'https://openalex.org/{s_id}')
          AND publication_year BETWEEN {start_year} AND {end_year}
        """
        df = self.engine.query_df(query)
        return self._normalize_dataframe(df)

    def from_institution_id(self, institution_id: str, start_year: int = 1970, end_year: int = 2026) -> pd.DataFrame:
        i_id = institution_id.split('/')[-1].strip()
        query = f"""
        SELECT *
        FROM works_flat
        WHERE (has(institution_ids, '{i_id}') OR has(institution_ids, 'https://openalex.org/{i_id}') OR has(institution_rors, '{i_id}'))
          AND publication_year BETWEEN {start_year} AND {end_year}
        """
        df = self.engine.query_df(query)
        return self._normalize_dataframe(df)

    def from_topic_id(self, topic_id: str, start_year: int = 1970, end_year: int = 2026) -> pd.DataFrame:
        t_id = topic_id.split('/')[-1].strip()
        query = f"""
        SELECT *
        FROM works_flat
        WHERE (topic_id = '{t_id}' OR topic_id = 'https://openalex.org/{t_id}'
               OR primary_topic_id = '{t_id}' OR primary_topic_id = 'https://openalex.org/{t_id}'
               OR has(all_topics, '{t_id}') OR has(all_topics, 'https://openalex.org/{t_id}'))
          AND publication_year BETWEEN {start_year} AND {end_year}
        """
        df = self.engine.query_df(query)
        return self._normalize_dataframe(df)

    def _build_where_clauses(self, filters: Dict[str, Any]) -> List[str]:
        clauses = []
        
        # Rango de años
        start_year = int(filters.get('start_year') or 1970)
        end_year = int(filters.get('end_year') or 2026)
        clauses.append(f"publication_year BETWEEN {start_year} AND {end_year}")

        # Búsqueda libre en título o abstract
        query = filters.get('query') or filters.get('search_query') or filters.get('q')
        if query and str(query).strip():
            clean_q = str(query).strip().replace("'", "\\'")
            clauses.append(f"positionCaseInsensitiveUTF8(title, '{clean_q}') > 0")

        # Tópicos (Múltiples con OR / AND)
        t_ids = filters.get('topic_ids') or []
        if isinstance(t_ids, str):
            t_ids = [t.strip() for t in t_ids.split(',') if t.strip()]
        single_topic = filters.get('topic_id')
        if single_topic and single_topic not in t_ids:
            t_ids.append(single_topic)

        t_ids = [str(t).split('/')[-1].strip() for t in t_ids if str(t).strip()]
        if t_ids:
            t_logic = str(filters.get('topic_logic', 'OR')).strip().upper()
            if t_logic == 'AND':
                and_clauses = [f"(topic_id = '{t}' OR topic_id = 'https://openalex.org/{t}' OR primary_topic_id = '{t}' OR primary_topic_id = 'https://openalex.org/{t}' OR has(all_topics, '{t}') OR has(all_topics, 'https://openalex.org/{t}'))" for t in t_ids]
                clauses.append(f"({' AND '.join(and_clauses)})")
            else:
                quoted = ", ".join(f"'{t}'" for t in t_ids)
                quoted_urls = ", ".join(f"'https://openalex.org/{t}'" for t in t_ids)
                clauses.append(f"(topic_id IN ({quoted}) OR topic_id IN ({quoted_urls}) OR primary_topic_id IN ({quoted}) OR primary_topic_id IN ({quoted_urls}) OR hasAny(all_topics, [{quoted}]) OR hasAny(all_topics, [{quoted_urls}]))")

        # Revistas / Fuentes (Múltiples con OR)
        s_ids = filters.get('source_ids') or []
        if isinstance(s_ids, str):
            s_ids = [s.strip() for s in s_ids.split(',') if s.strip()]
        single_source = filters.get('source_id')
        if single_source and single_source not in s_ids:
            s_ids.append(single_source)

        s_ids = [str(s).split('/')[-1].strip() for s in s_ids if str(s).strip()]
        if s_ids:
            quoted = ", ".join(f"'{s}'" for s in s_ids)
            quoted_urls = ", ".join(f"'https://openalex.org/{s}'" for s in s_ids)
            clauses.append(f"(source_id IN ({quoted}) OR source_id IN ({quoted_urls}))")

        # Institución / ROR (Múltiples con OR / AND)
        inst_ids = filters.get('institution_ids') or []
        if isinstance(inst_ids, str):
            inst_ids = [i.strip() for i in inst_ids.split(',') if i.strip()]
        single_inst = filters.get('institution_id')
        if single_inst and single_inst not in inst_ids:
            inst_ids.append(single_inst)

        inst_ids = [str(i).split('/')[-1].strip() for i in inst_ids if str(i).strip()]
        if inst_ids:
            inst_logic = str(filters.get('institution_logic', 'OR')).strip().upper()
            if inst_logic == 'AND':
                and_clauses = [f"(has(institution_ids, '{i}') OR has(institution_ids, 'https://openalex.org/{i}') OR has(institution_rors, '{i}'))" for i in inst_ids]
                clauses.append(f"({' AND '.join(and_clauses)})")
            else:
                quoted = ", ".join(f"'{i}'" for i in inst_ids)
                quoted_urls = ", ".join(f"'https://openalex.org/{i}'" for i in inst_ids)
                clauses.append(f"(hasAny(institution_ids, [{quoted}]) OR hasAny(institution_ids, [{quoted_urls}]) OR hasAny(institution_rors, [{quoted}]))")

        # Autores / Investigadores (Múltiples con OR / AND)
        a_ids = filters.get('author_ids') or []
        if isinstance(a_ids, str):
            a_ids = [a.strip() for a in a_ids.split(',') if a.strip()]
        single_author = filters.get('author_id')
        if single_author and single_author not in a_ids:
            a_ids.append(single_author)

        a_ids = [str(a).split('/')[-1].strip() for a in a_ids if str(a).strip()]
        if a_ids:
            a_logic = str(filters.get('author_logic', 'OR')).strip().upper()
            if a_logic == 'AND':
                and_clauses = [f"(has(author_ids, '{a}') OR has(author_ids, 'https://openalex.org/{a}'))" for a in a_ids]
                clauses.append(f"({' AND '.join(and_clauses)})")
            else:
                quoted = ", ".join(f"'{a}'" for a in a_ids)
                quoted_urls = ", ".join(f"'https://openalex.org/{a}'" for a in a_ids)
                clauses.append(f"(hasAny(author_ids, [{quoted}]) OR hasAny(author_ids, [{quoted_urls}]))")

        # Países (Múltiples con OR / AND)
        country_codes = filters.get('country_codes') or []
        if isinstance(country_codes, str):
            country_codes = [c.strip() for c in country_codes.split(',') if c.strip()]
        single_country = filters.get('country_code')
        if single_country and single_country not in country_codes:
            country_codes.append(single_country)

        country_codes = [str(c).strip().upper() for c in country_codes if str(c).strip()]
        if country_codes:
            country_logic = str(filters.get('country_logic', 'OR')).strip().upper()
            if country_logic == 'AND':
                and_clauses = [f"(country_code = '{c}' OR has(country_codes, '{c}') OR has(all_country_codes, '{c}'))" for c in country_codes]
                clauses.append(f"({' AND '.join(and_clauses)})")
            else:
                quoted_codes = ", ".join(f"'{c}'" for c in country_codes)
                clauses.append(f"(country_code IN ({quoted_codes}) OR hasAny(country_codes, [{quoted_codes}]) OR hasAny(all_country_codes, [{quoted_codes}]))")

        # Tipos de Documento (work_types)
        w_types = filters.get('work_types') or filters.get('types') or []
        if isinstance(w_types, str):
            w_types = [t.strip() for t in w_types.split(',') if t.strip()]
        single_type = filters.get('type') or filters.get('work_type')
        if single_type and single_type not in w_types:
            w_types.append(single_type)

        w_types = [str(t).strip().lower() for t in w_types if str(t).strip() and str(t).lower() not in ('all', 'todos', 'any', '')]
        if w_types:
            quoted_types = ", ".join(f"'{t}'" for t in w_types)
            clauses.append(f"lower(type) IN ({quoted_types})")

        # Acceso Abierto
        is_oa = filters.get('is_oa')
        if is_oa is not None:
            val = 1 if is_oa in (1, True, 'true', '1', 'True') else 0
            clauses.append(f"is_oa = {val}")

        oa_status = filters.get('oa_status')
        if oa_status and str(oa_status).lower() not in ('all', 'todos', 'any', ''):
            clean_oa = str(oa_status).strip().lower()
            clauses.append(f"lower(oa_status) = '{clean_oa}'")

        # DOAJ
        if filters.get('is_doaj'):
            clauses.append("(is_doaj_indexed = 1 OR journal_is_in_doaj = 1)")

        # Core journal
        if filters.get('is_core'):
            clauses.append("(is_core_journal = 1 OR journal_is_core = 1)")

        return clauses

    def count_from_filters(self, filters: Dict[str, Any]) -> int:
        clauses = self._build_where_clauses(filters)
        where_sql = " AND ".join(clauses) if clauses else "1=1"
        sql = f"SELECT count(*) as total FROM works_flat WHERE {where_sql}"
        df = self.engine.query_df(sql)
        if len(df) > 0 and 'total' in df.columns:
            return int(df.iloc[0]['total'])
        return 0

    def preview_from_filters(self, filters: Dict[str, Any], limit: int = 25, offset: int = 0) -> Dict[str, Any]:
        clauses = self._build_where_clauses(filters)
        where_sql = " AND ".join(clauses) if clauses else "1=1"
        
        # Conteo total
        count_sql = f"SELECT count(*) as total FROM works_flat WHERE {where_sql}"
        df_count = self.engine.query_df(count_sql)
        total_works = int(df_count.iloc[0]['total']) if len(df_count) > 0 else 0

        # Muestra ordenada por citas descendentes
        cols = [
            'id', 'doi', 'title', 'publication_year', 'cited_by_count', 'fwci',
            'is_oa', 'oa_status', 'source_id', 'topic_id', 'topic', 'field',
            'author_names', 'institution_names'
        ]
        cols_sql = ", ".join(cols)
        data_sql = f"SELECT {cols_sql} FROM works_flat WHERE {where_sql} ORDER BY cited_by_count DESC LIMIT {limit} OFFSET {offset}"
        df_data = self.engine.query_df(data_sql)

        records = []
        if len(df_data) > 0:
            for _, r in df_data.iterrows():
                auths = r['author_names'] if isinstance(r['author_names'], list) else []
                insts = r['institution_names'] if isinstance(r['institution_names'], list) else []
                records.append({
                    'id': str(r['id']).replace('https://openalex.org/', ''),
                    'doi': str(r['doi']) if pd.notna(r['doi']) else '',
                    'title': str(r['title']) if pd.notna(r['title']) else 'Sin título',
                    'publication_year': int(r['publication_year']) if pd.notna(r['publication_year']) else 0,
                    'cited_by_count': int(r['cited_by_count']) if pd.notna(r['cited_by_count']) else 0,
                    'fwci': float(r['fwci']) if pd.notna(r['fwci']) else 0.0,
                    'is_oa': bool(r['is_oa']),
                    'oa_status': str(r['oa_status']) if pd.notna(r['oa_status']) else 'closed',
                    'source_id': str(r['source_id']).replace('https://openalex.org/', '') if pd.notna(r['source_id']) else '',
                    'topic': str(r['topic']) if pd.notna(r['topic']) else '',
                    'field': str(r['field']) if pd.notna(r['field']) else '',
                    'authors': auths[:4],
                    'institutions': insts[:3]
                })

        return {
            'total': total_works,
            'limit': limit,
            'offset': offset,
            'page': (offset // limit) + 1 if limit > 0 else 1,
            'total_pages': (total_works + limit - 1) // limit if limit > 0 else 1,
            'results': records
        }

    def from_filters(self, filters: Dict[str, Any], limit: Optional[int] = None) -> pd.DataFrame:
        clauses = self._build_where_clauses(filters)
        where_sql = " AND ".join(clauses) if clauses else "1=1"
        limit_sql = f" LIMIT {int(limit)}" if limit and int(limit) > 0 else ""
        query = f"SELECT * FROM works_flat WHERE {where_sql} ORDER BY cited_by_count DESC{limit_sql}"
        df = self.engine.query_df(query)
        return self._normalize_dataframe(df)

    def _normalize_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        if df is None or len(df) == 0:
            return pd.DataFrame(columns=STANDARD_COLUMNS)
        
        if 'id' in df.columns:
            df['id'] = df['id'].astype(str).str.replace('https://openalex.org/', '', regex=False)
        elif 'Work ID' in df.columns:
            df['id'] = df['Work ID'].astype(str).str.replace('https://openalex.org/', '', regex=False)

        num_cols = {
            'publication_year': ('Year', 0, int),
            'cited_by_count': ('Citation count', 0, int),
            'fwci': ('FWCI', 0.0, float),
            'percentile': ('Citation percentile by subfield', 0.0, float),
            'is_top_10': ('Top 10% cited', 0, int),
            'is_top_1': ('Top 1% cited', 0, int),
            'is_oa': ('Is oa', 0, int),
            'referenced_works_count': ('Reference count', 0, int),
            'is_retracted': ('Retracted', 0, int),
            'is_paratext': ('Is paratext', 0, int),
            'is_doaj_indexed': ('DOAJ', 0, int),
            'is_core_journal': ('CWTS core', 0, int),
            'has_repository_fulltext': ('Has repository fulltext', 0, int),
            'apc_paid_usd': ('Estimated APC paid', 0.0, float),
            'apc_list_usd': ('APC sum', 0.0, float)
        }

        for col, (alt_col, default_val, dtype) in num_cols.items():
            if col not in df.columns and alt_col in df.columns:
                df[col] = df[alt_col]
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(default_val).astype(dtype)
            else:
                df[col] = default_val

        if 'percentile' in df.columns and len(df) > 0:
            if df['percentile'].max() <= 1.0 and df['percentile'].max() > 0:
                df['percentile'] = df['percentile'] * 100.0

        for col in STANDARD_COLUMNS:
            if col not in df.columns:
                df[col] = '' if 'name' in col or 'id' in col or 'title' in col else None

        return df
