"""
TlachIA Metrics - scripts/populate_static_cubes.py
Script de migración y poblado controlado (Zero-Impact) de Cubos de Datos Estáticos en ClickHouse:
- cube_countries_yearly
- cube_topics_yearly
- cube_institutions_yearly
- cube_sources_yearly
- cube_topic_country_yearly

Ejecución suave y particionada por año:
python scripts/populate_static_cubes.py --year 2024
python scripts/populate_static_cubes.py --start-year 2020 --end-year 2025 --cooldown-seconds 2
"""
import sys
import time
import argparse
import logging
from pathlib import Path
from typing import List

# Asegurar que el directorio raíz de TlachIA-Metrics esté en sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from openalex_indicators_engine.core.gentle_query_engine import GentleQueryEngine

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("cube_populator")

GLOBAL_SOUTH_SQL = "', '".join([
    'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'UY', 'VE', 'EC', 'BO', 'PY', 'CU', 'DO', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'JM', 'TT',
    'ZA', 'EG', 'NG', 'KE', 'GH', 'ET', 'TZ', 'UG', 'DZ', 'MA', 'TN', 'SN', 'CM', 'CI', 'ZW',
    'IN', 'ID', 'PK', 'BD', 'PH', 'VN', 'TH', 'MY', 'IR', 'IQ', 'JO', 'LB', 'LK', 'NP', 'KZ', 'UZ'
])

METRIC_AGGREGATION_SQL = f"""
    count() AS doc_count,
    sum(cited_by_count) AS cits_sum,
    countIf(cited_by_count > 0) AS docs_cited_sum,
    round(sum(fwci), 4) AS fwci_sum,
    round(sum(percentile), 2) AS percentile_sum,
    countIf(is_top_10 = 1 OR percentile >= 90.0) AS top_10_sum,
    countIf(is_top_1 = 1 OR percentile >= 99.0) AS top_1_sum,
    countIf(is_oa = 1 OR lower(oa_status) IN ('gold', 'diamond', 'green', 'hybrid', 'bronze')) AS oa_total_sum,
    countIf(lower(oa_status) = 'gold') AS gold_sum,
    countIf(lower(oa_status) = 'diamond') AS diamond_sum,
    countIf(lower(oa_status) = 'green') AS green_sum,
    countIf(lower(oa_status) = 'hybrid') AS hybrid_sum,
    countIf(lower(oa_status) = 'bronze') AS bronze_sum,
    countIf(lower(oa_status) = 'closed') AS closed_sum,
    countIf(is_doaj_indexed = 1) AS doaj_sum,
    countIf(is_core_journal = 1) AS cwts_core_sum,
    countIf(length(country_codes) > 1) AS intl_collab_sum,
    countIf(length(country_codes) = 1) AS domestic_collab_sum,
    countIf(length(country_codes) > 1 AND arrayAll(c -> has(['{GLOBAL_SOUTH_SQL}'], c), country_codes)) AS global_south_sum,
    countIf(has(institution_types, 'company')) AS industry_sum,
    round(sum(apc_paid_usd), 2) AS apc_paid_usd_sum,
    round(countIf(lower(oa_status) = 'diamond') * 1800.0, 2) AS diamond_savings_usd_sum,
    countIf(is_retracted = 1) AS retracted_sum,
    countIf(is_paratext = 1) AS paratext_sum
"""

def populate_countries_year(client, year: int):
    sql = f"""
    INSERT INTO rag.cube_countries_yearly
    SELECT 
        country AS country_code,
        publication_year,
        {METRIC_AGGREGATION_SQL}
    FROM rag.works_flat
    ARRAY JOIN country_codes AS country
    WHERE publication_year = {year} AND country != ''
    GROUP BY country, publication_year
    SETTINGS max_threads = 4, max_memory_usage = 8000000000
    """
    client.command(sql)

def populate_topics_year(client, year: int):
    sql = f"""
    INSERT INTO rag.cube_topics_yearly
    SELECT 
        topic_id,
        publication_year,
        {METRIC_AGGREGATION_SQL}
    FROM rag.works_flat
    WHERE publication_year = {year} AND topic_id != ''
    GROUP BY topic_id, publication_year
    SETTINGS max_threads = 4, max_memory_usage = 8000000000
    """
    client.command(sql)

def populate_institutions_year(client, year: int):
    sql = f"""
    INSERT INTO rag.cube_institutions_yearly
    SELECT 
        inst_id AS institution_id,
        publication_year,
        {METRIC_AGGREGATION_SQL}
    FROM rag.works_flat
    ARRAY JOIN institution_ids AS inst_id
    WHERE publication_year = {year} AND inst_id != ''
    GROUP BY inst_id, publication_year
    SETTINGS max_threads = 4, max_memory_usage = 8000000000, max_bytes_before_external_group_by = 4000000000
    """
    client.command(sql)

