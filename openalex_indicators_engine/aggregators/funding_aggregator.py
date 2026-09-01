"""
TlachIA Metrics - openalex_indicators_engine
aggregators/funding_aggregator.py
Agregación por Agencias Financiadoras y Patrocinadores.
"""
from .base_aggregator import BaseAggregator

class FundingAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='funder_names')
