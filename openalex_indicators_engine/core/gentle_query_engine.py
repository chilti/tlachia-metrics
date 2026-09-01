"""
TlachIA Metrics - openalex_indicators_engine
core/gentle_query_engine.py
Ejecutor seguro y no bloqueante para ClickHouse:
- Consulta en lotes (chunking)
- Sin JOINs masivos entre tablas gigantes
- Reintentos y manejo de timeouts
"""
import os
import time
import logging
import pandas as pd
from typing import List, Dict, Any, Optional, Iterator
import clickhouse_connect

from .config import CH_HOST, CH_PORT, CH_USER, CH_PASSWORD, CH_DATABASE, CH_CHUNK_SIZE, CH_QUERY_TIMEOUT

logger = logging.getLogger(__name__)

class GentleQueryEngine:
    def __init__(self, host: str = CH_HOST, port: int = CH_PORT, user: str = CH_USER, 
                 password: str = CH_PASSWORD, database: str = CH_DATABASE):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.database = database
        self._client = None

    def get_client(self):
        if self._client is None:
            self._client = clickhouse_connect.get_client(
                host=self.host,
                port=self.port,
                username=self.user,
                password=self.password,
                database=self.database,
                connect_timeout=30,
                send_receive_timeout=CH_QUERY_TIMEOUT
            )
        return self._client

    def query_df(self, query: str, parameters: Optional[Dict[str, Any]] = None) -> pd.DataFrame:
        """Ejecuta una consulta SQL simple y devuelve un DataFrame."""
        client = self.get_client()
        try:
            return client.query_df(query, parameters=parameters)
        except Exception as e:
            logger.error(f'Error ejecutando query en ClickHouse: {e}')
            raise

    def query_in_chunks_by_ids(self, base_query_template: str, id_list: List[str], 
                               chunk_size: int = CH_CHUNK_SIZE, id_placeholder: str = '{ids}') -> pd.DataFrame:
        """
        Ejecuta consultas WHERE id IN (...) fragmentadas en bloques para no saturar memoria ni ClickHouse.
        """
        if not id_list:
            return pd.DataFrame()
        
        unique_ids = list(set(id_list))
        total_chunks = (len(unique_ids) + chunk_size - 1) // chunk_size
        results = []

        client = self.get_client()
        for i in range(0, len(unique_ids), chunk_size):
            chunk = unique_ids[i:i + chunk_size]
            formatted_ids = tuple(chunk) if len(chunk) > 1 else f"('{chunk[0]}')"
            query = base_query_template.replace(id_placeholder, str(formatted_ids))
            
            df_chunk = client.query_df(query)
            if len(df_chunk) > 0:
                results.append(df_chunk)
            time.sleep(0.02)  # Pequeña pausa amable con ClickHouse

        if results:
            return pd.concat(results, ignore_index=True)
        return pd.DataFrame()
