"""
TlachIA Metrics - openalex_indicators_engine
exporters/zip_packager.py
Empaquetador unificado: comprime todos los archivos Excel generados en un solo .zip.
"""
import os
import zipfile
from pathlib import Path
from typing import List, Union

def create_unified_indicators_zip(excel_files: List[Union[str, Path]], output_zip_path: Union[str, Path]) -> Path:
    """
    Empaqueta la lista completa de archivos Excel en un único archivo comprimido .zip.
    """
    out_p = Path(output_zip_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(out_p, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for f in excel_files:
            fp = Path(f)
            if fp.exists():
                z.write(fp, arcname=fp.name)

    return out_p
