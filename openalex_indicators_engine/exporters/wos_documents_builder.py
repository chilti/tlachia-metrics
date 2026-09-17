"""
TlachIA Metrics - openalex_indicators_engine
exporters/wos_documents_builder.py

Formateador y constructor de tablas de documentos estilo Web of Science / InCites,
integrando indicadores cienciométricos oficiales de OpenAlex y TlachIA-Metrics:
FWCI, Percentil, Top 10%, Top 1%, Tipo de Colaboración, 6 Vías de Acceso Abierto,
ODS (SDGs) y estimación de costos APC.
"""

import re
import ast
import json
import logging
from typing import Any, List, Optional, Union
import numpy as np
import pandas as pd

logger = logging.getLogger("tlachia_wos_documents_builder")

# Mapeo de Vías de Acceso Abierto a etiquetas legibles en español
OA_STATUS_MAP = {
    'diamond': 'Diamante (Sin APC)',
    'gold': 'Dorada (Con APC)',
    'hybrid': 'Híbrida (Con APC)',
    'bronze': 'Bronce (Lectura Libre)',
    'green': 'Verde (Autoarchivo / Repositorio)',
    'closed': 'Cerrada (Bajo Suscripción)'
}

# Mapeo de Document Types comunes de OpenAlex a formato amigable
DOC_TYPE_MAP = {
    'article': 'Article',
    'review': 'Review',
    'book-chapter': 'Book Chapter',
    'letter': 'Letter',
    'editorial': 'Editorial',
    'erratum': 'Correction',
    'preprint': 'Preprint',
    'book': 'Book',
    'dissertation': 'Dissertation',
    'dataset': 'Dataset'
}


def _clean_list_to_string(val: Any, sep: str = "; ") -> str:
    """Convierte listas nativas, arrays numpy, listas serializadas en JSON o strings ast en una cadena separada por delimitador."""
    if val is None:
        return ""
    if isinstance(val, (list, tuple, np.ndarray)):
        items = [str(x).strip() for x in val if x is not None and str(x).strip()]
        return sep.join(items)
    try:
        if pd.isna(val):
            return ""
    except Exception:
        pass
    
    val_str = str(val).strip()
    if not val_str or val_str in ('[]', '{}', 'None', 'nan'):
        return ""
    
    # Intentar parsear si viene como string de lista python "['A', 'B']" o JSON '["A", "B"]'
    if (val_str.startswith('[') and val_str.endswith(']')):
        try:
            parsed = json.loads(val_str)
            if isinstance(parsed, list):
                return sep.join([str(x).strip() for x in parsed if x and str(x).strip()])
        except Exception:
            try:
                parsed = ast.literal_eval(val_str)
                if isinstance(parsed, list):
                    return sep.join([str(x).strip() for x in parsed if x and str(x).strip()])
            except Exception:
                pass

    return val_str


def _determine_collaboration_type(row: pd.Series) -> str:
    """
    Determina la tipología de colaboración canónica (4 niveles estilo InCites / Leiden):
    1. Internacional: Coautores en > 1 país
    2. Nacional: Coautores en > 1 institución dentro del mismo país
    3. Institucional: Múltiples coautores dentro de una sola institución
    4. Autor Único: 1 solo autor
    """
    # 1. Verificar número de países
    countries_count = row.get('countries_distinct_count')
    try:
        if pd.notna(countries_count) and int(countries_count) > 1:
            return 'Internacional'
    except Exception:
        pass

    # Inspeccionar lista de países
    countries_raw = row.get('all_country_codes') or row.get('country_codes') or []
    if isinstance(countries_raw, (list, tuple, np.ndarray, str)):
        c_str = _clean_list_to_string(countries_raw, sep=",")
        if c_str:
            c_set = {c.strip().upper() for c in c_str.split(',') if c.strip()}
            if len(c_set) > 1:
                return 'Internacional'

    # 2. Verificar número de instituciones
    inst_count = row.get('institutions_distinct_count')
    try:
        if pd.notna(inst_count) and int(inst_count) > 1:
            return 'Nacional'
    except Exception:
        pass

    insts_raw = row.get('institution_names') or row.get('institutions') or []
    if isinstance(insts_raw, (list, tuple, np.ndarray, str)):
        i_str = _clean_list_to_string(insts_raw, sep=";")
        if i_str:
            i_set = {i.strip().lower() for i in i_str.split(';') if i.strip()}
            if len(i_set) > 1:
                return 'Nacional'

    # 3. Verificar número de autores
    authors_raw = row.get('author_names') or row.get('authors') or []
    a_str = _clean_list_to_string(authors_raw, sep=";")
    if a_str:
        a_list = [a.strip() for a in a_str.split(';') if a.strip()]
        if len(a_list) > 1:
            return 'Institucional'
        elif len(a_list) == 1:
            return 'Autor Único'

    return 'Nacional' if pd.notna(countries_count) and int(countries_count) == 1 else 'Institucional'


