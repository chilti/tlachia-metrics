"""
TlachIA Metrics - openalex_indicators_engine
aggregators/corpus_aggregator.py
Agregador cienciométrico base para el conjunto completo (Corpus total):
- Histórico completo del corpus (Full Period)
- Periodos consecutivos del corpus (Consecutive Periods)
- Serie temporal año por año del corpus (Annual Trends)
- Matriz longitudinal de desempeño multitemporal del corpus (Performance Matrix)
- Tabla resumen de periodos consecutivos con variaciones interperiódicas
"""
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional, Tuple

from ..core.metrics_base import calculate_summary_indicators
from ..core.config import RECENT_PERIOD_START, RECENT_PERIOD_END
from .base_aggregator import BaseAggregator

class CorpusAggregator(BaseAggregator):
    """
    Agregador cienciométrico y macroeconómico a nivel de todo el corpus bibliográfico.
    Calcula los indicadores globales sin desagregar por autores, instituciones o fuentes.
    """
    def __init__(self, corpus_label: str = "Corpus Completo"):
        super().__init__(entity_column="id", entity_name_column="id")
        self.corpus_label = corpus_label

    def aggregate_full(self, df: pd.DataFrame, min_docs: int = 1) -> pd.DataFrame:
        """Calcula el reporte de indicadores base para la totalidad del corpus."""
        if df is None or len(df) == 0:
            return pd.DataFrame()
        
        metrics = calculate_summary_indicators(df, entity_name=self.corpus_label)
        metrics['Name'] = self.corpus_label
        metrics['Rank'] = 1
        res_df = pd.DataFrame([metrics])
        return self._format_output_columns(res_df, is_trend=False)

    def aggregate_period(self, df: pd.DataFrame, start_year: int, end_year: int, min_docs: int = 1) -> pd.DataFrame:
        """Calcula el reporte base del corpus para una ventana temporal arbitraria [start_year, end_year]."""
        if df is None or len(df) == 0:
            return pd.DataFrame()
        
        df_p = df[(df['publication_year'] >= start_year) & (df['publication_year'] <= end_year)]
        if df_p.empty:
            return pd.DataFrame()

        metrics = calculate_summary_indicators(df_p, entity_name=self.corpus_label)
        metrics['Name'] = self.corpus_label
        metrics['Rank'] = 1
        res_df = pd.DataFrame([metrics])
        return self._format_output_columns(res_df, is_trend=False)

    def aggregate_consecutive_periods_table(self, df: pd.DataFrame, periods: List[Tuple[int, int]]) -> pd.DataFrame:
        """
        Calcula una tabla cronológica consolidada donde cada fila es un periodo consecutivo,
        incluyendo los 30+ indicadores y las tasas de cambio interperiódicas (Delta % Docs, Delta FWCI).
        """
        if df is None or len(df) == 0 or not periods:
            return pd.DataFrame()

        rows = []
        prev_docs = None
        prev_cites = None
        prev_fwci = None

        for s_yr, e_yr in periods:
            p_label = f"{s_yr}-{e_yr}"
            df_p = df[(df['publication_year'] >= s_yr) & (df['publication_year'] <= e_yr)]
            metrics = calculate_summary_indicators(df_p, entity_name=self.corpus_label)
            
            curr_docs = metrics.get('num_documents', 0)
            curr_cites = metrics.get('times_cited', 0)
            curr_fwci = metrics.get('fwci_avg', 0.0)

            doc_growth = None
            cite_growth = None
            fwci_diff = None

            if prev_docs is not None and prev_docs > 0:
                doc_growth = round(((curr_docs - prev_docs) / prev_docs) * 100.0, 2)
            elif prev_docs is not None and curr_docs > 0:
                doc_growth = 100.0

            if prev_cites is not None and prev_cites > 0:
                cite_growth = round(((curr_cites - prev_cites) / prev_cites) * 100.0, 2)

            if prev_fwci is not None and curr_fwci is not None:
                fwci_diff = round(curr_fwci - prev_fwci, 3)

            metrics['Period'] = p_label
            metrics['Start Year'] = s_yr
            metrics['End Year'] = e_yr
            metrics['Δ% Documents (Interperiod)'] = doc_growth
            metrics['Δ% Times Cited (Interperiod)'] = cite_growth
            metrics['Δ FWCI (Interperiod)'] = fwci_diff

            rows.append(metrics)
            prev_docs = curr_docs
            prev_cites = curr_cites
            prev_fwci = curr_fwci

        if not rows:
            return pd.DataFrame()

        res_df = pd.DataFrame(rows)
        base_formatted = self._format_output_columns(res_df, is_trend=False)
        extra_cols = ['Period', 'Start Year', 'End Year', 'Δ% Documents (Interperiod)', 'Δ% Times Cited (Interperiod)', 'Δ FWCI (Interperiod)']
        for col in extra_cols:
            if col in res_df.columns:
                base_formatted[col] = res_df[col]
        
        front_cols = [
            'Period', 'Start Year', 'End Year',
            'Documents', 'Δ% Documents (Interperiod)',
            'Times Cited', 'Δ% Times Cited (Interperiod)',
            'Citation Impact', '% Docs Cited',
            'Field-Weighted Citation Impact (FWCI)', 'Δ FWCI (Interperiod)'
        ]
        all_ordered = [c for c in front_cols if c in base_formatted.columns] + [
            c for c in base_formatted.columns if c not in front_cols and c != 'Rank'
        ]
        return base_formatted[all_ordered]

    def aggregate_performance_matrix(self, df: pd.DataFrame, periods: List[Tuple[int, int]], min_docs: int = 1) -> pd.DataFrame:
        """
        Calcula la matriz comparativa de desempeño en formato horizontal (wide format)
        para el corpus, idéntica en estructura a las matrices de las demás 16 entidades.
        """
        if df is None or len(df) == 0 or not periods:
            return pd.DataFrame()

        full_metrics = calculate_summary_indicators(df, entity_name=self.corpus_label)
        period_metrics = {}
        for s_yr, e_yr in periods:
            p_label = f"{s_yr}-{e_yr}"
            df_p = df[(df['publication_year'] >= s_yr) & (df['publication_year'] <= e_yr)]
            period_metrics[p_label] = calculate_summary_indicators(df_p, entity_name=self.corpus_label)

        row_dict = {
            'Rank': 1,
            'Name': self.corpus_label,
            'Total Documents': full_metrics.get('num_documents', 0),
            'Total Times Cited': full_metrics.get('times_cited', 0),
            'Total FWCI': full_metrics.get('fwci_avg', 0.0),
        }

        prev_p_label = None
        for s_yr, e_yr in periods:
            p_label = f"{s_yr}-{e_yr}"
            m = period_metrics.get(p_label, {})
            docs = m.get('num_documents', 0)
            cits = m.get('times_cited', 0)
            impact = m.get('cites_per_doc', 0.0)
            fwci = m.get('fwci_avg', 0.0)
            pct_top10 = m.get('pct_top_10', 0.0)
            pct_diamond = m.get('pct_oa_diamond', 0.0)
            pct_intl = m.get('pct_international', 0.0)
            h_idx = m.get('h_index', 0)

            row_dict[f'Docs ({p_label})'] = docs
            row_dict[f'Times Cited ({p_label})'] = cits
            row_dict[f'Citation Impact ({p_label})'] = impact
            row_dict[f'FWCI ({p_label})'] = fwci
            row_dict[f'% Top 10% ({p_label})'] = pct_top10
            row_dict[f'% Diamond ({p_label})'] = pct_diamond
            row_dict[f'% International ({p_label})'] = pct_intl
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

        return pd.DataFrame([row_dict])

    def aggregate_trend(self, df: pd.DataFrame, min_docs_per_year: int = 1) -> pd.DataFrame:
        """Calcula la serie temporal anual (Trend) año por año de la totalidad del corpus."""
        if df is None or len(df) == 0:
            return pd.DataFrame()

        df_clean = df.dropna(subset=['publication_year']).copy()
        df_clean['publication_year'] = pd.to_numeric(df_clean['publication_year'], errors='coerce')
        df_clean = df_clean.dropna(subset=['publication_year'])
        df_clean['publication_year'] = df_clean['publication_year'].astype(int)

        years = sorted(df_clean['publication_year'].unique())
        if not years:
            return pd.DataFrame()

        rows = []
        prev_docs = None
        prev_cites = None

        for yr in years:
            group = df_clean[df_clean['publication_year'] == yr]
            if len(group) < min_docs_per_year:
                continue

            metrics = calculate_summary_indicators(group, entity_name=self.corpus_label)
            curr_docs = metrics.get('num_documents', 0)
            curr_cites = metrics.get('times_cited', 0)

            doc_growth = None
            cite_growth = None
            if prev_docs is not None and prev_docs > 0:
                doc_growth = round(((curr_docs - prev_docs) / prev_docs) * 100.0, 2)
            if prev_cites is not None and prev_cites > 0:
                cite_growth = round(((curr_cites - prev_cites) / prev_cites) * 100.0, 2)

            metrics['Name'] = self.corpus_label
            metrics['Publication Year'] = int(yr)
            metrics['Δ% Documents (Annual)'] = doc_growth
            metrics['Δ% Times Cited (Annual)'] = cite_growth

            rows.append(metrics)
            prev_docs = curr_docs
            prev_cites = curr_cites

        if not rows:
            return pd.DataFrame()

        res_df = pd.DataFrame(rows)
        base_formatted = self._format_output_columns(res_df, is_trend=True)
        if 'Δ% Documents (Annual)' in res_df.columns:
            base_formatted['Δ% Documents (Annual)'] = res_df['Δ% Documents (Annual)']
        if 'Δ% Times Cited (Annual)' in res_df.columns:
            base_formatted['Δ% Times Cited (Annual)'] = res_df['Δ% Times Cited (Annual)']

        front_cols = [
            'Publication Year', 'Documents', 'Δ% Documents (Annual)',
            'Times Cited', 'Δ% Times Cited (Annual)',
            'Citation Impact', '% Docs Cited',
            'Field-Weighted Citation Impact (FWCI)'
        ]
        all_ordered = [c for c in front_cols if c in base_formatted.columns] + [
            c for c in base_formatted.columns if c not in front_cols and c != 'Rank' and c != 'Name'
        ]
        if 'Name' in base_formatted.columns:
            all_ordered = ['Name'] + all_ordered

        return base_formatted[all_ordered]
