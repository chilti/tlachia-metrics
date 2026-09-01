"""
TlachIA Metrics - openalex_indicators_engine
engine.py
Orquestador maestro: Coordina la construcción del corpus, el cálculo exhaustivo
de todas las entidades y la exportación unificada del paquete .zip (incluyendo los 48 Excel
y el archivo JSON completo de registros OpenAlex).
"""
import os
import json
import logging
import pandas as pd
import numpy as np
from datetime import date, datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Union

from .core.config import EXPORTS_DIR, CACHE_DIR, RECENT_PERIOD_START, RECENT_PERIOD_END
from .core.corpus_builder import CorpusBuilder
from .core.gentle_query_engine import GentleQueryEngine
from .aggregators.locations_aggregator import LocationsAggregator, SubnationalAggregator
from .aggregators.organizations_aggregator import OrganizationsAggregator, SectorTypesAggregator, OrganizationsColabAggregator
from .aggregators.researchers_aggregator import ResearchersAggregator
from .aggregators.sources_aggregator import SourcesAggregator
from .aggregators.funding_aggregator import FundingAggregator
from .aggregators.taxonomy_aggregator import (
    MacroTopicsAggregator, MesoTopicsAggregator, MicroTopicsAggregator, ESIAggregator, SDGAggregator
)
from .aggregators.concepts_keywords_aggregator import ConceptsAggregator, KeywordsAggregator
from .aggregators.economic_apc_aggregator import EconomicAPCAggregator
from .exporters.excel_builder import save_styled_excel
from .exporters.zip_packager import create_unified_indicators_zip
from .exporters.parquet_exporter import save_parquet_table

logger = logging.getLogger(__name__)

class JSONCustomEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

