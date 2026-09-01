"""
TlachIA Metrics - openalex_indicators_engine
aggregators/concepts_keywords_aggregator.py
Agregación por Conceptos Semánticos Multiescala y Palabras Clave NLP.
"""
from .base_aggregator import BaseAggregator

class ConceptsAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='concepts')

class KeywordsAggregator(BaseAggregator):
    def __init__(self):
        super().__init__(entity_column='keywords')
