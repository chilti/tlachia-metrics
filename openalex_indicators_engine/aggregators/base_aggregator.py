"""
TlachIA Metrics - openalex_indicators_engine
aggregators/base_aggregator.py
Clase base para agregación temporal y multidimensional de entidades.
"""
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional, Tuple

from ..core.metrics_base import calculate_summary_indicators
from ..core.config import RECENT_PERIOD_START, RECENT_PERIOD_END

class BaseAggregator:
    def __init__(self, entity_column: str, entity_name_column: Optional[str] = None):
        self.entity_column = entity_column
        self.entity_name_column = entity_name_column or entity_column

    def aggregate_full(self, df: pd.DataFrame, min_docs: int = 1) -> pd.DataFrame:
        """Calcula el reporte histórico acumulado para la entidad."""
        return self._aggregate_dataset(df, min_docs=min_docs)

    def aggregate_recent(self, df: pd.DataFrame, min_docs: int = 1,
                         start_year: int = RECENT_PERIOD_START, end_year: int = RECENT_PERIOD_END) -> pd.DataFrame:
        """Calcula el reporte del periodo reciente (ej. 2021-2025)."""
        return self.aggregate_period(df, start_year=start_year, end_year=end_year, min_docs=min_docs)

    def aggregate_period(self, df: pd.DataFrame, start_year: int, end_year: int, min_docs: int = 1) -> pd.DataFrame:
        """Calcula el reporte para una ventana temporal arbitraria [start_year, end_year]."""
        if df is None or len(df) == 0:
            return pd.DataFrame()
        df_rec = df[(df['publication_year'] >= start_year) & (df['publication_year'] <= end_year)]
        return self._aggregate_dataset(df_rec, min_docs=min_docs)

    def aggregate_performance_matrix(self, df: pd.DataFrame, periods: List[Tuple[int, int]], min_docs: int = 1) -> pd.DataFrame:
        """
        Calcula la matriz comparativa de desempeño transversal y longitudinal
        para periodos consecutivos, incluyendo variaciones interperíodo.
        """
        if df is None or len(df) == 0 or not periods:
            return pd.DataFrame()

        # 1. Agregación completa histórica como base de entidades y orden
        full_df = self.aggregate_full(df, min_docs=min_docs)
        if full_df.empty:
            return pd.DataFrame()

        # 2. Agregaciones para cada periodo consecutivo
        period_dfs = {}
        for (s_yr, e_yr) in periods:
            p_label = f"{s_yr}-{e_yr}"
            p_df = self.aggregate_period(df, start_year=s_yr, end_year=e_yr, min_docs=1)
            if not p_df.empty and 'Name' in p_df.columns:
                period_dfs[p_label] = p_df.set_index('Name')

        matrix_rows = []
        period_labels = [f"{s}-{e}" for s, e in periods]

        for _, f_row in full_df.iterrows():
            ent_name = f_row['Name']
            row_dict = {
                'Rank': f_row.get('Rank', 0),
                'Name': ent_name,
                'Total Documents': f_row.get('Documents', 0),
                'Total Times Cited': f_row.get('Times Cited', 0),
                'Total FWCI': f_row.get('Field-Weighted Citation Impact (FWCI)', 0.0),
            }

            prev_p_label = None
            for p_label in period_labels:
                p_data = period_dfs.get(p_label)
                if p_data is not None and ent_name in p_data.index:
                    ent_p = p_data.loc[ent_name]
                    if isinstance(ent_p, pd.DataFrame):
                        ent_p = ent_p.iloc[0]

                    docs = int(ent_p.get('Documents', 0))
                    cits = int(ent_p.get('Times Cited', 0))
                    impact = float(ent_p.get('Citation Impact', 0.0))
                    fwci = float(ent_p.get('Field-Weighted Citation Impact (FWCI)', 0.0))
                    pct_top10 = float(ent_p.get('% Documents in Top 10%', 0.0))
                    pct_diamond = float(ent_p.get('% Free to Read / Diamond Documents', 0.0))
                    pct_intl = float(ent_p.get('% International Collaborations', 0.0))
                    h_idx = int(ent_p.get('H-Index', 0))
                else:
                    docs, cits, impact, fwci, pct_top10, pct_diamond, pct_intl, h_idx = 0, 0, 0.0, 0.0, 0.0, 0.0, 0.0, 0

                row_dict[f'Docs ({p_label})'] = docs
                row_dict[f'Times Cited ({p_label})'] = cits
                row_dict[f'Citation Impact ({p_label})'] = impact
                row_dict[f'FWCI ({p_label})'] = fwci
                row_dict[f'% Top 10% ({p_label})'] = pct_top10
                row_dict[f'% Diamond ({p_label})'] = pct_diamond
                row_dict[f'% International ({p_label})'] = pct_intl
                row_dict[f'H-Index ({p_label})'] = h_idx

                # Variación respecto al periodo previo
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

        res_df = pd.DataFrame(matrix_rows)
        return res_df

    def aggregate_trend(self, df: pd.DataFrame, min_docs_per_year: int = 1) -> pd.DataFrame:
        """Calcula la serie temporal anual (Trend) año por año para la entidad."""
        if df is None or len(df) == 0:
            return pd.DataFrame()
        
        exploded_df = self._explode_entity(df)
        if len(exploded_df) == 0:
            return pd.DataFrame()

        rows = []
        for (ent_val, year), group in exploded_df.groupby([self.entity_column, 'publication_year']):
            if len(group) < min_docs_per_year or not ent_val or str(ent_val).strip() in ('', 'nan', 'None'):
                continue
            metrics = calculate_summary_indicators(group, entity_name=str(ent_val))
            metrics['Name'] = str(ent_val)
            metrics['Publication Year'] = int(year)
            rows.append(metrics)

        if not rows:
            return pd.DataFrame()

        res_df = pd.DataFrame(rows)
        res_df = res_df.sort_values(by=['Name', 'Publication Year'], ascending=[True, True])
        return self._format_output_columns(res_df, is_trend=True)

    def _explode_entity(self, df: pd.DataFrame) -> pd.DataFrame:
        """Desanida entidades si vienen en listas o arrays (ej. autores, instituciones)."""
        if self.entity_column not in df.columns:
            return pd.DataFrame()
        
        sample_val = df[self.entity_column].dropna().iloc[0] if len(df[self.entity_column].dropna()) > 0 else None
        if isinstance(sample_val, (list, tuple, np.ndarray)):
            return df.explode(self.entity_column).dropna(subset=[self.entity_column])
        return df

    def _aggregate_dataset(self, df: pd.DataFrame, min_docs: int = 1) -> pd.DataFrame:
        if df is None or len(df) == 0:
            return pd.DataFrame()

        exploded_df = self._explode_entity(df)
        if len(exploded_df) == 0:
            return pd.DataFrame()

        rows = []
        for ent_val, group in exploded_df.groupby(self.entity_column):
            if len(group) < min_docs or not ent_val or str(ent_val).strip() in ('', 'nan', 'None'):
                continue
            metrics = calculate_summary_indicators(group, entity_name=str(ent_val))
            metrics['Name'] = str(ent_val)
            rows.append(metrics)

        if not rows:
            return pd.DataFrame()

        res_df = pd.DataFrame(rows)
        res_df = res_df.sort_values(by='num_documents', ascending=False).reset_index(drop=True)
        res_df['Rank'] = range(1, len(res_df) + 1)
        return self._format_output_columns(res_df, is_trend=False)

    def _format_output_columns(self, df: pd.DataFrame, is_trend: bool = False) -> pd.DataFrame:
        """Formatea y renombra columnas a los estándares claros de TlachIA Metrics."""
        col_mapping = {
            'Name': 'Name',
            'Rank': 'Rank',
            'Publication Year': 'Publication Year',
            'num_documents': 'Documents',
            'times_cited': 'Times Cited',
            'cites_per_doc': 'Citation Impact',
            'pct_docs_cited': '% Docs Cited',
            'fwci_avg': 'Field-Weighted Citation Impact (FWCI)',
            'avg_percentile': 'Average Percentile',
            'docs_top_10': 'Documents in Top 10%',
            'pct_top_10': '% Documents in Top 10%',
            'docs_top_1': 'Documents in Top 1%',
            'pct_top_1': '% Documents in Top 1%',
            'h_index': 'H-Index',
            'i10_index': 'i10-Index',
            'pct_oa_total': '% All Open Access Documents',
            'pct_oa_gold': '% Gold Documents',
            'pct_oa_hybrid': '% Gold - Hybrid Documents',
            'pct_oa_diamond': '% Free to Read / Diamond Documents',
            'pct_oa_green': '% Green Repository Documents',
            'pct_oa_bronze': '% Bronze Documents',
            'pct_oa_closed': '% Non-Open Access Documents',
            'pct_doaj': '% DOAJ Indexed Documents',
            'pct_cwts_core': '% CWTS Core Documents',
            'pct_international': '% International Collaborations',
            'pct_domestic': '% Domestic Collaborations',
            'pct_industry': '% Industry Collaborations',
            'pct_global_south': '% Global South Collaborations',
            'estimated_apc_paid_usd': 'Estimated APC Paid (USD)',
            'avg_apc_per_doc_usd': 'Average APC per Document (USD)',
            'estimated_diamond_savings_usd': 'Estimated Diamond Savings (USD)',
            'pct_retracted': '% Retracted Papers',
            'pct_paratext': '% Paratext Documents'
        }
        
        ordered_cols = [c for c in col_mapping.values() if c in df.rename(columns=col_mapping).columns]
        df_renamed = df.rename(columns=col_mapping)
        return df_renamed[ordered_cols]
