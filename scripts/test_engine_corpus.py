"""
Test de integración para verificar TlachIAMetricsEngine con CorpusAggregator.
"""
import json
import shutil
import pandas as pd
from pathlib import Path
from openalex_indicators_engine import TlachIAMetricsEngine

json_path = Path("/mnt/expansion/desplegados/TlachIA-Metrics/data/exports/Mi_Corpus_TlachIA/Mi_Corpus_TlachIA_openalex_works.json")
with open(json_path, "r", encoding="utf-8") as f:
    works = json.load(f)

df = pd.DataFrame(works[:100]) # Muestra rápida de 100 obras
print(f"Muestra para prueba: {len(df)} obras")

test_out = Path("/mnt/expansion/desplegados/TlachIA-Metrics/data/exports/Test_Corpus_Package")
if test_out.exists():
    shutil.rmtree(test_out)

engine = TlachIAMetricsEngine()
result = engine.process_and_export_package(
    df=df,
    package_name="Test_Corpus_Package",
    output_dir=test_out,
    periods=[(2011, 2015), (2016, 2020), (2021, 2025)],
    export_parquet=True,
    export_json=True,
    create_zip=True
)

print("\n=== RESULTADO DEL PAQUETE ===")
print("Total obras:", result['total_works'])
print("Total Excel files:", result['total_excel_files'])
print("ZIP path:", result['zip_path'])

excel_dir = test_out / "excel_reports"
corpus_excels = list(excel_dir.glob("Corpus*.xlsx"))
print("\n=== ARCHIVOS EXCEL DE CORPUS GENERADOS ===")
for ce in corpus_excels:
    print(" -", ce.name)

parquet_dir = test_out / "parquet_tables"
corpus_parquets = list(parquet_dir.glob("corpus*.parquet"))
print("\n=== TABLAS PARQUET DE CORPUS GENERADAS ===")
for cp in corpus_parquets:
    print(" -", cp.name)

# Verificar contenidos del ZIP
import zipfile
with zipfile.ZipFile(result['zip_path']) as z:
    names = z.namelist()
    print("\n=== CLASIFICACIÓN DENTRO DEL ZIP ===")
    for n in names:
        if "Corpus" in n or "corpus" in n:
            print(" [ZIP]", n)

print("\n✓ ¡Prueba de integración de TlachIAMetricsEngine con Corpus exitosa!")
