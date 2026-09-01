"""
TlachIA Metrics - openalex_indicators_engine
"""
from .engine import TlachIAMetricsEngine
from .core.corpus_builder import CorpusBuilder
from .core.gentle_query_engine import GentleQueryEngine

__version__ = '1.0.0'
__all__ = ['TlachIAMetricsEngine', 'CorpusBuilder', 'GentleQueryEngine']
