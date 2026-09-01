"""
TlachIA Metrics - openalex_indicators_engine
core/config.py
Configuración de conexión a bases de datos y parámetros de procesamiento.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / '.env'
if ENV_PATH.exists():
    load_dotenv(ENV_PATH)
else:
    load_dotenv()

CH_HOST = os.getenv('CH_HOST', '10.90.0.87')
CH_PORT = int(os.getenv('CH_PORT', '8124'))
CH_USER = os.getenv('CH_USER', 'rag_user')
CH_PASSWORD = os.getenv('CH_PASSWORD', '')
CH_DATABASE = os.getenv('CH_DATABASE', 'rag')

CH_CHUNK_SIZE = int(os.getenv('CH_CHUNK_SIZE', '5000'))
CH_QUERY_TIMEOUT = int(os.getenv('CH_QUERY_TIMEOUT', '300'))
CH_MAX_THREADS = int(os.getenv('CH_MAX_THREADS', '4'))
OPENALEX_LOCAL_API = os.getenv('OPENALEX_LOCAL_API', 'http://localhost:5012')

DATA_DIR = BASE_DIR / 'data'
CACHE_DIR = DATA_DIR / 'cache'
EXPORTS_DIR = DATA_DIR / 'exports'

DATA_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

CURRENT_YEAR = 2026
RECENT_PERIOD_START = 2021
RECENT_PERIOD_END = 2025