def _format_pages(first_page: Any, last_page: Any) -> str:
    """Formatea el rango de páginas (ej. '120-135' o 'e1024')."""
    fp = str(first_page).strip() if pd.notna(first_page) else ""
    lp = str(last_page).strip() if pd.notna(last_page) else ""
    if fp and lp and fp != lp:
        return f"{fp}-{lp}"
    return fp or lp


def _format_boolean_flag(val: Any) -> str:
    """Convierte valores booleanos o numéricos a 'Sí' / 'No'."""
    if val is None or pd.isna(val):
        return 'No'
    if isinstance(val, bool):
        return 'Sí' if val else 'No'
    val_str = str(val).strip().lower()
    return 'Sí' if val_str in ('true', '1', 'yes', 'si', 'sí', 't') else 'No'


def build_wos_incites_documents_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Toma un DataFrame crudo de obras de OpenAlex / TlachIA-Metrics y lo transforma
    en una tabla normalizada, ordenada y tipada idéntica a los reportes de
    Web of Science / InCites Documents, con indicadores cienciométricos enriquecidos.
    """
    if df is None or len(df) == 0:
        return pd.DataFrame()

    out = pd.DataFrame()

    # 1. Identificadores Principales
    # Accession Number (OpenAlex ID limpio W...)
    if 'id' in df.columns:
        out['OpenAlex ID'] = df['id'].apply(lambda x: str(x).replace('https://openalex.org/', '').strip() if pd.notna(x) else '')
    else:
        out['OpenAlex ID'] = ''

    # DOI
    if 'doi' in df.columns:
        out['DOI'] = df['doi'].apply(lambda x: str(x).replace('https://doi.org/', '').strip() if pd.notna(x) else '')
    else:
        out['DOI'] = ''

    # PubMed ID
    if 'pmid' in df.columns:
        out['PubMed ID'] = df['pmid'].apply(lambda x: str(x).replace('https://pubmed.ncbi.nlm.nih.gov/', '').replace('PMID:', '').strip() if pd.notna(x) else '')
    elif 'pubmed_id' in df.columns:
        out['PubMed ID'] = df['pubmed_id'].apply(lambda x: str(x).replace('PMID:', '').strip() if pd.notna(x) else '')
    else:
        out['PubMed ID'] = ''

    # 2. Metadatos Bibliográficos Básicos
    out['Título del Artículo'] = df.get('title', '').apply(lambda x: str(x).strip() if pd.notna(x) else '')
    
    # Autores limpios separados por punto y coma (;)
    authors_col = 'author_names' if 'author_names' in df.columns else ('authors' if 'authors' in df.columns else None)
    if authors_col:
        out['Autores'] = df[authors_col].apply(_clean_list_to_string)
    else:
        out['Autores'] = ''

    # Fuente / Revista
    source_col = 'source_name' if 'source_name' in df.columns else ('source' if 'source' in df.columns else 'journal')
    out['Revista / Fuente'] = df.get(source_col, '').apply(lambda x: str(x).strip() if pd.notna(x) else '')
    out['ISSN / Fuente ID'] = df.get('source_id', '').apply(lambda x: str(x).replace('https://openalex.org/', '').strip() if pd.notna(x) else '')

    # 3. Taxonomía Temática OpenAlex (4 niveles)
    out['Dominio Temático'] = df.get('domain_name', df.get('domain', '')).apply(lambda x: str(x).strip() if pd.notna(x) else '')
    out['Campo'] = df.get('field_name', df.get('field', '')).apply(lambda x: str(x).strip() if pd.notna(x) else '')
    out['Subcampo (Área de Investigación)'] = df.get('subfield_name', df.get('subfield', '')).apply(lambda x: str(x).strip() if pd.notna(x) else '')
    out['Tópico Principal'] = df.get('topic', df.get('topic_name', '')).apply(lambda x: str(x).strip() if pd.notna(x) else '')

    # 4. Datos de Edición y Fascículo
    out['Tipo de Documento'] = df.get('type', 'article').apply(lambda x: DOC_TYPE_MAP.get(str(x).strip().lower(), str(x).title()) if pd.notna(x) else 'Article')
    out['Volumen'] = df.get('volume', '').apply(lambda x: str(x).strip() if pd.notna(x) and str(x) != 'nan' else '')
    out['Número / Fascículo'] = df.get('issue', '').apply(lambda x: str(x).strip() if pd.notna(x) and str(x) != 'nan' else '')
    
    # Rango de páginas
    out['Páginas'] = [_format_pages(fp, lp) for fp, lp in zip(df.get('first_page', [None]*len(df)), df.get('last_page', [None]*len(df)))]

    # Fechas
    out['Fecha de Publicación'] = df.get('publication_date', '').apply(lambda x: str(x).strip() if pd.notna(x) and str(x) != 'nan' else '')
    out['Año'] = df.get('publication_year', '').apply(lambda x: int(x) if pd.notna(x) and str(x).isdigit() else '')

    # 5. Indicadores de Citas e Impacto Normalizado
    cits_col = 'cited_by_count' if 'cited_by_count' in df.columns else 'citations'
    out['Citas Totales (OpenAlex)'] = df.get(cits_col, 0).apply(lambda x: int(x) if pd.notna(x) and str(x).replace('.0', '').isdigit() else 0)
    
    # FWCI (Field-Weighted Citation Impact) con 3 decimales
    out['FWCI'] = df.get('fwci', 0.0).apply(lambda x: round(float(x), 3) if pd.notna(x) and str(x) != '' else 0.0)

    # Percentil cienciométrico (0.0 - 100.0%)
    def _parse_percentile(p):
        if p is None or pd.isna(p) or p == '':
            return 0.0
        try:
            val = float(p)
            if val <= 1.0 and val > 0:
                val = val * 100.0
            return round(val, 2)
        except Exception:
            return 0.0

    out['Percentil en su Área'] = df.get('percentile', 0.0).apply(_parse_percentile)

    # 6. Indicadores de Excelencia Cienciométrica: Top 10% y Top 1%
    out['Top 10% Más Citado'] = df.get('is_top_10', False).apply(_format_boolean_flag)
    
    # Calcular Top 1% si no está en la base (por percentil >= 99 o flag is_top_1)
    def _is_top_1(row):
        if 'is_top_1' in row and pd.notna(row['is_top_1']):
            return _format_boolean_flag(row['is_top_1'])
        p = row.get('percentile')
        if pd.notna(p):
            try:
                val = float(p)
                if (val >= 99.0) or (val <= 1.0 and val >= 0.99):
                    return 'Sí'
            except Exception:
                pass
        return 'No'

    out['Top 1% Más Citado'] = df.apply(_is_top_1, axis=1)

    # 7. Redes y Tipología de Colaboración
    out['Tipo de Colaboración'] = df.apply(_determine_collaboration_type, axis=1)
    out['Países Colaboradores'] = df.get('all_country_codes', df.get('country_codes', '')).apply(lambda x: _clean_list_to_string(x, sep=", "))

    # 8. Acceso Abierto y Vías Diamante / APC
    out['Vía de Acceso Abierto'] = df.get('oa_status', 'closed').apply(lambda x: OA_STATUS_MAP.get(str(x).strip().lower(), str(x).title()) if pd.notna(x) else 'Cerrada')
    out['Es Acceso Abierto'] = df.get('is_oa', False).apply(_format_boolean_flag)

    # 9. ODS / SDGs de la Agenda 2030
    def _format_sdgs(val):
        if val is None:
            return ""
        if isinstance(val, (list, tuple, np.ndarray)):
            items = []
            for item in val:
                if isinstance(item, dict):
                    name = item.get('display_name') or item.get('id', '').split('/')[-1]
                    items.append(f"ODS {name}")
                elif item is not None and str(item).strip():
                    clean_item = str(item).replace('https://metadata.un.org/sdg/', 'ODS ').strip(" '\"[]")
                    if not clean_item.startswith('ODS '):
                        clean_item = f"ODS {clean_item}"
                    items.append(clean_item)
            return "; ".join(items)

        try:
            if pd.isna(val):
                return ""
        except Exception:
            pass

        items_raw = val
        if isinstance(val, str) and (val.startswith('[') and val.endswith(']')):
            try:
                items_raw = json.loads(val)
            except Exception:
                try:
                    items_raw = ast.literal_eval(val)
                except Exception:
                    items_raw = [val]

        if isinstance(items_raw, (list, tuple, np.ndarray)):
            items = []
            for item in items_raw:
                if isinstance(item, dict):
                    name = item.get('display_name') or item.get('id', '').split('/')[-1]
                    items.append(f"ODS {name}")
                elif str(item).strip():
                    clean_item = str(item).replace('https://metadata.un.org/sdg/', 'ODS ').strip(" '\"[]")
                    if not clean_item.startswith('ODS '):
                        clean_item = f"ODS {clean_item}"
                    items.append(clean_item)
            return "; ".join(items)

        val_str = str(val).strip()
        if not val_str or val_str in ('[]', '{}', 'None', 'nan'):
            return ""
        return val_str.replace('https://metadata.un.org/sdg/', 'ODS ')

    out['ODS / Agenda 2030 (SDGs)'] = df.get('sdgs', df.get('sdg_ids', '')).apply(_format_sdgs)

    # 10. Costos APC Estimados en USD
    def _format_usd(val):
        if val is None or pd.isna(val) or str(val) in ('', 'nan', 'None'):
            return 0
        try:
            return round(float(val), 2)
        except Exception:
            return 0

    out['Costo APC Estimado (USD)'] = df.get('apc_paid_usd', 0).apply(_format_usd)
    out['Precio de Lista APC (USD)'] = df.get('apc_list_usd', 0).apply(_format_usd)

    return out


# Alias canónico
build_enriched_documents_df = build_wos_incites_documents_df

