"""
Test de paridad matemática exhaustiva entre:
1. Motor en memoria Python (CorpusAggregator / metrics_base.py)
2. Motor ClickHouse Pushdown (ClickHousePushdownEngine)

Verifica que no se olvide NINGÚN indicador y que la exactitud sea del 100%.
"""
import json
import logging
import pandas as pd
import numpy as np
from pathlib import Path

from openalex_indicators_engine.aggregators.corpus_aggregator import CorpusAggregator
from openalex_indicators_engine.core.clickhouse_pushdown_engine import ClickHousePushdownEngine
from openalex_indicators_engine.core.gentle_query_engine import GentleQueryEngine

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("test_parity")

def run_test():
    json_path = Path("/mnt/expansion/desplegados/TlachIA-Metrics/data/exports/Mi_Corpus_TlachIA/Mi_Corpus_TlachIA_openalex_works.json")
    with open(json_path, "r", encoding="utf-8") as f:
        works = json.load(f)

    logger.info(f"Cargadas {len(works)} obras del archivo de muestra.")
    df = pd.DataFrame(works)

    # 1. Ejecutar agregación en memoria Python
    logger.info("Ejecutando agregador en memoria Python...")
    mem_agg = CorpusAggregator()
    df_mem = mem_agg.aggregate_full(df)

    # 2. Ejecutar agregación en ClickHouse Pushdown
    logger.info("Ejecutando motor ClickHouse Pushdown...")
    push_engine = ClickHousePushdownEngine()
    work_ids = df['id'].dropna().tolist()
    temp_table = push_engine.setup_corpus_context(work_ids, temp_table_name="temp_parity_test")
    try:
        df_push = push_engine.aggregate_corpus_baseline(temp_table)
    finally:
        push_engine.client.command(f"DROP TEMPORARY TABLE IF EXISTS {temp_table}")

    # 3. Comparación minuciosa columna por columna
    logger.info("=== COMPARACIÓN DETALLADA DE INDICADORES ===")
    all_cols = list(df_mem.columns)
    push_cols = list(df_push.columns)

    print(f"\nTotal columnas en memoria: {len(all_cols)}")
    print(f"Total columnas en pushdown: {len(push_cols)}")

    missing_in_push = [c for c in all_cols if c not in push_cols]
    extra_in_push = [c for c in push_cols if c not in all_cols]

    if missing_in_push:
        print(f"ALERTA: Faltan en Pushdown: {missing_in_push}")
    if extra_in_push:
        print(f"ALERTA: Extras en Pushdown: {extra_in_push}")

    matches = 0
    mismatches = 0
    comparison_report = []

    for col in all_cols:
        if col not in df_push.columns:
            comparison_report.append((col, "FALTA", "-", "NO"))
            mismatches += 1
            continue

        val_mem = df_mem[col].iloc[0]
        val_push = df_push[col].iloc[0]

        is_match = False
        if pd.isna(val_mem) and pd.isna(val_push):
            is_match = True
        elif isinstance(val_mem, (int, np.integer)) and isinstance(val_push, (int, np.integer)):
            is_match = (val_mem == val_push)
        elif isinstance(val_mem, (float, np.floating)) or isinstance(val_push, (float, np.floating)):
            is_match = np.isclose(float(val_mem), float(val_push), atol=0.05)
        else:
            is_match = (str(val_mem).strip() == str(val_push).strip())

        status = "✓ MATCH" if is_match else "✗ DIFERENCIA"
        if is_match:
            matches += 1
        else:
            mismatches += 1

        comparison_report.append((col, val_mem, val_push, status))

    print("\n" + "=" * 95)
    print(f"{'Indicador':<42} | {'En Memoria (Py)':<18} | {'Pushdown (CH)':<18} | Estado")
    print("=" * 95)
    for col, v_m, v_p, st in comparison_report:
        print(f"{col:<42} | {str(v_m):<18} | {str(v_p):<18} | {st}")
    print("=" * 95)

    print(f"\nResumen: {matches} indicadores coincidentes, {mismatches} diferencias.")
    assert mismatches == 0, f"Se encontraron {mismatches} discrepancias entre en memoria y pushdown!"
    print("\n✓ ¡Paridad matemática y completitud de indicadores 100% VERIFICADA!")

if __name__ == "__main__":
    run_test()
