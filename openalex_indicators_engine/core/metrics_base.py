"""
TlachIA Metrics - openalex_indicators_engine
core/metrics_base.py
Biblioteca matemática y cienciométrica vectorizada para cálculo de indicadores:
- Volumen y Citación (Leyes de Lotka, H-Index, i10, Citas por documento)
- Impacto Normalizado y Excelencia (FWCI/CNCI, Top 10%, Top 1%, Percentiles)
- Economía de la Publicación (Gasto estimado en APC, Precio de lista, Ahorro Diamante)
- Ciencia Abierta y Acceso (Diamante, Dorado, Híbrido, Verde, DOAJ, CWTS Core)
- Liderazgo y Redes (Autor de correspondencia, Institución de correspondencia, Sur Global)
- Integridad y Dinámica (Retractaciones, Paratexto, Velocidad de citación)
"""
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional

# Países del Sur Global (América Latina, África, Asia en desarrollo, Oceanía en desarrollo)
GLOBAL_SOUTH_COUNTRIES = {
    # América Latina y Caribe
    'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'UY', 'VE', 'EC', 'BO', 'PY', 'CU', 'DO', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'JM', 'TT',
    # África
    'ZA', 'EG', 'NG', 'KE', 'GH', 'ET', 'TZ', 'UG', 'DZ', 'MA', 'TN', 'SN', 'CM', 'CI', 'ZW',
    # Asia y Medio Oriente
    'IN', 'ID', 'PK', 'BD', 'PH', 'VN', 'TH', 'MY', 'IR', 'IQ', 'JO', 'LB', 'LK', 'NP', 'KZ', 'UZ'
}

def calculate_h_index(citations: pd.Series) -> int:
    """Calcula el índice H a partir de una serie de conteo de citas."""
    if citations is None or len(citations) == 0:
        return 0
    cits_sorted = np.sort(pd.to_numeric(citations, errors='coerce').fillna(0).values)[::-1]
    n = len(cits_sorted)
    h = 0
    for i, c in enumerate(cits_sorted):
        if c >= i + 1:
            h = i + 1
        else:
            break
    return int(h)

def calculate_i10_index(citations: pd.Series) -> int:
    """Calcula la cantidad de documentos con al menos 10 citas."""
    if citations is None or len(citations) == 0:
        return 0
    cits = pd.to_numeric(citations, errors='coerce').fillna(0)
    return int((cits >= 10).sum())