def populate_sources_year(client, year: int):
    sql = f"""
    INSERT INTO rag.cube_sources_yearly
    SELECT 
        source_id,
        publication_year,
        {METRIC_AGGREGATION_SQL}
    FROM rag.works_flat
    WHERE publication_year = {year} AND source_id != ''
    GROUP BY source_id, publication_year
    SETTINGS max_threads = 4, max_memory_usage = 8000000000
    """
    client.command(sql)

def populate_topic_country_year(client, year: int):
    sql = f"""
    INSERT INTO rag.cube_topic_country_yearly
    SELECT 
        topic_id,
        country AS country_code,
        publication_year,
        {METRIC_AGGREGATION_SQL}
    FROM rag.works_flat
    ARRAY JOIN country_codes AS country
    WHERE publication_year = {year} AND topic_id != '' AND country != ''
    GROUP BY topic_id, country, publication_year
    SETTINGS max_threads = 4, max_memory_usage = 8000000000, max_bytes_before_external_group_by = 4000000000
    """
    client.command(sql)

CUBE_HANDLERS = {
    'countries': ('cube_countries_yearly', populate_countries_year),
    'topics': ('cube_topics_yearly', populate_topics_year),
    'institutions': ('cube_institutions_yearly', populate_institutions_year),
    'sources': ('cube_sources_yearly', populate_sources_year),
    'topic_country': ('cube_topic_country_yearly', populate_topic_country_year)
}

def main():
    parser = argparse.ArgumentParser(description="Poblado controlado de cubos estáticos en ClickHouse")
    parser.add_argument("--year", type=int, help="Año único a poblar (ej. 2024 para prueba piloto)")
    parser.add_argument("--start-year", type=int, default=1976, help="Año de inicio para rango (por defecto 1976)")
    parser.add_argument("--end-year", type=int, default=2026, help="Año final para rango (por defecto 2026)")
    parser.add_argument("--cubes", type=str, default="countries,topics,institutions,sources,topic_country",
                        help="Lista separada por comas de cubos a poblar")
    parser.add_argument("--cooldown-seconds", type=float, default=2.0, help="Segundos de enfriamiento entre años")
    parser.add_argument("--force", action="store_true", help="Forzar recálculo e inserción aunque el año ya tenga datos")
    parser.add_argument("--truncate", action="store_true", help="Truncar tablas seleccionadas antes de iniciar")

    args = parser.parse_args()

    years = [args.year] if args.year else list(range(args.end_year, args.start_year - 1, -1))
    requested_cubes = [c.strip() for c in args.cubes.split(',') if c.strip() in CUBE_HANDLERS]

    engine = GentleQueryEngine()
    client = engine.get_client()

    if args.truncate:
        logger.info("Truncando tablas seleccionadas antes de iniciar...")
        for cube_key in requested_cubes:
            tbl_name, _ = CUBE_HANDLERS[cube_key]
            try:
                client.command(f"TRUNCATE TABLE rag.{tbl_name}")
                logger.info(f" ✓ Tabla rag.{tbl_name} truncada exitosamente.")
            except Exception as e:
                logger.error(f" ✗ Error al truncar rag.{tbl_name}: {e}")

    logger.info(f"Iniciando poblado controlado para años: {years}")
    logger.info(f"Cubos seleccionados: {requested_cubes}")
    logger.info(f"Tiempo de enfriamiento entre años: {args.cooldown_seconds}s")

    for yr in years:
        logger.info(f"\n=================== PROCESANDO AÑO {yr} ===================")
        for cube_key in requested_cubes:
            table_name, handler = CUBE_HANDLERS[cube_key]
            if not args.force:
                try:
                    chk_df = client.query_df(f"SELECT count() FROM rag.{table_name} WHERE publication_year = {yr}")
                    existing_cnt = chk_df.iloc[0, 0]
                    if existing_cnt > 0:
                        logger.info(f" -> [SKIP] {table_name} ({yr}) ya contiene {existing_cnt:,} filas. Se omite (usa --force para reinsertar).")
                        continue
                except Exception as e:
                    logger.warning(f"No se pudo verificar existencia previa en {table_name} ({yr}): {e}")

            t0 = time.time()
            logger.info(f" -> Poblando {table_name} para {yr}...")
            try:
                handler(client, yr)
                elapsed = time.time() - t0
                # Obtener conteo de filas insertadas
                cnt_df = client.query_df(f"SELECT count() FROM rag.{table_name} WHERE publication_year = {yr}")
                inserted_rows = cnt_df.iloc[0, 0]
                logger.info(f"    ✓ Completado en {elapsed:.2f}s | Filas en {yr}: {inserted_rows:,}")
            except Exception as e:
                logger.error(f"    ✗ Error poblando {table_name} ({yr}): {e}")

        if args.cooldown_seconds > 0:
            logger.info(f"Enfriamiento de {args.cooldown_seconds}s para proteger recursos del servidor...")
            time.sleep(args.cooldown_seconds)

    logger.info("\n✓ ¡Proceso de poblado controlado finalizado con éxito!")

if __name__ == "__main__":
    main()
