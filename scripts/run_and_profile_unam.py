#!/usr/bin/env python3
"""
scripts/run_and_profile_unam.py
Ejecuta el cálculo integral del paquete Mi_Corpus_TlachIA para la UNAM
(Universidad Nacional Autónoma de México) con instrumentación y análisis
de cuellos de botella por tabla y fase.
"""
import os
import sys
import time
import json
import psutil
import logging
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime

# Configurar PYTHONPATH
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from openalex_indicators_engine import TlachIAMetricsEngine
from openalex_indicators_engine.core.config import EXPORTS_DIR
import openalex_indicators_engine.engine as engine_module
from api.main import JOBS_STORE, JOBS_LOCK, register_user_package

# Configurar Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(ROOT_DIR / 'unam_profile.log', mode='w', encoding='utf-8')
    ]
)
logger = logging.getLogger('unam_profiler')

def get_memory_mb() -> float:
    process = psutil.Process(os.getpid())
    return round(process.memory_info().rss / (1024 * 1024), 2)

def main():
    package_name = "Mi_Corpus_TlachIA"
    owner_orcid = "0000-0003-3453-7159"
    owner_name = "José Luis Jiménez Andrade"
    job_id = "job_313f2f310d58"

    logger.info("=" * 80)
    logger.info(f"INICIANDO CÁLCULO INTEGRAL DE PAQUETE '{package_name}' - UNAM")
    logger.info("=" * 80)
    logger.info(f"PID del proceso: {os.getpid()} | Memoria inicial: {get_memory_mb()} MB")

    engine = TlachIAMetricsEngine()

    # 1. Definir filtros y periodos
    filters = {
        "institution_ids": ["I8961855"],
        "start_year": 1900,
        "end_year": 2026
    }
    periods = [
        (1920, 1926),
        (1927, 1936),
        (1937, 1946),
        (1947, 1956),
        (1957, 1966),
        (1967, 1976),
        (1977, 1986),
        (1987, 1996),
        (1997, 2006),
        (2007, 2016),
        (2017, 2026)
    ]

    # Actualizar estado de job_id en JOBS_STORE para interfaz web
    with JOBS_LOCK:
        job = JOBS_STORE.get(job_id) or {}
        job['status'] = 'processing'
        job['progress'] = 5
        job['stage_label'] = 'Consultando corpus de la UNAM en ClickHouse...'
        job['updated_at'] = datetime.now().isoformat()
        JOBS_STORE[job_id] = job

    # 2. Consultar corpus en ClickHouse (solo IDs para alto rendimiento)
    t_start_corpus = time.perf_counter()
    logger.info(f"Consultando artículos de la UNAM con filtros: {filters}...")
    clauses = engine.corpus_builder._build_where_clauses(filters)
    where_sql = " AND ".join(clauses) if clauses else "1=1"
    df_corpus = engine.corpus_builder.engine.query_df(f"SELECT id FROM works_flat WHERE {where_sql}")

    pkg_dir = EXPORTS_DIR / package_name
    pkg_dir.mkdir(parents=True, exist_ok=True)
    if 'id' in df_corpus.columns:
        df_corpus[['id']].to_parquet(pkg_dir / "corpus_work_ids.parquet", index=False)

    t_corpus = time.perf_counter() - t_start_corpus
    total_works = len(df_corpus)
    logger.info(f"Corpus cargado: {total_works:,} artículos en {t_corpus:.2f}s | Memoria: {get_memory_mb()} MB")

    with JOBS_LOCK:
        job = JOBS_STORE.get(job_id) or {}
        job['total_works'] = total_works
        job['progress'] = 12
        job['stage_label'] = f'Corpus cargado ({total_works:,} artículos). Creando contexto Pushdown...'
        job['updated_at'] = datetime.now().isoformat()
        JOBS_STORE[job_id] = job

    # 3. Instrumentar profiling de operaciones
    profile_data = {}
    current_entity = {"name": "Corpus"}

    orig_agg_baseline = engine.pushdown_engine.aggregate_corpus_baseline
    orig_agg_entity = engine.pushdown_engine.aggregate_entity_table
    orig_agg_corpus_multi = engine.pushdown_engine.aggregate_corpus_multi_period
    orig_agg_entity_multi = engine.pushdown_engine.aggregate_entity_multi_period
    orig_agg_corpus_trend = engine.pushdown_engine.aggregate_corpus_trend
    orig_agg_entity_trend = engine.pushdown_engine.aggregate_entity_trend
    orig_to_csv = pd.DataFrame.to_csv
    orig_save_parquet = engine_module.save_parquet_table

    def get_entity_record(name):
        if name not in profile_data:
            profile_data[name] = {
                'ch_query_time': 0.0,
                'ch_queries_count': 0,
                'csv_write_time': 0.0,
                'csv_files_count': 0,
                'parquet_write_time': 0.0,
                'parquet_files_count': 0,
                'full_rows': 0,
                'trend_rows': 0,
                'start_time': time.perf_counter(),
                'end_time': None
            }
        return profile_data[name]

    def instrumented_agg_baseline(*args, **kwargs):
        ent = current_entity['name']
        rec = get_entity_record(ent)
        t0 = time.perf_counter()
        res = orig_agg_baseline(*args, **kwargs)
        dt = time.perf_counter() - t0
        rec['ch_query_time'] += dt
        rec['ch_queries_count'] += 1
        return res

    def instrumented_agg_entity(*args, **kwargs):
        ent = kwargs.get('entity_type') or (args[1] if len(args) > 1 else current_entity['name'])
        rec = get_entity_record(ent)
        t0 = time.perf_counter()
        res = orig_agg_entity(*args, **kwargs)
        dt = time.perf_counter() - t0
        rec['ch_query_time'] += dt
        rec['ch_queries_count'] += 1
        return res

    def instrumented_agg_corpus_multi(*args, **kwargs):
        ent = 'Corpus'
        rec = get_entity_record(ent)
        t0 = time.perf_counter()
        res = orig_agg_corpus_multi(*args, **kwargs)
        dt = time.perf_counter() - t0
        rec['ch_query_time'] += dt
        rec['ch_queries_count'] += 1
        return res

    def instrumented_agg_entity_multi(*args, **kwargs):
        ent = kwargs.get('entity_type') or (args[1] if len(args) > 1 else current_entity['name'])
        rec = get_entity_record(ent)
        t0 = time.perf_counter()
        res = orig_agg_entity_multi(*args, **kwargs)
        dt = time.perf_counter() - t0
        rec['ch_query_time'] += dt
        rec['ch_queries_count'] += 1
        return res

    def instrumented_agg_corpus_trend(*args, **kwargs):
        ent = 'Corpus'
        rec = get_entity_record(ent)
        t0 = time.perf_counter()
        res = orig_agg_corpus_trend(*args, **kwargs)
        dt = time.perf_counter() - t0
        rec['ch_query_time'] += dt
        rec['ch_queries_count'] += 1
        return res

    def instrumented_agg_entity_trend(*args, **kwargs):
        ent = kwargs.get('entity_type') or (args[1] if len(args) > 1 else current_entity['name'])
        rec = get_entity_record(ent)
        t0 = time.perf_counter()
        res = orig_agg_entity_trend(*args, **kwargs)
        dt = time.perf_counter() - t0
        rec['ch_query_time'] += dt
        rec['ch_queries_count'] += 1
        return res

    def instrumented_to_csv(self, *args, **kwargs):
        ent = current_entity['name']
        rec = get_entity_record(ent)
        t0 = time.perf_counter()
        res = orig_to_csv(self, *args, **kwargs)
        dt = time.perf_counter() - t0
        rec['csv_write_time'] += dt
        rec['csv_files_count'] += 1
        return res

    def instrumented_save_parquet(df, path):
        ent = current_entity['name']
        rec = get_entity_record(ent)
        t0 = time.perf_counter()
        res = orig_save_parquet(df, path)
        dt = time.perf_counter() - t0
        rec['parquet_write_time'] += dt
        rec['parquet_files_count'] += 1
        return res

    # Reemplazar funciones con versiones instrumentadas
    engine.pushdown_engine.aggregate_corpus_baseline = instrumented_agg_baseline
    engine.pushdown_engine.aggregate_entity_table = instrumented_agg_entity
    engine.pushdown_engine.aggregate_corpus_multi_period = instrumented_agg_corpus_multi
    engine.pushdown_engine.aggregate_entity_multi_period = instrumented_agg_entity_multi
    engine.pushdown_engine.aggregate_corpus_trend = instrumented_agg_corpus_trend
    engine.pushdown_engine.aggregate_entity_trend = instrumented_agg_entity_trend
    pd.DataFrame.to_csv = instrumented_to_csv
    engine_module.save_parquet_table = instrumented_save_parquet

    # Progress Callback
    last_entity_switched = [None]
    def progress_callback(pct, msg):
        now_str = datetime.now().strftime("%H:%M:%S")
        mem_mb = get_memory_mb()
        logger.info(f"[{now_str}] ({pct:>3}%) {msg:<50} | RAM: {mem_mb} MB")

        # Detectar cambio de entidad
        if 'Calculando indicadores:' in msg:
            ent_part = msg.split(':')[1].split('(')[0].strip()
            if last_entity_switched[0] and last_entity_switched[0] in profile_data:
                profile_data[last_entity_switched[0]]['end_time'] = time.perf_counter()
                prev_rec = profile_data[last_entity_switched[0]]
                total_prev = prev_rec['end_time'] - prev_rec['start_time']
                logger.info(f"  --> Resumen {last_entity_switched[0]}: Total={total_prev:.2f}s | ClickHouse={prev_rec['ch_query_time']:.2f}s ({prev_rec['ch_queries_count']} q) | CSV={prev_rec['csv_write_time']:.2f}s ({prev_rec['csv_files_count']} f) | Parquet={prev_rec['parquet_write_time']:.2f}s")
            
            last_entity_switched[0] = ent_part
            current_entity['name'] = ent_part
            rec = get_entity_record(ent_part)
            rec['start_time'] = time.perf_counter()

        with JOBS_LOCK:
            job = JOBS_STORE.get(job_id) or {}
            job['progress'] = pct
            job['stage_label'] = msg
            job['updated_at'] = datetime.now().isoformat()
            JOBS_STORE[job_id] = job

    # 4. Ejecutar Pipeline Principal
    t_start_pipeline = time.perf_counter()
    result = engine.process_and_export_package(
        df=df_corpus,
        package_name=package_name,
        periods=periods,
        export_parquet=True,
        export_json=False,
        create_zip=False,
        progress_callback=progress_callback
    )
    t_pipeline = time.perf_counter() - t_start_pipeline

    if last_entity_switched[0] and last_entity_switched[0] in profile_data:
        profile_data[last_entity_switched[0]]['end_time'] = time.perf_counter()

    # 5. Persistir corpus_work_ids.parquet
    pkg_dir = EXPORTS_DIR / package_name
    try:
        ids_pq = pkg_dir / "corpus_work_ids.parquet"
        df_corpus[['id']].to_parquet(ids_pq, index=False)
        logger.info(f"Identificadores del corpus persistidos en: {ids_pq} ({ids_pq.stat().st_size:,} bytes)")
    except Exception as e:
        logger.warning(f"Error guardando corpus_work_ids.parquet: {e}")

    # 6. Actualizar manifest.json
    strategy = {
        "mode_label": "Filtros Dinámicos OpenAlex (Institución)",
        "description": "Universidad Nacional Autónoma de México (I8961855) • Años 1900-2026",
        "details": {
            "institution_ids": ["I8961855"],
            "start_year": 1900,
            "end_year": 2026,
            "total_works": total_works
        }
    }
    manifest_data = {
        'package_name': package_name,
        'total_works': total_works,
        'source_mode': 'filters',
        'filters': filters,
        'time_windows': {
            'window_size': 10,
            'window_mode': 'consecutive',
            'anchor_direction': 'end',
            'start_year': 1920,
            'end_year': 2026,
            'min_docs': 1,
            'periods': periods
        },
        'periods': result.get('periods', []),
        'has_performance_matrix': True,
        'created_at': datetime.now().isoformat(),
        'total_csv_files': result.get('total_csv_files', 0),
        'total_excel_files': result.get('total_excel_files', 0),
        'tables_summary': result.get('tables_summary', {}),
        'search_strategy': strategy,
        'owner_orcid': owner_orcid,
        'owner_name': owner_name,
        'has_zip': False,
        'has_json': False
    }
    manifest_file = pkg_dir / "manifest.json"
    with open(manifest_file, 'w', encoding='utf-8') as mf:
        json.dump(manifest_data, mf, ensure_ascii=False, indent=2)

    # Registrar en user_packages
    try:
        register_user_package(
            package_name=package_name,
            owner_orcid=owner_orcid,
            owner_name=owner_name,
            total_works=total_works,
            zip_size_bytes=0,
            source_mode='filters'
        )
    except Exception as e:
        logger.warning(f"Error registrando en user_packages: {e}")

    # Marcar job completado
    with JOBS_LOCK:
        job = JOBS_STORE.get(job_id) or {}
        job['status'] = 'completed'
        job['progress'] = 100
        job['stage_label'] = '¡Proceso finalizado con éxito!'
        job['completed_at'] = datetime.now().isoformat()
        job['result'] = {
            'package_name': package_name,
            'total_works': total_works,
            'total_csv_files': result.get('total_csv_files', 0),
            'total_excel_files': result.get('total_excel_files', 0),
            'tables_summary': result.get('tables_summary', {}),
            'search_strategy': strategy,
            'owner_orcid': owner_orcid,
            'owner_name': owner_name
        }
        job['updated_at'] = datetime.now().isoformat()
        JOBS_STORE[job_id] = job

    # =========================================================================
    # REPORTE DETALLADO DE MONITOREO Y ANÁLISIS DE CUELLOS DE BOTELLA
    # =========================================================================
    logger.info("\n" + "=" * 105)
    logger.info("REPORTE DE RENDIMIENTO Y ANÁLISIS DE CUELLOS DE BOTELLA - UNAM (241,035 OBRAS)")
    logger.info("=" * 105)
    logger.info(f"{'Tabla / Entidad':<28} | {'Total (s)':>9} | {'% Total':>8} | {'ClickHouse (s)':>14} | {'CSV Write (s)':>14} | {'Parquet (s)':>11}")
    logger.info("-" * 105)

    sorted_entities = sorted(
        profile_data.items(),
        key=lambda x: (x[1]['end_time'] - x[1]['start_time']) if x[1]['end_time'] else x[1]['ch_query_time'] + x[1]['csv_write_time'],
        reverse=True
    )

    total_time_all_tables = sum(
        (rec['end_time'] - rec['start_time']) if rec['end_time'] else (rec['ch_query_time'] + rec['csv_write_time'])
        for _, rec in profile_data.items()
    )
    total_ch_time = sum(rec['ch_query_time'] for _, rec in profile_data.items())
    total_csv_time = sum(rec['csv_write_time'] for _, rec in profile_data.items())
    total_parquet_time = sum(rec['parquet_write_time'] for _, rec in profile_data.items())

    for ent_name, rec in sorted_entities:
        t_total = (rec['end_time'] - rec['start_time']) if rec['end_time'] else (rec['ch_query_time'] + rec['csv_write_time'] + rec['parquet_write_time'])
        pct = (t_total / total_time_all_tables * 100.0) if total_time_all_tables > 0 else 0.0
        ch_t = rec['ch_query_time']
        csv_t = rec['csv_write_time']
        pq_t = rec['parquet_write_time']
        logger.info(f"{ent_name:<28} | {t_total:>8.2f}s | {pct:>7.1f}% | {ch_t:>13.2f}s | {csv_t:>13.2f}s | {pq_t:>10.2f}s")

    logger.info("-" * 105)
    logger.info(f"{'TOTALES':<28} | {total_time_all_tables:>8.2f}s | 100.0% | {total_ch_time:>13.2f}s | {total_csv_time:>13.2f}s | {total_parquet_time:>10.2f}s")
    logger.info("=" * 105)
    logger.info(f"Tiempo Total de Pipeline (17 tablas, 238 CSVs, 35 Parquets): {t_pipeline:.2f}s ({t_pipeline/60:.2f} minutos)")
    logger.info(f"Memoria Final: {get_memory_mb()} MB")
    logger.info("=" * 105)

if __name__ == '__main__':
    main()
