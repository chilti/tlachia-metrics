"""
TlachIA Metrics - openalex_indicators_engine
aggregators/researchers_aggregator.py
Agregación por Investigadores / Autores.
"""
from .base_aggregator import BaseAggregator

class ResearchersAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='author_names')