class TlachIAMetricsEngine:
    """
    Motor Unificado de Cálculo de Indicadores Cienciométricos, Económicos y de Ciencia Abierta.
    """
    def __init__(self, query_engine: Optional[GentleQueryEngine] = None):
        self.query_engine = query_engine or GentleQueryEngine()
        self.corpus_builder = CorpusBuilder(self.query_engine)

    def load_corpus(self, source: Union[str, Path, List[str]], source_type: str = 'auto') -> pd.DataFrame:
        if isinstance(source, (str, Path)) and Path(str(source)).exists():
            return self.corpus_builder.from_file(source)
        elif isinstance(source, list):
            sample = source[0] if source else ''
            if str(sample).startswith('10.') or 'doi.org' in str(sample):
                return self.corpus_builder.from_dois(source)
            else:
                return self.corpus_builder.from_openalex_ids(source)
        else:
            raise ValueError(f'Tipo de fuente no reconocida: {source}')

    def process_and_export_package(self, df: pd.DataFrame, package_name: str = 'TlachIA_Metrics_Report',
                                   output_dir: Optional[Union[str, Path]] = None,
                                   export_parquet: bool = True,
                                   export_json: bool = True,
                                   raw_json_source: Optional[Union[str, Path]] = None,
                                   progress_callback: Optional[Any] = None) -> Dict[str, Any]:
        """
        Ejecuta el pipeline completo:
        1. Calcula indicadores para todas las 16 entidades (Histórico, 2021-2025 y Trend).
        2. Guarda cada tabla en archivo Excel formateado (.xlsx).
        3. Exporta el archivo JSON completo de registros del corpus.
        4. Opcionalmente exporta las tablas Parquet.
        5. Empaqueta todos los archivos Excel y el JSON completo en un único archivo comprimido .zip.
        """
        if df is None or len(df) == 0:
            raise ValueError('El DataFrame del corpus está vacío.')

        if progress_callback:
            progress_callback(10, 'Iniciando estructuración de carpetas y carga de entidades...')

        out_d = Path(output_dir or (EXPORTS_DIR / package_name))
        excel_dir = out_d / 'excel_reports'
        parquet_dir = out_d / 'parquet_tables'
        excel_dir.mkdir(parents=True, exist_ok=True)
        if export_parquet:
            parquet_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f'Iniciando procesamiento de {len(df)} artículos para paquete {package_name}...')

        aggregators_map = {
            'Locations': LocationsAggregator(),
            'Locations Subnational': SubnationalAggregator(),
            'Organizations': OrganizationsAggregator(),
            'Organizations Colab': OrganizationsColabAggregator(),
            'Sector Types': SectorTypesAggregator(),
            'Researchers': ResearchersAggregator(),
            'Publication Sources': SourcesAggregator(),
            'Funding Agencies': FundingAggregator(),
            'Research Areas Macro Topics': MacroTopicsAggregator(),
            'Research Areas Meso Topics': MesoTopicsAggregator(),
            'Research Areas Micro Topics': MicroTopicsAggregator(),
            'Research Areas ESI': ESIAggregator(),
            'Research Areas SDG': SDGAggregator(),
            'Concepts': ConceptsAggregator(),
            'Keywords': KeywordsAggregator(),
            'Economic APC Breakdown': EconomicAPCAggregator()
        }

        package_files_to_zip = []
        tables_summary = {}

        total_aggs = len(aggregators_map)
        for idx, (entity_label, agg) in enumerate(aggregators_map.items(), start=1):
            pct = 15 + int((idx / total_aggs) * 65)
            if progress_callback:
                progress_callback(pct, f'Calculando indicadores: {entity_label} ({idx}/{total_aggs})...')
            
            logger.info(f'Calculando {entity_label}...')
            
            # 1. Histórico Completo
            df_full = agg.aggregate_full(df)
            f_full = excel_dir / f'{entity_label}.xlsx'
            save_styled_excel(df_full, f_full, sheet_name='Full Period')
            package_files_to_zip.append(f_full)
            if export_parquet and len(df_full) > 0:
                save_parquet_table(df_full, parquet_dir / f'{entity_label.lower().replace(" ", "_")}_full.parquet')

            # 2. Periodo Reciente (2021-2025)
            df_rec = agg.aggregate_recent(df, start_year=RECENT_PERIOD_START, end_year=RECENT_PERIOD_END)
            f_rec = excel_dir / f'{entity_label} 2021-2025.xlsx'
            save_styled_excel(df_rec, f_rec, sheet_name='2021-2025')
            package_files_to_zip.append(f_rec)
            if export_parquet and len(df_rec) > 0:
                save_parquet_table(df_rec, parquet_dir / f'{entity_label.lower().replace(" ", "_")}_recent.parquet')

            # 3. Tendencia Anual (Trend)
            df_trend = agg.aggregate_trend(df)
            f_trend = excel_dir / f'{entity_label} Trend.xlsx'
            save_styled_excel(df_trend, f_trend, sheet_name='Annual Trend')
            package_files_to_zip.append(f_trend)
            if export_parquet and len(df_trend) > 0:
                save_parquet_table(df_trend, parquet_dir / f'{entity_label.lower().replace(" ", "_")}_trend.parquet')

            tables_summary[entity_label] = {
                'full_rows': len(df_full),
                'recent_rows': len(df_rec),
                'trend_rows': len(df_trend)
            }

        # 4. Exportar el archivo JSON completo de registros
        json_file_path = None
        if export_json:
            if progress_callback:
                progress_callback(85, 'Exportando archivo JSON consolidado del corpus...')
            json_file_path = out_d / f'{package_name}_openalex_works.json'
            logger.info(f'Exportando archivo JSON completo del corpus a: {json_file_path}')
            
            if raw_json_source and Path(raw_json_source).exists() and str(raw_json_source).endswith('.json'):
                with open(raw_json_source, 'rb') as src_f, open(json_file_path, 'wb') as dst_f:
                    dst_f.write(src_f.read())
            else:
                records = df.to_dict(orient='records')
                with open(json_file_path, 'w', encoding='utf-8') as jf:
                    json.dump(records, jf, cls=JSONCustomEncoder, ensure_ascii=False, indent=2)

            package_files_to_zip.append(json_file_path)

        # 5. Empaquetado unificado en un solo archivo .zip
        if progress_callback:
            progress_callback(92, 'Generando archivo .ZIP unificado...')
        zip_path = out_d / f'{package_name}.zip'
        create_unified_indicators_zip(package_files_to_zip, zip_path)
        logger.info(f'Paquete unificado generado con éxito en: {zip_path}')

        if progress_callback:
            progress_callback(100, '¡Proceso completado exitosamente!')

        return {
            'package_name': package_name,
            'total_works': len(df),
            'total_excel_files': 48,
            'json_file_path': str(json_file_path) if json_file_path else None,
            'zip_path': str(zip_path),
            'excel_directory': str(excel_dir),
            'tables_summary': tables_summary
        }
