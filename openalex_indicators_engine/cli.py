"""
TlachIA Metrics - openalex_indicators_engine
cli.py
Interfaz de línea de comandos para construir corpus y ejecutar cálculos de indicadores.
"""
import sys
import argparse
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from openalex_indicators_engine import TlachIAMetricsEngine

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger('TlachIA-Metrics')

def main():
    parser = argparse.ArgumentParser(description='TlachIA Metrics - Motor Unificado de Indicadores OpenAlex')
    parser.add_argument('--file', type=str, help='Ruta a archivo de corpus (JSON, CSV 88 cols o Parquet)')
    parser.add_argument('--topic', type=str, help='ID de Tópico / Frente de investigación OpenAlex')
    parser.add_argument('--source', type=str, help='ID de Revista / Fuente OpenAlex (S...)')
    parser.add_argument('--institution', type=str, help='ID o ROR de Institución OpenAlex (I...)')
    parser.add_argument('--package-name', type=str, default='TlachIA_Metrics_Package', help='Nombre del paquete de salida')
    parser.add_argument('--output-dir', type=str, help='Directorio de salida personalizado')
    parser.add_argument('--no-parquet', action='store_true', help='Desactivar exportación de Parquet')
    parser.add_argument('--no-json', action='store_true', help='Desactivar inclusión de archivo JSON')

    args = parser.parse_args()
    engine = TlachIAMetricsEngine()

    df = None
    raw_json_source = None
    if args.file:
        logger.info(f'Cargando corpus desde archivo: {args.file}')
        df = engine.load_corpus(args.file)
        if str(args.file).endswith('.json'):
            raw_json_source = args.file
    elif args.topic:
        logger.info(f'Extrayendo corpus desde ClickHouse para tópico: {args.topic}')
        df = engine.corpus_builder.from_topic_id(args.topic)
    elif args.source:
        logger.info(f'Extrayendo corpus desde ClickHouse para fuente: {args.source}')
        df = engine.corpus_builder.from_source_id(args.source)
    elif args.institution:
        logger.info(f'Extrayendo corpus desde ClickHouse para institución: {args.institution}')
        df = engine.corpus_builder.from_institution_id(args.institution)
    else:
        logger.error('Debe especificar al menos una fuente de corpus (--file, --topic, --source, --institution).')
        sys.exit(1)

    if df is None or len(df) == 0:
        logger.error('No se recuperaron artículos para el corpus especificado.')
        sys.exit(1)

    logger.info(f'Corpus listo: {len(df)} artículos. Procesando indicadores...')
    result = engine.process_and_export_package(
        df,
        package_name=args.package_name,
        output_dir=args.output_dir,
        export_parquet=not args.no_parquet,
        export_json=not args.no_json,
        raw_json_source=raw_json_source
    )

    print()
    print('======================================================')
    print('  🎉 TlachIA Metrics: Procesamiento Completado')
    print('======================================================')
    print(f'  Total Artículos Procesados : {result["total_works"]:,}')
    print(f'  Total Archivos Excel       : {result["total_excel_files"]}')
    print(f'  Archivo JSON Completo      : {result["json_file_path"]}')
    print(f'  Paquete Zip Consolidado    : {result["zip_path"]}')
    print('======================================================')
    print()

if __name__ == '__main__':
    main()
