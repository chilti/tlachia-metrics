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
        return self.aggregate_period(df, start_year=start_year, end_year=end_year, min_colab_docs=min_colab_docs)

    def aggregate_period(self, df: pd.DataFrame, start_year: int, end_year: int, min_colab_docs: int = 1) -> pd.DataFrame:
        if df is None or len(df) == 0:
            return pd.DataFrame()
        df_rec = df[(df['publication_year'] >= start_year) & (df['publication_year'] <= end_year)]
        return self._build_colab_matrix(df_rec, min_colab_docs)

    def aggregate_performance_matrix(self, df: pd.DataFrame, periods: list, min_colab_docs: int = 1) -> pd.DataFrame:
        if df is None or len(df) == 0 or not periods:
            return pd.DataFrame()

        full_df = self.aggregate_full(df, min_colab_docs=min_colab_docs)
        if full_df.empty:
            return pd.DataFrame()

        period_dfs = {}
        for (s_yr, e_yr) in periods:
            p_label = f"{s_yr}-{e_yr}"
            p_df = self.aggregate_period(df, start_year=s_yr, end_year=e_yr, min_colab_docs=1)
            if not p_df.empty and 'Collaborating Pair' in p_df.columns:
                period_dfs[p_label] = p_df.set_index('Collaborating Pair')

        matrix_rows = []
        period_labels = [f"{s}-{e}" for s, e in periods]

        for _, f_row in full_df.iterrows():
            pair_name = f_row['Collaborating Pair']
            row_dict = {
                'Rank': f_row.get('Rank', 0),
                'Collaborating Pair': pair_name,
                'Total Documents': f_row.get('Documents', 0),
                'Total Times Cited': f_row.get('Times Cited', 0),
                'Total FWCI': f_row.get('Field-Weighted Citation Impact (FWCI)', 0.0),
            }

            prev_p_label = None
            for p_label in period_labels:
                p_data = period_dfs.get(p_label)
                if p_data is not None and pair_name in p_data.index:
                    ent_p = p_data.loc[pair_name]
                    if isinstance(ent_p, pd.DataFrame):
                        ent_p = ent_p.iloc[0]

                    docs = int(ent_p.get('Documents', 0))
                    cits = int(ent_p.get('Times Cited', 0))
                    impact = float(ent_p.get('Citation Impact', 0.0))
                    fwci = float(ent_p.get('Field-Weighted Citation Impact (FWCI)', 0.0))
                    pct_top10 = float(ent_p.get('% Documents in Top 10%', 0.0))
                    pct_diamond = float(ent_p.get('% Free to Read / Diamond Documents', 0.0))
                    h_idx = int(ent_p.get('H-Index', 0))
                else:
                    docs, cits, impact, fwci, pct_top10, pct_diamond, h_idx = 0, 0, 0.0, 0.0, 0.0, 0.0, 0

                row_dict[f'Docs ({p_label})'] = docs
                row_dict[f'Times Cited ({p_label})'] = cits
                row_dict[f'Citation Impact ({p_label})'] = impact
                row_dict[f'FWCI ({p_label})'] = fwci
                row_dict[f'% Top 10% ({p_label})'] = pct_top10
                row_dict[f'% Diamond ({p_label})'] = pct_diamond
                row_dict[f'H-Index ({p_label})'] = h_idx

                if prev_p_label is not None:
                    prev_docs = row_dict.get(f'Docs ({prev_p_label})', 0)
                    if prev_docs > 0:
                        growth_docs = round(((docs - prev_docs) / prev_docs) * 100.0, 2)
                    elif docs > 0:
                        growth_docs = 100.0
                    else:
                        growth_docs = 0.0
                    row_dict[f'Δ% Docs ({prev_p_label} → {p_label})'] = growth_docs

                    prev_fwci = row_dict.get(f'FWCI ({prev_p_label})', 0.0)
                    diff_fwci = round(fwci - prev_fwci, 3)
                    row_dict[f'Δ FWCI ({prev_p_label} → {p_label})'] = diff_fwci

                prev_p_label = p_label

            matrix_rows.append(row_dict)

        return pd.DataFrame(matrix_rows)

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
