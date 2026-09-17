#!/usr/bin/env python3
"""
scripts/harvest_wos_pubmed.py
Script para procesar corpus de Web of Science / InCites, resolver identificadores,
descargar todos los campos de metadatos desde PubMed y exportar en Parquet, CSV y texto plano MEDLINE.
"""
import os
import sys
import time
import json
import argparse
import logging
from typing import List, Dict, Any, Optional, Union
from pathlib import Path
import pandas as pd

# Asegurar path de TlachIA-Metrics
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from openalex_indicators_engine.core.pubmed_client import PubMedClient
from openalex_indicators_engine.core.pubmed_parser import parse_pubmed_xml_to_dataframe
from openalex_indicators_engine.core.config import EXPORTS_DIR

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger('harvest_wos_pubmed')


def harvest_wos_pubmed(
    input_file: Union[str, Path],
    output_dir: Path,
    limit: Optional[int] = None,
    batch_size: int = 500,
    resolve_dois: bool = True
):
    input_path = Path(input_file)
    if not input_path.exists():
        raise FileNotFoundError(f"No existe el archivo de entrada: {input_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Iniciando procesamiento de archivo: {input_path}")

    df_wos = pd.read_csv(input_path, sep=None, engine='python', dtype=str)
    total_raw = len(df_wos)
    logger.info(f"Total registros leídos de WoS/InCites: {total_raw}")

    if limit and limit > 0:
        df_wos = df_wos.head(limit)
        logger.info(f"Límite aplicado: procesando primeros {len(df_wos)} registros.")

    client = PubMedClient()

    logger.info("Ejecutando resolución multi-etapa robusta (PMIDs directos, DOIs vía POST y fallback por Título)...")

    def id_progress(stage, current, total):
        pct = round((current / total) * 100, 1) if total > 0 else 0
        logger.info(f"Resolviendo identificadores [{stage}]: {current}/{total} ({pct}%)")

    pmid_map, stats = client.resolve_corpus_identifiers(
        df=df_wos,
        resolve_titles_doc_types=["Article", "Review", "Journal Article", "Clinical Trial"],
        callback_progress=id_progress
    )

    logger.info(f"Resultados de resolución: {stats}")
    logger.info(f"Total de registros con PMID listos para descarga exhaustiva: {len(pmid_map)} de {len(df_wos)}")

    if not pmid_map:
        logger.error("No se encontraron PMIDs para descargar.")
        return

    # Lista única y ordenada de PMIDs
    unique_pmids = list(dict.fromkeys(pmid_map.values()))
    logger.info(f"PMIDs únicos a descargar: {len(unique_pmids)}")

    # 3. Descarga en lotes con barra de progreso y exportación simultánea a .medline
    base_name = input_path.stem.replace(" ", "_")
    pubmed_output = output_dir / f"{base_name}_pubmed.txt"
    medline_output = output_dir / f"{base_name}.medline"
    parquet_output = output_dir / f"{base_name}_pubmed_full.parquet"
    csv_output = output_dir / f"{base_name}_pubmed_full.csv"

    logger.info(f"Descargando metadatos completos y guardando texto plano Formato PubMed en: {pubmed_output}")

    def progress_callback(current, total, msg):
        pct = round((current / total) * 100, 1) if total > 0 else 0
        logger.info(f"[{pct}%] ({current}/{total}) {msg}")

    start_time = time.time()
    df_pubmed = client.download_corpus_from_pmids(
        pmids=unique_pmids,
        batch_size=batch_size,
        save_medline_path=pubmed_output,
        callback_progress=progress_callback
    )
    # Copia o respaldo con extensión .medline
    if pubmed_output.exists():
        import shutil
        shutil.copyfile(pubmed_output, medline_output)
    elapsed = round(time.time() - start_time, 2)
    logger.info(f"Descarga completada en {elapsed}s. Total artículos parseados desde PubMed: {len(df_pubmed)}")

    if df_pubmed.empty:
        logger.error("No se pudieron parsear registros de PubMed.")
        return

    # 4. Cruzar / Vincular con las columnas originales de WoS
    # Crear columna auxiliar para join por pmid
    df_wos["pmid_resolved"] = [pmid_map.get(idx, "") for idx in df_wos.index]
    merged_df = pd.merge(
        df_pubmed,
        df_wos,
        left_on="pmid",
        right_on="pmid_resolved",
        how="left"
    )

    # 5. Guardar archivos resultantes
    logger.info(f"Guardando Parquet enriquecido en: {parquet_output}")
    merged_df.to_parquet(parquet_output, index=False)

    logger.info(f"Guardando CSV enriquecido en: {csv_output}")
    # Para CSV, convertir columnas de listas/dicts a strings JSON legibles
    csv_df = merged_df.copy()
    for col in csv_df.columns:
        if csv_df[col].apply(lambda x: isinstance(x, (list, dict))).any():
            csv_df[col] = csv_df[col].apply(lambda x: json.dumps(x, ensure_ascii=False) if isinstance(x, (list, dict)) else x)
    csv_df.to_csv(csv_output, index=False, encoding='utf-8')

    medline_size_mb = round(medline_output.stat().st_size / (1024 * 1024), 2) if medline_output.exists() else 0
    parquet_size_mb = round(parquet_output.stat().st_size / (1024 * 1024), 2) if parquet_output.exists() else 0

    logger.info("=" * 60)
    logger.info("🎉 COSECHA Y EXTRACCIÓN DE METADATOS PUBMED COMPLETADA CON ÉXITO")
    logger.info(f"  Total documentos procesados: {len(merged_df)}")
    logger.info(f"  Archivo Formato PubMed (.txt): {pubmed_output} ({medline_size_mb} MB)")
    logger.info(f"  Archivo Parquet completo:      {parquet_output} ({parquet_size_mb} MB)")
    logger.info(f"  Archivo CSV completo:          {csv_output}")
    logger.info("=" * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Descarga y enriquecimiento exhaustivo de metadatos PubMed desde WoS/InCites")
    parser.add_argument(
        '--input-file',
        type=str,
        default="/home/jlja/Downloads/Web of Science Documents WoS Categories.csv",
        help="Ruta al archivo CSV de Web of Science / InCites"
    )
    parser.add_argument(
        '--output-dir',
        type=str,
        default=str(EXPORTS_DIR),
        help="Directorio de destino para los archivos generados"
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help="Límite opcional de documentos a procesar (ej. para pruebas)"
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=500,
        help="Tamaño de lote para efetch (default 500)"
    )
    parser.add_argument(
        '--no-resolve-dois',
        action='store_true',
        help="Desactivar resolución de DOIs que no tienen PMID"
    )

    args = parser.parse_args()
    Union_Path = Union[str, Path]
    harvest_wos_pubmed(
        input_file=args.input_file,
        output_dir=Path(args.output_dir),
        limit=args.limit,
        batch_size=args.batch_size,
        resolve_dois=not args.no_resolve_dois
    )
