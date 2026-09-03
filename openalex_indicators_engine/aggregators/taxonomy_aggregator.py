"""
TlachIA Metrics - openalex_indicators_engine
aggregators/taxonomy_aggregator.py
Agregación por Taxonomías Temáticas OpenAlex: Domain, Field, Subfield, Topic, ESI y ODS/SDG.
"""
import re
import pandas as pd
from .base_aggregator import BaseAggregator

# ── SDG name lookup (ODS 1–17, nombres oficiales cortos) ──────────────────────
_SDG_NAMES = {
    '1':  'SDG 1: No Poverty',
    '2':  'SDG 2: Zero Hunger',
    '3':  'SDG 3: Good Health and Well-Being',
    '4':  'SDG 4: Quality Education',
    '5':  'SDG 5: Gender Equality',
    '6':  'SDG 6: Clean Water and Sanitation',
    '7':  'SDG 7: Affordable and Clean Energy',
    '8':  'SDG 8: Decent Work and Economic Growth',
    '9':  'SDG 9: Industry, Innovation and Infrastructure',
    '10': 'SDG 10: Reduced Inequalities',
    '11': 'SDG 11: Sustainable Cities and Communities',
    '12': 'SDG 12: Responsible Consumption and Production',
    '13': 'SDG 13: Climate Action',
    '14': 'SDG 14: Life Below Water',
    '15': 'SDG 15: Life on Land',
    '16': 'SDG 16: Peace, Justice and Strong Institutions',
    '17': 'SDG 17: Partnerships for the Goals',
}

def _resolve_sdg(raw_value: str) -> str:
    """
    Convierte un valor SDG (URL o número) al nombre oficial.
    - 'https://metadata.un.org/sdg/7'  → 'SDG 7: Affordable and Clean Energy'
    - 'SDG 7'                           → 'SDG 7: Affordable and Clean Energy'
    - '7'                               → 'SDG 7: Affordable and Clean Energy'
    """
    s = str(raw_value).strip()
    # Extract trailing number from URL or bare string
    m = re.search(r'(\d+)$', s)
    if m:
        num = m.group(1)
        return _SDG_NAMES.get(num, f'SDG {num}')
    return s


class SDGAggregator(BaseAggregator):
    """
    Agrega por ODS (Sustainable Development Goals).
    Convierte las URLs/IDs de SDG a nombres oficiales legibles.
    """
    def __init__(self):
        super().__init__(entity_column='sdgs')

    def _explode_entity(self, df: pd.DataFrame) -> pd.DataFrame:
        """Explode + resolve SDG URLs to human-readable names."""
        exploded = super()._explode_entity(df)
        if len(exploded) == 0:
            return exploded
        # Resolve each SDG value to its display name
        exploded = exploded.copy()
        exploded['sdgs'] = exploded['sdgs'].apply(
            lambda v: _resolve_sdg(v) if v and str(v).strip() not in ('', 'nan', 'None') else v
        )
        return exploded


class DomainAggregator(BaseAggregator):
    """Agrega por Dominio OpenAlex (equivalente a Macro Topics en InCites)."""
    def __init__(self):
        super().__init__(entity_column='domain')


class FieldAggregator(BaseAggregator):
    """Agrega por Campo OpenAlex (equivalente a Meso Topics en InCites)."""
    def __init__(self):
        super().__init__(entity_column='field')


class SubfieldAggregator(BaseAggregator):
    """Agrega por Subcampo OpenAlex (equivalente a ESI en InCites)."""
    def __init__(self):
        super().__init__(entity_column='subfield')


class TopicAggregator(BaseAggregator):
    """Agrega por Topic OpenAlex (equivalente a Micro Topics en InCites)."""
    def __init__(self):
        super().__init__(entity_column='topic')


# ── Backwards-compat aliases (usados en código legado) ────────────────────────
MacroTopicsAggregator = DomainAggregator
MesoTopicsAggregator  = FieldAggregator
MicroTopicsAggregator = TopicAggregator
