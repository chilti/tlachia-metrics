import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import time
import clickhouse_connect
from openalex_indicators_engine.core.config import CH_HOST, CH_PORT, CH_USER, CH_PASSWORD, CH_DATABASE

client = clickhouse_connect.get_client(host=CH_HOST, port=CH_PORT, username=CH_USER, password=CH_PASSWORD, database=CH_DATABASE)

years = [2022, 2023, 2024, 2025, 2026]

for y in years:
    t0 = time.time()
    print(f"[{time.strftime('%H:%M:%S')}] Iniciando inserción para el año {y} en rag.work_citations...", flush=True)
    
    # Comprobar si ya existen registros de ese año
    existing = client.query(f"SELECT count(*) FROM rag.work_citations WHERE citing_publication_year = {y}").result_rows[0][0]
    if existing > 0:
        print(f"  -> Año {y} ya contiene {existing:,} registros. Saltando.", flush=True)
        continue
    
    insert_sql = f"""
    INSERT INTO rag.work_citations (cited_work_id, citing_work_id, citing_publication_year)
    SELECT
        arrayJoin(referenced_works) AS cited_work_id,
        id AS citing_work_id,
        publication_year AS citing_publication_year
    FROM rag.works_flat
    WHERE publication_year = {y} AND length(referenced_works) > 0
    """
    client.command(insert_sql)
    elapsed = time.time() - t0
    
    total_in_year = client.query(f"SELECT count(*) FROM rag.work_citations WHERE citing_publication_year = {y}").result_rows[0][0]
    print(f"[{time.strftime('%H:%M:%S')}] ✅ Año {y} completado: {total_in_year:,} aristas de citación insertadas en {elapsed:.1f}s.\n", flush=True)

print(f"[{time.strftime('%H:%M:%S')}] 🚀 Sincronización completa finalizada con éxito!", flush=True)
