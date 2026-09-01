"""
TlachIA Metrics - openalex_indicators_engine
exporters/parquet_exporter.py
Exportador de DataFrames a formato Parquet para DuckDB y dashboards interactivos.
"""
import pandas as pd
from pathlib import Path
from typing import Union

def save_parquet_table(df: pd.DataFrame, file_path: Union[str, Path]):
    p = Path(file_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if df is not None and len(df) > 0:
        df.to_parquet(p, index=False)
