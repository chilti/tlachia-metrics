"""
TlachIA Metrics - openalex_indicators_engine
aggregators/economic_apc_aggregator.py
Agregación especializada en Economía de la Publicación (APC vs Diamante).
"""
import pandas as pd
from .base_aggregator import BaseAggregator

class EconomicAPCAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='source_id')