def calculate_summary_indicators(df: pd.DataFrame, entity_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Calcula el diccionario consolidado de más de 30 indicadores cienciométricos,
    económicos y de ciencia abierta para un DataFrame de artículos dado.
    """
    n_docs = len(df)
    if n_docs == 0:
        return {
            'num_documents': 0, 'times_cited': 0, 'cites_per_doc': 0.0, 'pct_docs_cited': 0.0,
            'fwci_avg': 0.0, 'avg_percentile': 0.0, 'docs_top_10': 0, 'pct_top_10': 0.0,
            'docs_top_1': 0, 'pct_top_1': 0.0, 'h_index': 0, 'i10_index': 0,
            'pct_oa_total': 0.0, 'pct_oa_gold': 0.0, 'pct_oa_hybrid': 0.0, 'pct_oa_diamond': 0.0,
            'pct_oa_green': 0.0, 'pct_oa_closed': 0.0, 'pct_doaj': 0.0, 'pct_cwts_core': 0.0,
            'pct_international': 0.0, 'pct_domestic': 0.0, 'pct_industry': 0.0, 'pct_global_south': 0.0,
            'estimated_apc_paid_usd': 0.0, 'avg_apc_per_doc_usd': 0.0, 'estimated_diamond_savings_usd': 0.0,
            'pct_retracted': 0.0, 'pct_paratext': 0.0
        }

    # 1. Volumen y Citas
    cits = pd.to_numeric(df['cited_by_count'], errors='coerce').fillna(0)
    times_cited = int(cits.sum())
    cites_per_doc = float(times_cited / n_docs)
    pct_docs_cited = float(((cits > 0).sum() / n_docs) * 100.0)
    h_idx = calculate_h_index(cits)
    i10_idx = calculate_i10_index(cits)

    # 2. Impacto Normalizado y Percentiles (FWCI / CNCI)
    fwci_vals = pd.to_numeric(df['fwci'], errors='coerce').fillna(0)
    fwci_avg = float(fwci_vals.sum() / n_docs)

    perc_vals = pd.to_numeric(df['percentile'], errors='coerce').fillna(0)
    # Detectar escala 0-1 vs 0-100
    if perc_vals.max() <= 1.0 and perc_vals.max() > 0:
        perc_vals = perc_vals * 100.0
    avg_percentile = float(perc_vals.mean())

    if 'is_top_10' in df.columns:
        is_top10 = (df['is_top_10'].astype(int) == 1) | (perc_vals >= 90.0)
    else:
        is_top10 = perc_vals >= 90.0
    docs_top_10 = int(is_top10.sum())
    pct_top_10 = float((docs_top_10 / n_docs) * 100.0)

    if 'is_top_1' in df.columns:
        is_top1 = (df['is_top_1'].astype(int) == 1) | (perc_vals >= 99.0)
    else:
        is_top1 = perc_vals >= 99.0
    docs_top_1 = int(is_top1.sum())
    pct_top_1 = float((docs_top_1 / n_docs) * 100.0)

    # 3. Acceso Abierto y Ciencia Abierta
    oa_stat = df['oa_status'].fillna('').astype(str).str.lower()
    is_oa_bool = (df['is_oa'].fillna(0).astype(int) == 1) | (oa_stat.isin(['gold', 'diamond', 'green', 'hybrid', 'bronze']))
    pct_oa_total = float((is_oa_bool.sum() / n_docs) * 100.0)
    pct_oa_gold = float(((oa_stat == 'gold').sum() / n_docs) * 100.0)
    pct_oa_hybrid = float(((oa_stat == 'hybrid').sum() / n_docs) * 100.0)
    pct_oa_diamond = float(((oa_stat == 'diamond').sum() / n_docs) * 100.0)
    pct_oa_green = float(((oa_stat == 'green').sum() / n_docs) * 100.0)
    pct_oa_closed = float(((oa_stat == 'closed').sum() / n_docs) * 100.0)

    pct_doaj = float(((df['is_doaj_indexed'].fillna(0).astype(int) == 1).sum() / n_docs) * 100.0) if 'is_doaj_indexed' in df.columns else 0.0
    pct_cwts_core = float(((df['is_core_journal'].fillna(0).astype(int) == 1).sum() / n_docs) * 100.0) if 'is_core_journal' in df.columns else 0.0

    # 4. Economía de la Publicación (APC USD y Ahorro Diamante)
    apc_paid = pd.to_numeric(df['apc_paid_usd'], errors='coerce').fillna(0)
    est_apc_paid_usd = float(apc_paid.sum())
    avg_apc_per_doc_usd = float(est_apc_paid_usd / n_docs)
    
    # El ahorro diamante estima cuánto se hubiera pagado a tarifa media (,800 USD) por los artículos diamante
    diamond_count = (oa_stat == 'diamond').sum()
    est_diamond_savings_usd = float(diamond_count * 1800.0)

    # 5. Colaboración e Internacionalización
    if 'all_country_codes' in df.columns:
        countries_list = df['all_country_codes']
        is_intl = countries_list.apply(lambda x: len(x) > 1 if isinstance(x, (list, tuple, np.ndarray)) else False)
        pct_intl = float((is_intl.sum() / n_docs) * 100.0)
        pct_domestic = 100.0 - pct_intl

        # Cooperación Sur-Sur (solo países del Sur Global)
        def is_pure_south(codes):
            if not isinstance(codes, (list, tuple, np.ndarray)) or len(codes) <= 1:
                return False
            return all(c in GLOBAL_SOUTH_COUNTRIES for c in codes if c)
        
        pct_global_south = float((countries_list.apply(is_pure_south).sum() / n_docs) * 100.0)
    else:
        pct_intl = 0.0
        pct_domestic = 100.0
        pct_global_south = 0.0

    # Industria
    if 'institution_types' in df.columns:
        def has_industry(types):
            if isinstance(types, (list, tuple, np.ndarray)):
                return any('company' in str(t).lower() for t in types)
            return False
        pct_industry = float((df['institution_types'].apply(has_industry).sum() / n_docs) * 100.0)
    else:
        pct_industry = 0.0

    # 6. Integridad Científica
    pct_retracted = float(((df['is_retracted'].fillna(0).astype(int) == 1).sum() / n_docs) * 100.0) if 'is_retracted' in df.columns else 0.0
    pct_paratext = float(((df['is_paratext'].fillna(0).astype(int) == 1).sum() / n_docs) * 100.0) if 'is_paratext' in df.columns else 0.0

    return {
        'num_documents': n_docs,
        'times_cited': times_cited,
        'cites_per_doc': round(cites_per_doc, 2),
        'pct_docs_cited': round(pct_docs_cited, 2),
        'fwci_avg': round(fwci_avg, 2),
        'avg_percentile': round(avg_percentile, 1),
        'docs_top_10': docs_top_10,
        'pct_top_10': round(pct_top_10, 2),
        'docs_top_1': docs_top_1,
        'pct_top_1': round(pct_top_1, 3),
        'h_index': h_idx,
        'i10_index': i10_idx,
        'pct_oa_total': round(pct_oa_total, 1),
        'pct_oa_gold': round(pct_oa_gold, 1),
        'pct_oa_hybrid': round(pct_oa_hybrid, 1),
        'pct_oa_diamond': round(pct_oa_diamond, 1),
        'pct_oa_green': round(pct_oa_green, 1),
        'pct_oa_closed': round(pct_oa_closed, 1),
        'pct_doaj': round(pct_doaj, 1),
        'pct_cwts_core': round(pct_cwts_core, 1),
        'pct_international': round(pct_intl, 1),
        'pct_domestic': round(pct_domestic, 1),
        'pct_industry': round(pct_industry, 1),
        'pct_global_south': round(pct_global_south, 1),
        'estimated_apc_paid_usd': round(est_apc_paid_usd, 2),
        'avg_apc_per_doc_usd': round(avg_apc_per_doc_usd, 2),
        'estimated_diamond_savings_usd': round(est_diamond_savings_usd, 2),
        'pct_retracted': round(pct_retracted, 2),
        'pct_paratext': round(pct_paratext, 2)
    }
