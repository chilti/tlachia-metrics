"""
TlachIA Metrics - openalex_indicators_engine
core/clickhouse_pushdown_engine.py
Motor de Agregación Gobernada Pushdown en ClickHouse:
Ejecuta el cálculo masivo de los 28+ indicadores cienciométricos, económicos y de acceso abierto
directamente en el motor de ClickHouse para corpus >= 2,000 publicaciones, garantizando:
- max_threads = 4 (sin saturar CPU)
- max_memory_usage = 8GB
- max_bytes_before_external_group_by = 4GB
- Cero JOINs masivos (uso de ARRAY JOIN local en works_flat)
"""
import logging
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional, Tuple, Union
from pathlib import Path

from .gentle_query_engine import GentleQueryEngine
from ..aggregators.base_aggregator import BaseAggregator

logger = logging.getLogger(__name__)

# Lista canónica de países del Sur Global para SQL
GLOBAL_SOUTH_SQL_LIST = "', '".join([
    'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'UY', 'VE', 'EC', 'BO', 'PY', 'CU', 'DO', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'JM', 'TT',
    'ZA', 'EG', 'NG', 'KE', 'GH', 'ET', 'TZ', 'UG', 'DZ', 'MA', 'TN', 'SN', 'CM', 'CI', 'ZW',
    'IN', 'ID', 'PK', 'BD', 'PH', 'VN', 'TH', 'MY', 'IR', 'IQ', 'JO', 'LB', 'LK', 'NP', 'KZ', 'UZ'
])

# Mapeo SQL columnar para Objetivos de Desarrollo Sostenible (ODS / SDG de la ONU)
SDG_TRANSFORM_SQL = """transform(
    splitByChar('/', sdg_item)[-1],
    ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17'],
    [
        'SDG 01: No Poverty',
        'SDG 02: Zero Hunger',
        'SDG 03: Good Health and Well-being',
        'SDG 04: Quality Education',
        'SDG 05: Gender Equality',
        'SDG 06: Clean Water and Sanitation',
        'SDG 07: Affordable and Clean Energy',
        'SDG 08: Decent Work and Economic Growth',
        'SDG 09: Industry, Innovation and Infrastructure',
        'SDG 10: Reduced Inequalities',
        'SDG 11: Sustainable Cities and Communities',
        'SDG 12: Responsible Consumption and Production',
        'SDG 13: Climate Action',
        'SDG 14: Life Below Water',
        'SDG 15: Life on Land',
        'SDG 16: Peace, Justice and Strong Institutions',
        'SDG 17: Partnerships for the Goals'
    ],
    sdg_item
)"""

