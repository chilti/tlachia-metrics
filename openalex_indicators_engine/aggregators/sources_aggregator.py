"""
TlachIA Metrics - openalex_indicators_engine
aggregators/sources_aggregator.py
Agregación por Revistas Científicas y Fuentes de Publicación.
"""
import logging
import pandas as pd
from typing import Dict
from .base_aggregator import BaseAggregator

logger = logging.getLogger(__name__)

class SourcesAggregator(BaseAggregator):
    """
    Agrega por revista/fuente usando source_id como clave de agrupación,
    pero muestra source_name (nombre legible de la revista) como etiqueta.
    Si source_name no está en el DataFrame o viene vacío, consulta la tabla
    `sources` de ClickHouse para resolver el display_name.
    """
    def __init__(self):
        super().__init__(entity_column='source_id', entity_name_column='source_name')
        self._lookup_cache: Dict[str, str] = {}

    def _build_source_lookup(self, df: pd.DataFrame) -> Dict[str, str]:
        """Construye un diccionario de source_id -> display_name."""
        id_to_name: Dict[str, str] = dict(self._lookup_cache)

        # 1. Extraer nombres disponibles directamente del DataFrame
        if 'source_name' in df.columns:
            for sid, sname in zip(df['source_id'], df['source_name']):
                sid_str = str(sid).strip() if pd.notna(sid) else ''
                sname_str = str(sname).strip() if pd.notna(sname) else ''
                if sid_str and sname_str and sname_str not in ('', 'nan', 'None'):
                    id_to_name[sid_str] = sname_str
                    id_to_name[sid_str.replace('https://openalex.org/', '')] = sname_str

        # 2. Identificar source_ids que aún no tienen nombre resuelto
        missing_ids = set()
        for sid in df['source_id'].dropna().unique():
            sid_str = str(sid).strip()
            if sid_str and sid_str not in ('', 'nan', 'None'):
                short = sid_str.replace('https://openalex.org/', '')
                if sid_str not in id_to_name and short not in id_to_name:
                    missing_ids.add(sid_str)
                    missing_ids.add(short)
                    missing_ids.add(f"https://openalex.org/{short}")

        # 3. Consultar ClickHouse para los IDs faltantes
        if missing_ids:
            try:
                from ..core.gentle_query_engine import GentleQueryEngine
                qe = GentleQueryEngine()
                clean_list = list(missing_ids)
                chunk_size = 500
                for i in range(0, len(clean_list), chunk_size):
                    chunk = clean_list[i:i+chunk_size]
                    quoted = ", ".join(f"'{s}'" for s in chunk)
                    sql = f"SELECT id, display_name FROM sources WHERE id IN ({quoted}) AND display_name != ''"
                    sources_df = qe.query_df(sql)
                    if len(sources_df) > 0:
                        for _, row in sources_df.iterrows():
                            s_id = str(row['id']).strip()
                            s_name = str(row['display_name']).strip()
                            if s_id and s_name:
                                id_to_name[s_id] = s_name
                                short = s_id.replace('https://openalex.org/', '')
                                id_to_name[short] = s_name
                                id_to_name[f"https://openalex.org/{short}"] = s_name
            except Exception as e:
                logger.warning(f"Error consultando nombres de fuentes en ClickHouse: {e}")

        self._lookup_cache.update(id_to_name)
        return id_to_name

    def _resolve_name(self, source_id: str, id_to_name: Dict[str, str]) -> str:
        """Obtiene el nombre de la revista para un source_id dado."""
        s = str(source_id).strip()
        if s in id_to_name:
            return id_to_name[s]
        short = s.replace('https://openalex.org/', '')
        if short in id_to_name:
            return id_to_name[short]
        return short

    def _aggregate_dataset(self, df: pd.DataFrame, min_docs: int = 1) -> pd.DataFrame:
        """Agrega el dataset resolviendo el nombre legible de cada revista."""
        if df is None or len(df) == 0:
            return pd.DataFrame()

        from ..core.metrics_base import calculate_summary_indicators

        exploded_df = self._explode_entity(df)
        if len(exploded_df) == 0:
            return pd.DataFrame()

        id_to_name = self._build_source_lookup(exploded_df)

        rows = []
        for ent_val, group in exploded_df.groupby(self.entity_column):
            if len(group) < min_docs or not ent_val or str(ent_val).strip() in ('', 'nan', 'None'):
                continue
            display_name = self._resolve_name(str(ent_val), id_to_name)
            metrics = calculate_summary_indicators(group, entity_name=display_name)
            metrics['Name'] = display_name
            rows.append(metrics)

        if not rows:
            return pd.DataFrame()

        res_df = pd.DataFrame(rows)
        res_df = res_df.sort_values(by='num_documents', ascending=False).reset_index(drop=True)
        res_df['Rank'] = range(1, len(res_df) + 1)
        return self._format_output_columns(res_df, is_trend=False)

    def aggregate_trend(self, df: pd.DataFrame, min_docs_per_year: int = 1) -> pd.DataFrame:
        """Agrega la serie temporal anual con el nombre legible de cada revista."""
        if df is None or len(df) == 0:
            return pd.DataFrame()

        from ..core.metrics_base import calculate_summary_indicators

        exploded_df = self._explode_entity(df)
        if len(exploded_df) == 0:
            return pd.DataFrame()

        id_to_name = self._build_source_lookup(exploded_df)

        rows = []
        for (ent_val, year), group in exploded_df.groupby([self.entity_column, 'publication_year']):
            if len(group) < min_docs_per_year or not ent_val or str(ent_val).strip() in ('', 'nan', 'None'):
                continue
            display_name = self._resolve_name(str(ent_val), id_to_name)
            metrics = calculate_summary_indicators(group, entity_name=display_name)
            metrics['Name'] = display_name
            metrics['Publication Year'] = int(year)
            rows.append(metrics)

        if not rows:
            return pd.DataFrame()

        res_df = pd.DataFrame(rows)
        res_df = res_df.sort_values(by=['Name', 'Publication Year'], ascending=[True, True])
        return self._format_output_columns(res_df, is_trend=True)
