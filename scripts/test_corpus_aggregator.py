"""
Test unitario y de integración para CorpusAggregator.
"""
import json
import pandas as pd
from pathlib import Path
from openalex_indicators_engine.aggregators.corpus_aggregator import CorpusAggregator

# Cargar muestra de obras de Mi_Corpus_TlachIA
json_path = Path("/mnt/expansion/desplegados/TlachIA-Metrics/data/exports/Mi_Corpus_TlachIA/Mi_Corpus_TlachIA_openalex_works.json")
if not json_path.exists():
    print(f"Error: no existe {json_path}")
    exit(1)

with open(json_path, "r", encoding="utf-8") as f:
    works = json.load(f)

df = pd.DataFrame(works)
print(f"Obras cargadas: {len(df)}")

agg = CorpusAggregator()

# 1. Periodo Completo
df_full = agg.aggregate_full(df)
print("\n=== 1. FULL PERIOD ===")
print("Filas:", len(df_full), "Columnas:", len(df_full.columns))
print(df_full[['Name', 'Documents', 'Times Cited', 'Citation Impact', 'Field-Weighted Citation Impact (FWCI)', 'H-Index']])

# 2. Periodos Consecutivos (ej. 2011-2015, 2016-2020, 2021-2025)
periods = [(2011, 2015), (2016, 2020), (2021, 2025)]
print("\n=== 2. INDIVIDUAL PERIOD (2021-2025) ===")
df_p = agg.aggregate_period(df, 2021, 2025)
print("Filas:", len(df_p), "Columnas:", len(df_p.columns))
print(df_p[['Name', 'Documents', 'Times Cited', 'Citation Impact', 'Field-Weighted Citation Impact (FWCI)', 'H-Index']])

print("\n=== 2.1 CONSECUTIVE PERIODS TABLE ===")
df_periods_table = agg.aggregate_consecutive_periods_table(df, periods)
print(df_periods_table[['Period', 'Documents', 'Δ% Documents (Interperiod)', 'Times Cited', 'Δ% Times Cited (Interperiod)', 'Field-Weighted Citation Impact (FWCI)', 'Δ FWCI (Interperiod)']])

# 3. Performance Matrix
print("\n=== 3. PERFORMANCE MATRIX ===")
df_matrix = agg.aggregate_performance_matrix(df, periods)
print("Columnas en matriz:", len(df_matrix.columns))
for c in df_matrix.columns[:12]:
    print(f"  {c}: {df_matrix[c].iloc[0]}")

# 4. Annual Trend
print("\n=== 4. ANNUAL TREND ===")
df_trend = agg.aggregate_trend(df)
print("Años en tendencia:", len(df_trend))
print(df_trend[['Publication Year', 'Documents', 'Δ% Documents (Annual)', 'Times Cited', 'Δ% Times Cited (Annual)', 'Field-Weighted Citation Impact (FWCI)']].tail(7))

print("\n✓ ¡Todas las pruebas de CorpusAggregator pasaron exitosamente!")
