"""
TlachIA Metrics - openalex_indicators_engine
aggregators/organizations_aggregator.py
Agregación por Instituciones, Tipologías ROR y Matriz de Colaboración Institucional.
"""
import pandas as pd
import numpy as np
from itertools import combinations
from .base_aggregator import BaseAggregator
from ..core.metrics_base import calculate_summary_indicators
from ..core.config import RECENT_PERIOD_START, RECENT_PERIOD_END

class OrganizationsAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='institution_names')

class SectorTypesAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='institution_types')

class OrganizationsColabAggregator:
    """Genera la matriz de coautoría inter-institucional (Pares de Instituciones)."""
    def __init__(self):
        pass

    def aggregate_full(self, df: pd.DataFrame, min_colab_docs: int = 2) -> pd.DataFrame:
        return self._build_colab_matrix(df, min_colab_docs)

    def aggregate_recent(self, df: pd.DataFrame, min_colab_docs: int = 1,
                         start_year: int = RECENT_PERIOD_START, end_year: int = RECENT_PERIOD_END) -> pd.DataFrame:
        df_rec = df[(df['publication_year'] >= start_year) & (df['publication_year'] <= end_year)]
        return self._build_colab_matrix(df_rec, min_colab_docs)

    def aggregate_trend(self, df: pd.DataFrame, min_colab_docs: int = 1) -> pd.DataFrame:
        if df is None or len(df) == 0:
            return pd.DataFrame()
        
        rows = []
        for year, year_group in df.groupby('publication_year'):
            colab_df = self._build_colab_matrix(year_group, min_colab_docs=min_colab_docs)
            if len(colab_df) > 0:
                colab_df['Publication Year'] = int(year)
                rows.append(colab_df)
        if rows:
            res = pd.concat(rows, ignore_index=True)
            return res.sort_values(by=['Collaborating Pair', 'Publication Year'])
        return pd.DataFrame()

    def _build_colab_matrix(self, df: pd.DataFrame, min_colab_docs: int) -> pd.DataFrame:
        if df is None or len(df) == 0 or 'institution_names' not in df.columns:
            return pd.DataFrame()

        pair_works = {}
        for idx, row in df.iterrows():
            insts = row['institution_names']
            if isinstance(insts, (list, tuple, np.ndarray)):
                unique_insts = sorted(list(set([str(i).strip() for i in insts if i and str(i).strip() not in ('', 'nan', 'None')])))
                if len(unique_insts) > 1:
                    for i1, i2 in combinations(unique_insts, 2):
                        pair = f"{i1} --- {i2}"
                        if pair not in pair_works:
                            pair_works[pair] = []
                        pair_works[pair].append(row)

        rows = []
        for pair, work_rows in pair_works.items():
            if len(work_rows) >= min_colab_docs:
                sub_df = pd.DataFrame(work_rows)
                metrics = calculate_summary_indicators(sub_df, entity_name=pair)
                metrics['Collaborating Pair'] = pair
                rows.append(metrics)

        if not rows:
            return pd.DataFrame()

        res_df = pd.DataFrame(rows).sort_values(by='num_documents', ascending=False).reset_index(drop=True)
        res_df['Rank'] = range(1, len(res_df) + 1)
        
        col_mapping = {
            'Collaborating Pair': 'Collaborating Pair',
            'Rank': 'Rank',
            'num_documents': 'Co-authored Documents',
            'times_cited': 'Times Cited',
            'cites_per_doc': 'Citation Impact',
            'fwci_avg': 'Field-Weighted Citation Impact (FWCI)',
            'avg_percentile': 'Average Percentile',
            'pct_top_10': '% Documents in Top 10%',
            'h_index': 'H-Index',
            'pct_oa_total': '% All Open Access Documents'
        }
        ordered_cols = [c for c in col_mapping.values() if c in res_df.rename(columns=col_mapping).columns]
        return res_df.rename(columns=col_mapping)[ordered_cols]
