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
from .core.clickhouse_pushdown_engine import ClickHousePushdownEngine
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

SUPPORTED_ENTITIES = [
    'Corpus',
    'Locations',
    'Locations Subnational',
    'Organizations',
    'Organizations Colab',
    'Sector Types',
    'Researchers',
    'Publication Sources',
    'Funding Agencies',
    'Research Areas Domain',
    'Research Areas Field',
    'Research Areas Subfield',
    'Research Areas Topic',
    'Research Areas SDG',
    'Concepts',
    'Keywords',
    'Economic APC Breakdown'
]

ENTITY_SLUG_MAP = {e.lower().replace(" ", "_"): e for e in SUPPORTED_ENTITIES}
ENTITY_SLUG_MAP.update({
    'domain': 'Research Areas Domain',
    'field': 'Research Areas Field',
    'subfield': 'Research Areas Subfield',
    'topic': 'Research Areas Topic',
    'sdg': 'Research Areas SDG',
    'economic_apc': 'Economic APC Breakdown'
})

DEFAULT_SELECTED_ENTITIES = [
    'corpus',
    'organizations',
    'locations',
    'research_areas_topic',
    'publication_sources'
]

class TlachIAMetricsEngine:
    """
    Motor Unificado de Cálculo de Indicadores Cienciométricos, Económicos y de Ciencia Abierta.
    """
    def __init__(self, query_engine: Optional[GentleQueryEngine] = None):
        self.query_engine = query_engine or GentleQueryEngine()
        self.corpus_builder = CorpusBuilder(self.query_engine)
        self.pushdown_engine = ClickHousePushdownEngine(self.query_engine)

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

    def process_and_export_package(self, df: Optional[pd.DataFrame] = None, package_name: str = 'TlachIA_Metrics_Report',
                                   output_dir: Optional[Union[str, Path]] = None,
                                   periods: Optional[List[Tuple[int, int]]] = None,
                                   export_parquet: bool = True,
                                   export_json: bool = False,
                                   export_works_csv: bool = False,
                                   create_zip: bool = True,
                                   raw_json_source: Optional[Union[str, Path]] = None,
                                   progress_callback: Optional[Any] = None,
                                   filters_sql: Optional[str] = None,
                                   work_ids: Optional[List[str]] = None,
                                   limit: Optional[int] = None,
                                   selected_entities: Optional[List[str]] = None,
                                   table_types: Optional[Dict[str, bool]] = None) -> Dict[str, Any]:
        """
        Ejecuta el pipeline de indicadores de forma 100% pushdown en ClickHouse:
        1. Configura el contexto en ClickHouse (directamente vía filters_sql o IDs, sin descargar obras a Python).
        2. Calcula indicadores para las entidades seleccionadas (5 por defecto) y tipos de tablas solicitados.
        3. Guarda cada tabla en archivo CSV optimizado (.csv) y opcionalmente Parquet.
        4. Opcionalmente empaqueta en archivo .zip bajo demanda.
        """
        # Normalizar periodos si no se suministran
        if not periods:
            periods = [(RECENT_PERIOD_START, RECENT_PERIOD_END)]
        else:
            # Asegurar formato List[Tuple[int, int]] y ordenar cronológicamente
            periods = sorted([(int(p[0]), int(p[1])) for p in periods], key=lambda x: x[0])

        # Normalizar tipos de tablas a calcular
        tt = table_types or {}
        do_full = tt.get('full', True)
        do_periods = tt.get('periods', True)
        do_matrix = tt.get('performance_matrix', True)
        do_trend = tt.get('trend', True)

        # Normalizar entidades seleccionadas
        if selected_entities is None:
            active_slugs = DEFAULT_SELECTED_ENTITIES
        elif isinstance(selected_entities, list):
            if len(selected_entities) == 0:
                active_slugs = DEFAULT_SELECTED_ENTITIES
            elif 'all' in [str(x).lower() for x in selected_entities]:
                active_slugs = list(ENTITY_SLUG_MAP.keys())
            else:
                active_slugs = [str(x).lower().replace(" ", "_") for x in selected_entities]
        else:
            active_slugs = DEFAULT_SELECTED_ENTITIES

        entities_to_process = [
            e for e in SUPPORTED_ENTITIES
            if e.lower().replace(" ", "_") in active_slugs or ENTITY_SLUG_MAP.get(e.lower().replace(" ", "_")) in [ENTITY_SLUG_MAP.get(s) for s in active_slugs if s in ENTITY_SLUG_MAP]
        ]
        if not entities_to_process:
            entities_to_process = [ENTITY_SLUG_MAP[s] for s in DEFAULT_SELECTED_ENTITIES if s in ENTITY_SLUG_MAP]

        if progress_callback:
            progress_callback(10, 'Iniciando estructuración de carpetas y carga de entidades...')

        out_d = Path(output_dir or (EXPORTS_DIR / package_name))
        csv_dir = out_d / 'csv_reports'
        parquet_dir = out_d / 'parquet_tables'
        csv_dir.mkdir(parents=True, exist_ok=True)
        if export_parquet:
            parquet_dir.mkdir(parents=True, exist_ok=True)

        # Contexto de Agregación de Alto Rendimiento en ClickHouse Pushdown
        corpus_filter = None
        total_works = 0

        if filters_sql:
            # Modo filtros: usa WHERE directo — sin tabla temporal, sin hash set en RAM
            corpus_filter, total_works = self.pushdown_engine.setup_corpus_from_filters(filters_sql, limit=limit)
        elif work_ids is not None and len(work_ids) > 0:
            # Modo IDs: tabla temporal pequeña en memoria
            tmp = self.pushdown_engine.setup_corpus_context(work_ids)
            corpus_filter = f"id IN (SELECT id FROM {tmp})"
            total_works = len(work_ids)
        elif df is not None and len(df) > 0:
            if 'id' in df.columns:
                ids = df['id'].dropna().tolist()
                tmp = self.pushdown_engine.setup_corpus_context(ids)
                corpus_filter = f"id IN (SELECT id FROM {tmp})"
                total_works = len(ids)
            else:
                raise ValueError("El DataFrame de corpus debe contener una columna 'id' con identificadores de OpenAlex.")
        else:
            raise ValueError('Debe suministrarse un DataFrame, una lista de IDs o una cláusula filters_sql para procesar el corpus.')

        if total_works == 0:
            if corpus_filter:
                self.pushdown_engine.release_corpus_context(corpus_filter)
            raise ValueError("No se encontraron artículos para el corpus especificado.")

        logger.info(f'Iniciando procesamiento de {total_works} artículos para paquete {package_name} con {len(entities_to_process)} entidades...')
        logger.info(f"Motor ClickHouse Pushdown activado. Corpus filter: {corpus_filter[:80]}...")

        package_files_to_zip = []
        tables_summary = {}
        consolidated_matrices = {}

        try:
            total_aggs = len(entities_to_process)
            for idx, entity_label in enumerate(entities_to_process, start=1):
                pct = 15 + int((idx / total_aggs) * 65)
                if progress_callback:
                    progress_callback(pct, f'Calculando indicadores: {entity_label} ({idx}/{total_aggs})...')
                
                logger.info(f'Calculando {entity_label} en ClickHouse Pushdown...')
                entity_slug = entity_label.lower().replace(" ", "_")

                df_full = pd.DataFrame()
                period_dfs_dict = {}
                period_row_counts = {}
                df_matrix = None
                df_trend = pd.DataFrame()
                
                # 1. Histórico Completo
                if do_full:
                    if entity_label == 'Corpus':
                        df_full = self.pushdown_engine.aggregate_corpus_baseline(corpus_filter)
                    else:
                        df_full = self.pushdown_engine.aggregate_entity_table(corpus_filter, entity_label, min_docs=1, limit=5000)

                    f_full = csv_dir / f'{entity_label}.csv'
                    df_full.to_csv(f_full, index=False, encoding='utf-8')
                    package_files_to_zip.append(f_full)
                    if export_parquet and len(df_full) > 0:
                        f_full_pq = parquet_dir / f'{entity_slug}_full.parquet'
                        save_parquet_table(df_full, f_full_pq)
                        package_files_to_zip.append(f_full_pq)

                # 2. Periodos Consecutivos
                if do_periods or do_matrix:
                    if entity_label == 'Corpus':
                        period_dfs_dict = self.pushdown_engine.aggregate_corpus_multi_period(corpus_filter, periods)
                    else:
                        period_dfs_dict = self.pushdown_engine.aggregate_entity_multi_period(corpus_filter, entity_label, periods, min_docs=1, limit_per_period=5000)

                    if do_periods:
                        for s_yr, e_yr in periods:
                            p_label = f"{s_yr}-{e_yr}"
                            p_slug = f"{s_yr}_{e_yr}"
                            df_p = period_dfs_dict.get(p_label, pd.DataFrame())
                            
                            f_p = csv_dir / f'{entity_label} {p_label}.csv'
                            df_p.to_csv(f_p, index=False, encoding='utf-8')
                            package_files_to_zip.append(f_p)
                            if export_parquet and len(df_p) > 0:
                                f_p_pq = parquet_dir / f'{entity_slug}_{p_slug}.parquet'
                                save_parquet_table(df_p, f_p_pq)
                                package_files_to_zip.append(f_p_pq)
                                if (s_yr == RECENT_PERIOD_START and e_yr == RECENT_PERIOD_END) or (s_yr, e_yr) == periods[-1]:
                                    f_recent_pq = parquet_dir / f'{entity_slug}_recent.parquet'
                                    save_parquet_table(df_p, f_recent_pq)
                                    package_files_to_zip.append(f_recent_pq)
                            period_row_counts[p_label] = len(df_p)

                        # 2.1 Tabla Consolidada de Periodos Consecutivos (específica para Corpus)
                        if entity_label == 'Corpus' and len(periods) > 1:
                            ptable_rows = []
                            prev_docs = None
                            prev_cites = None
                            prev_fwci = None
                            for s_yr, e_yr in periods:
                                p_label = f"{s_yr}-{e_yr}"
                                p_df = period_dfs_dict.get(p_label)
                                if p_df is not None and not p_df.empty:
                                    row = p_df.iloc[0].to_dict()
                                    c_docs = row.get('Documents', 0)
                                    c_cites = row.get('Times Cited', 0)
                                    c_fwci = row.get('Field-Weighted Citation Impact (FWCI)', 0.0)
                                    doc_g = round(((c_docs - prev_docs) / prev_docs) * 100.0, 2) if prev_docs and prev_docs > 0 else (100.0 if prev_docs is not None and c_docs > 0 else None)
                                    cite_g = round(((c_cites - prev_cites) / prev_cites) * 100.0, 2) if prev_cites and prev_cites > 0 else None
                                    fwci_d = round(c_fwci - prev_fwci, 3) if prev_fwci is not None and c_fwci is not None else None
                                    row['Period'] = p_label
                                    row['Start Year'] = s_yr
                                    row['End Year'] = e_yr
                                    row['Δ% Documents (Interperiod)'] = doc_g
                                    row['Δ% Times Cited (Interperiod)'] = cite_g
                                    row['Δ FWCI (Interperiod)'] = fwci_d
                                    ptable_rows.append(row)
                                    prev_docs = c_docs
                                    prev_cites = c_cites
                                    prev_fwci = c_fwci
                            df_ptable = pd.DataFrame(ptable_rows)
                            if not df_ptable.empty:
                                front_cols = [
                                    'Period', 'Start Year', 'End Year',
                                    'Documents', 'Δ% Documents (Interperiod)',
                                    'Times Cited', 'Δ% Times Cited (Interperiod)',
                                    'Citation Impact', '% Docs Cited',
                                    'Field-Weighted Citation Impact (FWCI)', 'Δ FWCI (Interperiod)'
                                ]
                                all_ordered = [c for c in front_cols if c in df_ptable.columns] + [
                                    c for c in df_ptable.columns if c not in front_cols and c != 'Rank'
                                ]
                                df_ptable = df_ptable[all_ordered]

                            if df_ptable is not None and len(df_ptable) > 0:
                                f_ptable = csv_dir / 'Corpus Periodos Consecutivos.csv'
                                df_ptable.to_csv(f_ptable, index=False, encoding='utf-8')
                                package_files_to_zip.append(f_ptable)
                                if export_parquet:
                                    f_ptable_pq = parquet_dir / 'corpus_consecutive_periods.parquet'
                                    save_parquet_table(df_ptable, f_ptable_pq)
                                    package_files_to_zip.append(f_ptable_pq)

                # 3. Matriz Comparativa de Desempeño
                if do_matrix and (len(periods) >= 1):
                    # Si no se calculó df_full, calcular la base mínima para armar la matriz
                    if df_full.empty:
                        if entity_label == 'Corpus':
                            df_full_for_matrix = self.pushdown_engine.aggregate_corpus_baseline(corpus_filter)
                        else:
                            df_full_for_matrix = self.pushdown_engine.aggregate_entity_table(corpus_filter, entity_label, min_docs=1, limit=5000)
                    else:
                        df_full_for_matrix = df_full

                    matrix_rows = []
                    period_labels = [f"{s}-{e}" for s, e in periods]
                    indexed_periods = {pl: pdf.set_index('Name') for pl, pdf in period_dfs_dict.items() if pdf is not None and not pdf.empty and 'Name' in pdf.columns}
                    for _, f_row in df_full_for_matrix.iterrows():
                        ent_name = f_row.get('Name', '')
                        row_dict = {
                            'Rank': f_row.get('Rank', 0),
                            'Name': ent_name,
                            'Total Documents': f_row.get('Documents', 0),
                            'Total Times Cited': f_row.get('Times Cited', 0),
                            'Total FWCI': f_row.get('Field-Weighted Citation Impact (FWCI)', 0.0),
                        }
                        prev_pl = None
                        for pl in period_labels:
                            p_data = indexed_periods.get(pl)
                            if p_data is not None and ent_name in p_data.index:
                                ent_p = p_data.loc[ent_name]
                                if isinstance(ent_p, pd.DataFrame):
                                    ent_p = ent_p.iloc[0]
                                docs = int(ent_p.get('Documents', 0))
                                cits = int(ent_p.get('Times Cited', 0))
                                impact = float(ent_p.get('Citation Impact', 0.0))
                                fwci = float(ent_p.get('Field-Weighted Citation Impact (FWCI)', 0.0))
                                pct_top10 = float(ent_p.get('% Documents in Top 10%', 0.0))
                                pct_diamond = float(ent_p.get('% Free to Read / Diamond Documents', 0.0))
                                pct_intl = float(ent_p.get('% International Collaborations', 0.0))
                                h_idx = int(ent_p.get('H-Index', 0))
                            else:
                                docs, cits, impact, fwci, pct_top10, pct_diamond, pct_intl, h_idx = 0, 0, 0.0, 0.0, 0.0, 0.0, 0.0, 0
                            row_dict[f'Docs ({pl})'] = docs
                            row_dict[f'Times Cited ({pl})'] = cits
                            row_dict[f'Citation Impact ({pl})'] = impact
                            row_dict[f'FWCI ({pl})'] = fwci
                            row_dict[f'% Top 10% ({pl})'] = pct_top10
                            row_dict[f'% Diamond ({pl})'] = pct_diamond
                            row_dict[f'% International ({pl})'] = pct_intl
                            row_dict[f'H-Index ({pl})'] = h_idx
                            if prev_pl is not None:
                                prev_docs = row_dict.get(f'Docs ({prev_pl})', 0)
                                if prev_docs > 0:
                                    growth_docs = round(((docs - prev_docs) / prev_docs) * 100.0, 2)
                                elif docs > 0:
                                    growth_docs = 100.0
                                else:
                                    growth_docs = 0.0
                                row_dict[f'Δ% Docs ({prev_pl} → {pl})'] = growth_docs
                                prev_fwci = row_dict.get(f'FWCI ({prev_pl})', 0.0)
                                row_dict[f'Δ FWCI ({prev_pl} → {pl})'] = round(fwci - prev_fwci, 3)
                            prev_pl = pl
                        matrix_rows.append(row_dict)
                    df_matrix = pd.DataFrame(matrix_rows)

                    if df_matrix is not None and not df_matrix.empty:
                        f_matrix = csv_dir / f'{entity_label} Performance Matrix.csv'
                        df_matrix.to_csv(f_matrix, index=False, encoding='utf-8')
                        package_files_to_zip.append(f_matrix)
                        consolidated_matrices[entity_label] = df_matrix
                        if export_parquet and len(df_matrix) > 0:
                            f_matrix_pq = parquet_dir / f'{entity_slug}_performance_matrix.parquet'
                            save_parquet_table(df_matrix, f_matrix_pq)
                            package_files_to_zip.append(f_matrix_pq)

                # 4. Tendencia Anual (Trend)
                if do_trend:
                    if entity_label == 'Corpus':
                        df_trend = self.pushdown_engine.aggregate_corpus_trend(corpus_filter)
                    else:
                        df_trend = self.pushdown_engine.aggregate_entity_trend(corpus_filter, entity_label)

                    f_trend = csv_dir / f'{entity_label} Trend.csv'
                    df_trend.to_csv(f_trend, index=False, encoding='utf-8')
                    package_files_to_zip.append(f_trend)
                    if export_parquet and len(df_trend) > 0:
                        f_trend_pq = parquet_dir / f'{entity_slug}_trend.parquet'
                        save_parquet_table(df_trend, f_trend_pq)
                        package_files_to_zip.append(f_trend_pq)

                tables_summary[entity_label] = {
                    'full_rows': len(df_full) if not df_full.empty else 0,
                    'periods': period_row_counts,
                    'matrix_rows': len(df_matrix) if df_matrix is not None else 0,
                    'trend_rows': len(df_trend) if not df_trend.empty else 0
                }

            # 5. Generar Matriz de Desempeño Longitudinal Consolidada (CSV unificado con columna 'Entity')
            if do_matrix and consolidated_matrices:
                try:
                    consolidated_dfs = []
                    for ent_name, m_df in consolidated_matrices.items():
                        if m_df is not None and not m_df.empty:
                            c_df = m_df.copy()
                            c_df.insert(0, 'Entity', ent_name)
                            consolidated_dfs.append(c_df)
                    if consolidated_dfs:
                        master_df = pd.concat(consolidated_dfs, ignore_index=True)
                        master_csv = csv_dir / 'Matriz_Desempeño_Longitudinal_Consolidada.csv'
                        master_df.to_csv(master_csv, index=False, encoding='utf-8')
                        package_files_to_zip.append(master_csv)
                        logger.info(f"Matriz consolidada generada: {master_csv} ({len(master_df)} filas)")
                except Exception as e:
                    logger.warning(f"No se pudo generar Matriz_Desempeño_Longitudinal_Consolidada.csv: {e}")

        finally:
            if corpus_filter:
                self.pushdown_engine.release_corpus_context(corpus_filter)

        # 4. Exportar el archivo CSV consolidado de registros del corpus (solo si se pide explícitamente)
        works_csv_path = None
        if (export_works_csv or export_json) and df is not None:
            if progress_callback:
                progress_callback(85, 'Exportando archivo CSV consolidado de obras del corpus...')
            works_csv_path = out_d / f'{package_name}_openalex_works.csv'
            logger.info(f'Exportando archivo CSV completo del corpus a: {works_csv_path}')
            try:
                df.to_csv(works_csv_path, index=False, encoding='utf-8')
                package_files_to_zip.append(works_csv_path)
            except Exception as e:
                logger.warning(f"Error exportando obras a CSV: {e}")

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

        total_csv_files = len([f for f in package_files_to_zip if str(f).endswith('.csv')])
        total_excel_files = len([f for f in package_files_to_zip if str(f).endswith('.xlsx')])
        return {
            'package_name': package_name,
            'total_works': total_works,
            'periods': [f"{s}-{e}" for s, e in periods],
            'selected_entities': [e.lower().replace(" ", "_") for e in entities_to_process],
            'table_types': {'full': do_full, 'periods': do_periods, 'performance_matrix': do_matrix, 'trend': do_trend},
            'has_performance_matrix': do_matrix,
            'total_csv_files': total_csv_files,
            'total_excel_files': total_excel_files or total_csv_files,
            'json_file_path': None,
            'zip_path': str(zip_path) if zip_path else None,
            'csv_directory': str(csv_dir),
            'excel_directory': str(csv_dir),
            'tables_summary': tables_summary
        }
