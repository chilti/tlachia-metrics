"""
TlachIA Metrics - openalex_indicators_engine
aggregators/sources_aggregator.py
Agregación por Revistas Científicas y Fuentes de Publicación.
"""
from .base_aggregator import BaseAggregator

class SourcesAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='source_id')
