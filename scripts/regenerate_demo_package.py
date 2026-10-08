import sys
import os
import json
from pathlib import Path
from datetime import datetime

# Aumentar timeout para evitar cortes de conexión bajo carga
os.environ['CH_QUERY_TIMEOUT'] = '1800'

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from openalex_indicators_engine import TlachIAMetricsEngine
from openalex_indicators_engine.core.config import EXPORTS_DIR

PACKAGE_NAME = "Artificial_Intelligence_in_Education"
target_dir = EXPORTS_DIR / PACKAGE_NAME

print(f"🧹 Preparando directorio demo: {target_dir}")
target_dir.mkdir(parents=True, exist_ok=True)

engine = TlachIAMetricsEngine()

filters = {
    'topic_ids': ['T14414'],
    'topic_logic': 'OR',
    'start_year': 1970,
    'end_year': 2026
}

clauses = engine.corpus_builder._build_where_clauses(filters)
where_sql = " AND ".join(clauses)
print(f"🔎 Filtro SQL: {where_sql}")

periods = [
    (2016, 2020),
    (2021, 2026)
]

print("⚙️ Ejecutando pipeline de agregadores en ClickHouse Pushdown...")
result = engine.process_and_export_package(
    package_name=PACKAGE_NAME,
    filters_sql=where_sql,
    periods=periods,
    export_parquet=True,
    export_json=False,
    create_zip=True
)

total_works = result.get('total_works', 0)
print(f"✅ Paquete procesado exitosamente con {total_works} obras.")

manifest_data = {
    'package_name': PACKAGE_NAME,
    'total_works': total_works,
    'source_mode': 'filters',
    'filters': filters,
    'periods': result.get('periods', []),
    'selected_entities': result.get('selected_entities', []),
    'table_types': result.get('table_types', {}),
    'has_performance_matrix': result.get('has_performance_matrix', True),
    'is_demo': True,
    'is_public': True,
    'created_at': datetime.now().isoformat(),
    'total_csv_files': result.get('total_csv_files', 0),
    'total_excel_files': result.get('total_excel_files', 0),
    'tables_summary': result.get('tables_summary', {}),
    'owner_orcid': '',
    'owner_name': 'Universidad Nacional Autónoma de México (UNAM)',
    'has_zip': True,
    'has_json': False
}

manifest_file = target_dir / "manifest.json"
with open(manifest_file, 'w', encoding='utf-8') as mf:
    json.dump(manifest_data, mf, ensure_ascii=False, indent=2)

print(f"📋 manifest.json guardado en {manifest_file}")
