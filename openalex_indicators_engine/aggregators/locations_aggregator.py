"""
TlachIA Metrics - openalex_indicators_engine
aggregators/locations_aggregator.py
Agregación por Países, Regiones Geopolíticas y Estados Sub-nacionales.
"""
import pandas as pd
from .base_aggregator import BaseAggregator

class LocationsAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='all_country_codes')

class SubnationalAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='country_code')
