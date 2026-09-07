"""
TlachIA Metrics - openalex_indicators_engine
exporters/zip_packager.py
Empaquetador unificado: organiza y comprime todos los reportes Excel,
matrices de desempeño longitudinal, tablas Parquet y metadatos en un .zip estructurado.
"""
import os
import re
import zipfile
from pathlib import Path
from typing import List, Union

README_CONTENT = """================================================================================
TlachIA Metrics - Paquete de Indicadores Cienciométricos y Matrices Longitudinales
================================================================================

Este archivo comprimido (.zip) contiene los cálculos cienciométricos completos
generados a partir del corpus analizado, estructurados en las siguientes carpetas:

01_Matrices_Desempeño_Longitudinal/
  - Matrices comparativas de desempeño con tasas de cambio interperiódicas
    (Delta % Documentos, Delta FWCI, Citas por Documento, etc.).
  - Libros Excel individuales por entidad (* Performance Matrix.xlsx) y el
    libro consolidado multihistorial:
    "Matriz_Desempeño_Longitudinal_Consolidada.xlsx" con pestañas por cada entidad.

02_Periodos_Consecutivos/
  - Reportes de indicadores desagregados para cada una de las ventanas temporales
    consecutivas configuradas (ej. 2011-2015, 2016-2020, 2021-2025).

03_Historico_Completo/
  - Indicadores calculados sobre la totalidad del periodo histórico del corpus
    para cada entidad analítica (Instituciones, Autores, Fuentes, Países, etc.).

04_Tendencias_Anuales/
  - Series temporales año con año con la evolución cronológica de la producción,
    citas, FWCI y patrones de colaboración.

05_Tablas_Parquet_y_Datos/
  - Formatos columnares Apache Parquet (.parquet) de alto rendimiento para
    analítica masiva en Python (pandas, polars), R o DuckDB.
  - Archivo JSON consolidado con los registros normalizados de OpenAlex.

manifest.json:
  - Manifiesto técnico en formato JSON con la estrategia de búsqueda,
    filtros aplicados, ventanas temporales, métricas calculadas y metadatos.

Plataforma TlachIA Metrics - Inteligencia Cienciométrica
================================================================================
"""

def classify_archive_path(filename: str) -> str:
    """
    Determina la ruta de destino dentro del archivo .ZIP para mantener una
    estructura limpia y organizada por categorías cienciométricas.
    """
    fn = filename
    # 1. Metadatos en la raíz
    if fn == 'manifest.json' or fn.startswith('LEEME') or fn.startswith('README'):
        return fn

    # 2. Archivos Parquet y JSON de datos
    if fn.endswith('.parquet') or fn.endswith('_openalex_works.json'):
        return f"05_Tablas_Parquet_y_Datos/{fn}"

    # 3. Reportes en Excel (.xlsx)
    if fn.endswith('.xlsx'):
        if 'Performance Matrix' in fn or 'Matriz_Desempeño' in fn or 'Matriz_Desempeno' in fn:
            return f"01_Matrices_Desempeño_Longitudinal/{fn}"
        elif 'Trend' in fn:
            return f"04_Tendencias_Anuales/{fn}"
        elif re.search(r'\b\d{4}[-_]\d{4}\b', fn):
            return f"02_Periodos_Consecutivos/{fn}"
        else:
            return f"03_Historico_Completo/{fn}"

    return fn


def create_unified_indicators_zip(excel_files: List[Union[str, Path]], output_zip_path: Union[str, Path]) -> Path:
    """
    Empaqueta la lista de archivos (Excel, Parquets, JSON, manifest) en un único
    archivo .zip estructurado por carpetas temáticas.
    """
    out_p = Path(output_zip_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    seen_arcnames = set()

    with zipfile.ZipFile(out_p, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        # Agregar archivo de documentación explicativo en la raíz del ZIP
        z.writestr("LEEME_ESTRUCTURA.txt", README_CONTENT)
        seen_arcnames.add("LEEME_ESTRUCTURA.txt")

        for f in excel_files:
            fp = Path(f)
            if not fp.exists() or not fp.is_file():
                continue

            arcname = classify_archive_path(fp.name)
            if arcname in seen_arcnames:
                continue

            seen_arcnames.add(arcname)
            z.write(fp, arcname=arcname)

    return out_p
