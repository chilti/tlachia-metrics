"""
TlachIA Metrics - openalex_indicators_engine
aggregators/taxonomy_aggregator.py
Agregación por Taxonomías Temáticas: Macro, Meso, Micro Topics, ESI y ODS.
"""
from .base_aggregator import BaseAggregator

class MacroTopicsAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='domain')

class MesoTopicsAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='field')

class MicroTopicsAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='topic')

class ESIAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='subfield')

class SDGAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='sdgs')