class ClickHousePushdownEngine:
    """
    Motor analítico de alto rendimiento que delega las operaciones de agregación
    multidimensional de corpus a ClickHouse mediante SQL columnar vectorizado.
    """
    _sources_cache: Optional[Dict[str, str]] = None

    def __init__(self, query_engine: Optional[GentleQueryEngine] = None):
        self.query_engine = query_engine or GentleQueryEngine()
        self.client = self.query_engine.get_client()
        self.formatter = BaseAggregator(entity_column='id')

    def _get_sources_map(self) -> Dict[str, str]:
        """Carga en caché el diccionario (id -> display_name) de fuentes para enriquecer nombres sin JOINs."""
        if ClickHousePushdownEngine._sources_cache is None:
            try:
                res = self.client.query("SELECT id, display_name FROM rag.sources WHERE display_name != ''")
                ClickHousePushdownEngine._sources_cache = dict(res.result_rows)
            except Exception as err:
                logger.warning(f"No se pudo cargar mapeo de rag.sources: {err}")
                ClickHousePushdownEngine._sources_cache = {}
        return ClickHousePushdownEngine._sources_cache

    def _enrich_entity_names(self, df: pd.DataFrame, entity_type: str) -> pd.DataFrame:
        """Enriquece los identificadores de entidad con nombres descriptivos legibles."""
        if df.empty or 'Name' not in df.columns:
            return df
        e = entity_type.lower().replace(" ", "_")
        if e in ('publication_sources', 'sources', 'revistas'):
            s_map = self._get_sources_map()
            if s_map:
                df['Name'] = df['Name'].map(s_map).fillna(df['Name'])
        return df

    def setup_corpus_from_filters(self, where_sql: str, limit: Optional[int] = None, temp_table_name: Optional[str] = None) -> Tuple[str, int]:
        """
        Para corpus grandes (modo filtros): retorna directamente la cláusula WHERE normalizada y el conteo total.
        Ya NO crea tabla temporal — evita materializar el hash set de IDs que provoca Code 241 MEMORY_LIMIT_EXCEEDED.
        El motor de agregación usará la cláusula WHERE directamente en cada query de ClickHouse.
        Retorna (corpus_filter_string, total_works).
        """
        clean_where = where_sql.strip() if where_sql and where_sql.strip() else "1=1"
        limit_sql = f" LIMIT {int(limit)}" if limit and int(limit) > 0 else ""

        # Obtener conteo total sin descargar IDs
        count_sql = f"SELECT count() FROM rag.works_flat WHERE {clean_where}{limit_sql}"
        logger.info(f"Contando corpus con filtros directos (sin tabla temporal)...")
        res = self.client.query(count_sql)
        total = int(res.result_rows[0][0]) if res.result_rows else 0
        logger.info(f"Corpus filtrado: {total} obras. Usando WHERE directo en agregaciones (sin subquery IN).")

        # El corpus_filter es la cláusula WHERE directa — la pasamos a todos los agregadores
        corpus_filter = f"({clean_where})"
        if limit_sql:
            # Con LIMIT no podemos simplemente poner el WHERE porque el limite aplica a registros
            # Usamos una subquery de IDs solo cuando hay LIMIT (corpus acotado)
            import uuid
            token = uuid.uuid4().hex[:12]
            temp_table_name = f"rag.tmp_active_corpus_{token}"
            self.client.command(f"DROP TABLE IF EXISTS {temp_table_name}")
            create_sql = f"CREATE TABLE {temp_table_name} (id String) ENGINE = Memory AS SELECT id FROM rag.works_flat WHERE {clean_where}{limit_sql}"
            self.client.command(create_sql)
            corpus_filter = f"id IN (SELECT id FROM {temp_table_name})"
            logger.info(f"Corpus acotado (LIMIT): tabla temporal {temp_table_name} con {total} obras.")
        return corpus_filter, total

    def setup_corpus_context(self, work_ids: List[str], temp_table_name: Optional[str] = None) -> str:
        """
        Crea una tabla en memoria (ENGINE = Memory) con los IDs del corpus.
        Garantiza consistencia absoluta de lectura a través de conexiones HTTP sin pérdida de sesión.
        """
        import uuid
        if not temp_table_name:
            token = uuid.uuid4().hex[:12]
            temp_table_name = f"rag.tmp_active_corpus_{token}"

        clean_ids = []
        seen = set()
        for wid in work_ids:
            if not wid:
                continue
            raw = str(wid).strip()
            val = raw.split('/')[-1]
            full_id = f"https://openalex.org/{val}"
            if full_id not in seen:
                seen.add(full_id)
                clean_ids.append([full_id])

        self.client.command(f"DROP TABLE IF EXISTS {temp_table_name}")
        self.client.command(f"CREATE TABLE {temp_table_name} (id String) ENGINE = Memory")
        if clean_ids:
            self.client.insert(temp_table_name, clean_ids, column_names=['id'])
        return temp_table_name

    def release_corpus_context(self, corpus_filter: str):
        """Libera la tabla temporal si el corpus_filter apunta a una (modo work_ids/upload)."""
        if not corpus_filter:
            return
        # Solo hay tabla temporal que liberar si el filtro es un subquery IN con tabla tmp
        if 'tmp_active_corpus_' in corpus_filter:
            import re
            tables = re.findall(r'rag\.tmp_active_corpus_[a-f0-9]+', corpus_filter)
            for tbl in tables:
                try:
                    self.client.command(f"DROP TABLE IF EXISTS {tbl}")
                    logger.info(f"Tabla temporal liberada: {tbl}")
                except Exception as e:
                    logger.warning(f"Error liberando tabla {tbl}: {e}")

    def _corpus_where_clause(self, corpus_filter: str, extra: str = "") -> str:
        """
        Construye la cláusula WHERE completa a partir de corpus_filter:
        - Si es un subquery IN (modo work_ids/upload): "id IN (SELECT ...)"
        - Si es WHERE directo (modo filters): la cláusula tal como viene
        Añade condiciones extra opcionales (filtros de año, entidad vacía, etc.)
        """
        extra_sql = f" AND {extra}" if extra else ""
        return f"{corpus_filter}{extra_sql}"

    def _get_metrics_select_clause(self) -> str:
        """
        Genera la cláusula SELECT de los 28 indicadores canónicos de TlachIA Metrics.
        """
        return f"""
            count() AS num_documents,
            sum(cited_by_count) AS times_cited,
            round(sum(cited_by_count) / count(), 2) AS cites_per_doc,
            round(countIf(cited_by_count > 0) * 100.0 / count(), 2) AS pct_docs_cited,
            round(avg(fwci), 2) AS fwci_avg,
            round(avg(percentile), 1) AS avg_percentile,
            countIf(is_top_10 = 1 OR percentile >= 90.0) AS docs_top_10,
            round(countIf(is_top_10 = 1 OR percentile >= 90.0) * 100.0 / count(), 2) AS pct_top_10,
            countIf(is_top_1 = 1 OR percentile >= 99.0) AS docs_top_1,
            round(countIf(is_top_1 = 1 OR percentile >= 99.0) * 100.0 / count(), 3) AS pct_top_1,
            countIf(is_oa = 1 OR lower(oa_status) IN ('gold', 'diamond', 'green', 'hybrid', 'bronze')) * 100.0 / count() AS pct_oa_total,
            round(countIf(lower(oa_status) = 'gold') * 100.0 / count(), 1) AS pct_oa_gold,
            round(countIf(lower(oa_status) = 'hybrid') * 100.0 / count(), 1) AS pct_oa_hybrid,
            round(countIf(lower(oa_status) = 'diamond') * 100.0 / count(), 1) AS pct_oa_diamond,
            round(countIf(lower(oa_status) = 'green') * 100.0 / count(), 1) AS pct_oa_green,
            round(countIf(lower(oa_status) = 'bronze') * 100.0 / count(), 1) AS pct_oa_bronze,
            round(countIf(lower(oa_status) = 'closed') * 100.0 / count(), 1) AS pct_oa_closed,
            round(countIf(is_doaj_indexed = 1) * 100.0 / count(), 1) AS pct_doaj,
            round(countIf(is_core_journal = 1) * 100.0 / count(), 1) AS pct_cwts_core,
            round(countIf(length(all_country_codes) > 1) * 100.0 / count(), 1) AS pct_international,
            round(countIf(length(all_country_codes) <= 1) * 100.0 / count(), 1) AS pct_domestic,
            round(countIf(has(institution_types, 'company')) * 100.0 / count(), 1) AS pct_industry,
            round(countIf(length(all_country_codes) > 1 AND arrayAll(c -> has(['{GLOBAL_SOUTH_SQL_LIST}'], c), arrayFilter(x -> x != '', all_country_codes))) * 100.0 / count(), 1) AS pct_global_south,
            round(sum(apc_paid_usd), 2) AS estimated_apc_paid_usd,
            round(sum(apc_paid_usd) / count(), 2) AS avg_apc_per_doc_usd,
            round(countIf(lower(oa_status) = 'diamond') * 1800.0, 2) AS estimated_diamond_savings_usd,
            round(countIf(is_retracted = 1) * 100.0 / count(), 2) AS pct_retracted,
            round(countIf(is_paratext = 1) * 100.0 / count(), 2) AS pct_paratext
        """

    def aggregate_corpus_baseline(self, corpus_filter: str, start_year: Optional[int] = None, end_year: Optional[int] = None) -> pd.DataFrame:
        """Calcula los indicadores globales de la línea base del corpus."""
        year_filter = f"publication_year BETWEEN {start_year} AND {end_year}" if start_year and end_year else ""
        where = self._corpus_where_clause(corpus_filter, year_filter)

        sql = f"""
        SELECT 
            'Corpus Completo' AS Name,
            1 AS Rank,
            {self._get_metrics_select_clause()}
        FROM rag.works_flat
        WHERE {where}
        SETTINGS max_threads = 4, max_memory_usage = 8000000000
        """
        df = self.client.query_df(sql)
        if df.empty:
            return pd.DataFrame()

        # Calcular H-Index e i10-Index vectorialmente
        h_idx, i10_idx = self._compute_h_and_i10_indexes(corpus_filter, year_filter=year_filter)
        df['h_index'] = h_idx
        df['i10_index'] = i10_idx

        return self.formatter._format_output_columns(df, is_trend=False)

    def aggregate_corpus_trend(self, corpus_filter: str) -> pd.DataFrame:
        """Calcula la serie temporal anual del corpus completo con tasas de crecimiento."""
        where = self._corpus_where_clause(corpus_filter, "publication_year > 0")
        sql = f"""
        SELECT 
            'Corpus Completo' AS Name,
            publication_year AS `Publication Year`,
            {self._get_metrics_select_clause()}
        FROM rag.works_flat
        WHERE {where}
        GROUP BY publication_year
        ORDER BY publication_year ASC
        SETTINGS max_threads = 4, max_memory_usage = 8000000000
        """
        df = self.client.query_df(sql)
        if df.empty:
            return pd.DataFrame()

        # Calcular H-Index por año
        h_map = self._compute_h_index_by_group(corpus_filter, group_col="publication_year")
        df['h_index'] = df['Publication Year'].map(h_map).fillna(0).astype(int)
        df['i10_index'] = 0

        # Formatear columnas estándar
        base_df = self.formatter._format_output_columns(df, is_trend=True)
        
        # Calcular tasas de crecimiento anual
        base_df['Δ% Documents (Annual)'] = base_df['Documents'].pct_change() * 100.0
        base_df['Δ% Times Cited (Annual)'] = base_df['Times Cited'].pct_change() * 100.0
        base_df['Δ% Documents (Annual)'] = base_df['Δ% Documents (Annual)'].round(2)
        base_df['Δ% Times Cited (Annual)'] = base_df['Δ% Times Cited (Annual)'].round(2)

        front = ['Publication Year', 'Documents', 'Δ% Documents (Annual)', 'Times Cited', 'Δ% Times Cited (Annual)', 'Citation Impact', '% Docs Cited', 'Field-Weighted Citation Impact (FWCI)']
        ordered = [c for c in front if c in base_df.columns] + [c for c in base_df.columns if c not in front and c != 'Rank' and c != 'Name']
        return base_df[['Name'] + ordered]

    def aggregate_entity_table(self, corpus_filter: str, entity_type: str, min_docs: int = 1,
                               start_year: Optional[int] = None, end_year: Optional[int] = None,
                               limit: int = 5000) -> pd.DataFrame:
        """
        Calcula la tabla de indicadores para una entidad específica directamente en ClickHouse.
        Usa corpus_filter como cláusula WHERE directa (modo filters) o subquery IN (modo work_ids/upload).
        """
        array_expr, name_expr, where_extra = self._get_entity_sql_binding(entity_type)
        year_filter = f"publication_year BETWEEN {start_year} AND {end_year}" if start_year and end_year else ""
        extra = " AND ".join(filter(None, [year_filter, where_extra.lstrip('AND ').strip()]))
        where = self._corpus_where_clause(corpus_filter, extra)

        sql = f"""
        SELECT 
            {name_expr} AS Name,
            {self._get_metrics_select_clause()}
        FROM rag.works_flat
        {array_expr}
        WHERE {where}
        GROUP BY Name
        HAVING num_documents >= {min_docs}
        ORDER BY num_documents DESC
        LIMIT {limit}
        SETTINGS max_threads = 4, max_memory_usage = 8000000000, max_bytes_before_external_group_by = 4000000000
        """
        df = self.client.query_df(sql)
        if df.empty:
            return pd.DataFrame()

        df = self._enrich_entity_names(df, entity_type)
        df['Rank'] = range(1, len(df) + 1)
        df['h_index'] = 0
        df['i10_index'] = 0

        return self.formatter._format_output_columns(df, is_trend=False)

    def aggregate_entity_trend(self, corpus_filter: str, entity_type: str, limit: int = 5000) -> pd.DataFrame:
        """
        Calcula la serie temporal anual (Trend) de una entidad directamente en ClickHouse.
        """
        array_expr, name_expr, where_extra = self._get_entity_sql_binding(entity_type)
        extra = " AND ".join(filter(None, ["publication_year > 0", where_extra.lstrip('AND ').strip()]))
        where = self._corpus_where_clause(corpus_filter, extra)
        sql = f"""
        SELECT 
            {name_expr} AS Name,
            publication_year AS `Publication Year`,
            {self._get_metrics_select_clause()}
        FROM rag.works_flat
        {array_expr}
        WHERE {where}
        GROUP BY Name, publication_year
        ORDER BY Name ASC, publication_year ASC
        LIMIT {limit}
        SETTINGS max_threads = 4, max_memory_usage = 8000000000, max_bytes_before_external_group_by = 4000000000
        """
        df = self.client.query_df(sql)
        if df.empty:
            return pd.DataFrame()

        df = self._enrich_entity_names(df, entity_type)
        df['h_index'] = 0
        df['i10_index'] = 0

        return self.formatter._format_output_columns(df, is_trend=True)

    def _get_entity_sql_binding(self, entity_type: str) -> Tuple[str, str, str]:
        """Mapea el tipo de entidad cienciométrica al campo correspondiente en works_flat."""
        e = entity_type.lower().replace(" ", "_")
        if e in ('locations', 'paises'):
            return "ARRAY JOIN arrayDistinct(country_codes) AS c", "c", "AND c != ''"
        elif e in ('locations_subnational',):
            return "ARRAY JOIN arrayDistinct(country_codes) AS c", "c", "AND c != ''"
        elif e in ('organizations', 'instituciones'):
            return "ARRAY JOIN arrayDistinct(institution_names) AS inst", "inst", "AND inst != ''"
        elif e in ('organizations_colab',):
            return "ARRAY JOIN arrayDistinct(institution_names) AS inst", "inst", "AND inst != ''"
        elif e in ('sector_types', 'sectores'):
            return "ARRAY JOIN arrayDistinct(institution_types) AS st", "st", "AND st != ''"
        elif e in ('researchers', 'autores'):
            return "ARRAY JOIN arrayDistinct(author_names) AS a", "a", "AND a != ''"
        elif e in ('publication_sources', 'sources', 'revistas'):
            return "", "source_id", "AND source_id != ''"
        elif e in ('funding_agencies', 'funders'):
            return "ARRAY JOIN arrayDistinct(funder_names) AS f", "f", "AND f != ''"
        elif e in ('research_areas_domain', 'domain'):
            return "", "domain_name", "AND domain_name != ''"
        elif e in ('research_areas_field', 'field'):
            return "", "field_name", "AND field_name != ''"
        elif e in ('research_areas_subfield', 'subfield'):
            return "", "subfield_name", "AND subfield_name != ''"
        elif e in ('research_areas_topic', 'topic'):
            return "", "multiIf(topic != '', topic, topic_id)", "AND topic_id != ''"
        elif e in ('research_areas_sdg', 'sdg'):
            return "ARRAY JOIN arrayDistinct(sdgs) AS sdg_item", SDG_TRANSFORM_SQL, "AND sdg_item != ''"
        elif e in ('concepts',):
            return "ARRAY JOIN arrayDistinct(concepts) AS cp", "cp", "AND cp != ''"
        elif e in ('keywords',):
            return "ARRAY JOIN arrayDistinct(keywords) AS kw", "kw", "AND kw != ''"
        elif e in ('economic_apc_breakdown', 'economic_apc'):
            return "", "oa_status", "AND oa_status != ''"
        return "", "id", ""

    def _compute_h_and_i10_indexes(self, corpus_filter: str, year_filter: str = "") -> Tuple[int, int]:
        """Calcula el H-index e i10-index sobre el conjunto activo en ClickHouse."""
        extra = year_filter if year_filter else ""
        where = self._corpus_where_clause(corpus_filter, extra)
        sql = f"""
        SELECT 
            arrayCount((c, i) -> c >= i, arrayReverseSort(groupArray(cited_by_count)), range(1, length(groupArray(cited_by_count)) + 1)) AS h_idx,
            countIf(cited_by_count >= 10) AS i10_idx
        FROM rag.works_flat
        WHERE {where}
        SETTINGS max_threads = 4
        """
        try:
            res = self.client.query_df(sql)
            if not res.empty:
                return int(res['h_idx'].iloc[0]), int(res['i10_idx'].iloc[0])
        except Exception as err:
            logger.warning(f"No se pudo calcular h_index en ClickHouse: {err}")
        return 0, 0

    def _compute_h_index_by_group(self, corpus_filter: str, group_col: str = "publication_year") -> Dict[Any, int]:
        """Calcula el H-index por grupo (ej. por año)."""
        where = self._corpus_where_clause(corpus_filter, f"{group_col} > 0")
        sql = f"""
        SELECT 
            {group_col} AS grp,
            arrayCount((c, i) -> c >= i, arrayReverseSort(groupArray(cited_by_count)), range(1, length(groupArray(cited_by_count)) + 1)) AS h_idx
        FROM rag.works_flat
        WHERE {where}
        GROUP BY grp
        SETTINGS max_threads = 4
        """
        try:
            res = self.client.query_df(sql)
            if not res.empty:
                return dict(zip(res['grp'], res['h_idx']))
        except Exception as err:
            logger.warning(f"No se pudo calcular h_index por año: {err}")
        return {}

    def build_multi_period_expression(self, periods: List[Tuple[int, int]]) -> str:
        """Genera la expresión SQL multiIf para clasificar cada obra en su ventana temporal."""
        cases = []
        for s_yr, e_yr in periods:
            cases.append(f"publication_year BETWEEN {int(s_yr)} AND {int(e_yr)}, '{int(s_yr)}-{int(e_yr)}'")
        return f"multiIf({', '.join(cases)}, '')"

    def aggregate_corpus_multi_period(self, corpus_filter: str, periods: List[Tuple[int, int]]) -> Dict[str, pd.DataFrame]:
        """
        Calcula los indicadores macro de la línea base del corpus para múltiples periodos temporales
        en una sola consulta vectorizada (Single-Pass Multi-Period).
        """
        if not periods:
            return {}

        multi_if_expr = self.build_multi_period_expression(periods)
        where = self._corpus_where_clause(corpus_filter, "Period != ''")
        sql = f"""
        SELECT 
            'Corpus Completo' AS Name,
            1 AS Rank,
            {multi_if_expr} AS Period,
            {self._get_metrics_select_clause()}
        FROM rag.works_flat
        WHERE {where}
        GROUP BY Period
        ORDER BY Period ASC
        SETTINGS max_threads = 4, max_memory_usage = 8000000000
        """
        df = self.client.query_df(sql)

        # Calcular H-Index e i10-Index agrupados por periodo en ClickHouse
        h_where = self._corpus_where_clause(corpus_filter, "grp != ''")
        h_sql = f"""
        SELECT 
            {multi_if_expr} AS grp,
            arrayCount((c, i) -> c >= i, arrayReverseSort(groupArray(cited_by_count)), range(1, length(groupArray(cited_by_count)) + 1)) AS h_idx,
            countIf(cited_by_count >= 10) AS i10_idx
        FROM rag.works_flat
        WHERE {h_where}
        GROUP BY grp
        SETTINGS max_threads = 4
        """
        h_map = {}
        i10_map = {}
        try:
            h_res = self.client.query_df(h_sql)
            if not h_res.empty:
                h_map = dict(zip(h_res['grp'], h_res['h_idx']))
                i10_map = dict(zip(h_res['grp'], h_res['i10_idx']))
        except Exception as err:
            logger.warning(f"No se pudo calcular h_index/i10_index por periodo: {err}")

        result_dict = {}
        for s_yr, e_yr in periods:
            p_label = f"{s_yr}-{e_yr}"
            if df.empty:
                result_dict[p_label] = pd.DataFrame()
                continue
            p_sub = df[df['Period'] == p_label].copy()
            if p_sub.empty:
                result_dict[p_label] = pd.DataFrame()
            else:
                p_sub['h_index'] = int(h_map.get(p_label, 0))
                p_sub['i10_index'] = int(i10_map.get(p_label, 0))
                p_sub = p_sub.drop(columns=['Period'])
                result_dict[p_label] = self.formatter._format_output_columns(p_sub, is_trend=False)

        return result_dict

    def aggregate_entity_multi_period(self, corpus_filter: str, entity_type: str, periods: List[Tuple[int, int]],
                                      min_docs: int = 1, limit_per_period: int = 5000) -> Dict[str, pd.DataFrame]:
        """
        Calcula las tablas de indicadores para una entidad específica a través de múltiples periodos temporales
        en una sola consulta vectorizada (Single-Pass Multi-Period) usando LIMIT N BY Period.
        """
        if not periods:
            return {}

        array_expr, name_expr, where_extra = self._get_entity_sql_binding(entity_type)
        multi_if_expr = self.build_multi_period_expression(periods)
        extra = " AND ".join(filter(None, ["Period != ''", where_extra.lstrip('AND ').strip()]))
        where = self._corpus_where_clause(corpus_filter, extra)

        sql = f"""
        SELECT 
            {name_expr} AS Name,
            {multi_if_expr} AS Period,
            {self._get_metrics_select_clause()}
        FROM rag.works_flat
        {array_expr}
        WHERE {where}
        GROUP BY Name, Period
        HAVING num_documents >= {min_docs}
        ORDER BY Period ASC, num_documents DESC
        LIMIT {limit_per_period} BY Period
        SETTINGS max_threads = 4, max_memory_usage = 8000000000, max_bytes_before_external_group_by = 4000000000
        """
        df = self.client.query_df(sql)
        if not df.empty:
            df = self._enrich_entity_names(df, entity_type)

        result_dict = {}
        for s_yr, e_yr in periods:
            p_label = f"{s_yr}-{e_yr}"
            if df.empty:
                result_dict[p_label] = pd.DataFrame()
                continue
            p_sub = df[df['Period'] == p_label].copy()
            if p_sub.empty:
                result_dict[p_label] = pd.DataFrame()
            else:
                p_sub['Rank'] = range(1, len(p_sub) + 1)
                p_sub['h_index'] = 0
                p_sub['i10_index'] = 0
                p_sub = p_sub.drop(columns=['Period'])
                result_dict[p_label] = self.formatter._format_output_columns(p_sub, is_trend=False)

        return result_dict
