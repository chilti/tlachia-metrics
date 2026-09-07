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
from typing import Dict, Any, List, Optional, Union, Tuple

from .core.config import EXPORTS_DIR, CACHE_DIR, RECENT_PERIOD_START, RECENT_PERIOD_END
from .core.corpus_builder import CorpusBuilder
from .core.gentle_query_engine import GentleQueryEngine
from .aggregators.locations_aggregator import LocationsAggregator, SubnationalAggregator
from .aggregators.organizations_aggregator import OrganizationsAggregator, SectorTypesAggregator, OrganizationsColabAggregator
from .aggregators.researchers_aggregator import ResearchersAggregator
from .aggregators.sources_aggregator import SourcesAggregator
from .aggregators.funding_aggregator import FundingAggregator
from .aggregators.taxonomy_aggregator import (
    DomainAggregator, FieldAggregator, SubfieldAggregator, TopicAggregator, SDGAggregator,
    MacroTopicsAggregator, MesoTopicsAggregator, MicroTopicsAggregator  # backwards-compat aliases
)
from .aggregators.concepts_keywords_aggregator import ConceptsAggregator, KeywordsAggregator
from .aggregators.economic_apc_aggregator import EconomicAPCAggregator
from .exporters.excel_builder import save_styled_excel, save_styled_excel_multisheet
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
                                   periods: Optional[List[Tuple[int, int]]] = None,
                                   export_parquet: bool = True,
                                   export_json: bool = True,
                                   create_zip: bool = True,
                                   raw_json_source: Optional[Union[str, Path]] = None,
                                   progress_callback: Optional[Any] = None) -> Dict[str, Any]:
        """
        Ejecuta el pipeline de indicadores:
        1. Calcula indicadores para las 16 entidades (Histórico, Periodos Consecutivos, Matriz de Desempeño y Trend).
        2. Guarda cada tabla en archivo Excel formateado (.xlsx).
        3. Exporta el archivo JSON completo de registros del corpus.
        4. Opcionalmente exporta las tablas Parquet para consulta interactiva en tiempo real.
        5. Opcionalmente empaqueta en un único archivo comprimido .zip bajo demanda.
        """
        if df is None or len(df) == 0:
            raise ValueError('El DataFrame del corpus está vacío.')

        # Normalizar periodos si no se suministran
        if not periods:
            periods = [(RECENT_PERIOD_START, RECENT_PERIOD_END)]
        else:
            # Asegurar formato List[Tuple[int, int]] y ordenar cronológicamente
            periods = sorted([(int(p[0]), int(p[1])) for p in periods], key=lambda x: x[0])

        if progress_callback:
            progress_callback(10, 'Iniciando estructuración de carpetas y carga de entidades...')

        out_d = Path(output_dir or (EXPORTS_DIR / package_name))
        excel_dir = out_d / 'excel_reports'
        parquet_dir = out_d / 'parquet_tables'
        excel_dir.mkdir(parents=True, exist_ok=True)
        if export_parquet:
            parquet_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f'Iniciando procesamiento de {len(df)} artículos para paquete {package_name} con periodos {periods}...')

        aggregators_map = {
            'Locations': LocationsAggregator(),
            'Locations Subnational': SubnationalAggregator(),
            'Organizations': OrganizationsAggregator(),
            'Organizations Colab': OrganizationsColabAggregator(),
            'Sector Types': SectorTypesAggregator(),
            'Researchers': ResearchersAggregator(),
            'Publication Sources': SourcesAggregator(),
            'Funding Agencies': FundingAggregator(),
            'Research Areas Domain': DomainAggregator(),
            'Research Areas Field': FieldAggregator(),
            'Research Areas Subfield': SubfieldAggregator(),
            'Research Areas Topic': TopicAggregator(),
            'Research Areas SDG': SDGAggregator(),
            'Concepts': ConceptsAggregator(),
            'Keywords': KeywordsAggregator(),
            'Economic APC Breakdown': EconomicAPCAggregator()
        }

        package_files_to_zip = []
        tables_summary = {}
        consolidated_matrices = {}

        total_aggs = len(aggregators_map)
        for idx, (entity_label, agg) in enumerate(aggregators_map.items(), start=1):
            pct = 15 + int((idx / total_aggs) * 65)
            if progress_callback:
                progress_callback(pct, f'Calculando indicadores: {entity_label} ({idx}/{total_aggs})...')
            
            logger.info(f'Calculando {entity_label}...')
            entity_slug = entity_label.lower().replace(" ", "_")
            
            # 1. Histórico Completo
            df_full = agg.aggregate_full(df)
            f_full = excel_dir / f'{entity_label}.xlsx'
            save_styled_excel(df_full, f_full, sheet_name='Full Period')
            package_files_to_zip.append(f_full)
            if export_parquet and len(df_full) > 0:
                f_full_pq = parquet_dir / f'{entity_slug}_full.parquet'
                save_parquet_table(df_full, f_full_pq)
                package_files_to_zip.append(f_full_pq)

            # 2. Periodos Consecutivos
            period_row_counts = {}
            for s_yr, e_yr in periods:
                p_label = f"{s_yr}-{e_yr}"
                p_slug = f"{s_yr}_{e_yr}"
                df_p = agg.aggregate_period(df, start_year=s_yr, end_year=e_yr)
                f_p = excel_dir / f'{entity_label} {p_label}.xlsx'
                save_styled_excel(df_p, f_p, sheet_name=p_label)
                package_files_to_zip.append(f_p)
                if export_parquet and len(df_p) > 0:
                    f_p_pq = parquet_dir / f'{entity_slug}_{p_slug}.parquet'
                    save_parquet_table(df_p, f_p_pq)
                    package_files_to_zip.append(f_p_pq)
                    # Compatibilidad con 'recent' si coincide con RECENT_PERIOD_START/END o el último
                    if (s_yr == RECENT_PERIOD_START and e_yr == RECENT_PERIOD_END) or (s_yr, e_yr) == periods[-1]:
                        f_recent_pq = parquet_dir / f'{entity_slug}_recent.parquet'
                        save_parquet_table(df_p, f_recent_pq)
                        package_files_to_zip.append(f_recent_pq)
                period_row_counts[p_label] = len(df_p)

            # 3. Matriz Comparativa de Desempeño
            df_matrix = agg.aggregate_performance_matrix(df, periods=periods)
            if df_matrix is not None:
                f_matrix = excel_dir / f'{entity_label} Performance Matrix.xlsx'
                save_styled_excel(df_matrix, f_matrix, sheet_name='Performance Matrix')
                package_files_to_zip.append(f_matrix)
                consolidated_matrices[entity_label] = df_matrix
                if export_parquet and len(df_matrix) > 0:
                    f_matrix_pq = parquet_dir / f'{entity_slug}_performance_matrix.parquet'
                    save_parquet_table(df_matrix, f_matrix_pq)
                    package_files_to_zip.append(f_matrix_pq)

            # 4. Tendencia Anual (Trend)
            df_trend = agg.aggregate_trend(df)
            f_trend = excel_dir / f'{entity_label} Trend.xlsx'
            save_styled_excel(df_trend, f_trend, sheet_name='Annual Trend')
            package_files_to_zip.append(f_trend)
            if export_parquet and len(df_trend) > 0:
                f_trend_pq = parquet_dir / f'{entity_slug}_trend.parquet'
                save_parquet_table(df_trend, f_trend_pq)
                package_files_to_zip.append(f_trend_pq)

            tables_summary[entity_label] = {
                'full_rows': len(df_full),
                'periods': period_row_counts,
                'matrix_rows': len(df_matrix) if df_matrix is not None else 0,
                'trend_rows': len(df_trend)
            }

        # Generar Libro Excel Consolidado Multihistorial de Matrices de Desempeño
        if consolidated_matrices:
            f_master_matrix = excel_dir / 'Matriz_Desempeño_Longitudinal_Consolidada.xlsx'
            try:
                save_styled_excel_multisheet(consolidated_matrices, f_master_matrix)
                package_files_to_zip.append(f_master_matrix)
                logger.info(f'Libro consolidado multihistorial de matrices generado en: {f_master_matrix}')
            except Exception as e:
                logger.error(f'Error generando Matriz_Desempeño_Longitudinal_Consolidada.xlsx: {e}', exc_info=True)

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

        # 5. Empaquetado unificado en un solo archivo .zip (opcional / bajo demanda)
        zip_path = None
        if create_zip:
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
            'periods': [f"{s}-{e}" for s, e in periods],
            'has_performance_matrix': True,
            'total_excel_files': len([f for f in package_files_to_zip if str(f).endswith('.xlsx')]),
            'json_file_path': str(json_file_path) if json_file_path else None,
            'zip_path': str(zip_path) if zip_path else None,
            'excel_directory': str(excel_dir),
            'tables_summary': tables_summary
        }
