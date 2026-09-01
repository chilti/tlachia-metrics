"""
TlachIA Metrics - API Backend (FastAPI)
api/main.py
Servicios REST para construcción de corpus, cómputo de indicadores y descarga del paquete .zip.
"""
import os
import sys
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Incluir ruta del engine
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from openalex_indicators_engine import TlachIAMetricsEngine
from openalex_indicators_engine.core.config import EXPORTS_DIR

app = FastAPI(
    title='TlachIA Metrics API',
    description='Plataforma Analítica y Motor de Cálculo de Indicadores Cienciométricos OpenAlex',
    version='1.0.0'
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

engine = TlachIAMetricsEngine()

class QueryCorpusRequest(BaseModel):
    package_name: str = 'TlachIA_Report'
    topic_id: Optional[str] = None
    source_id: Optional[str] = None
    institution_id: Optional[str] = None
    dois: Optional[List[str]] = None
    openalex_ids: Optional[List[str]] = None

@app.get('/api/health')
def health_check():
    return {'status': 'healthy', 'service': 'TlachIA Metrics API', 'version': '1.0.0'}

@app.post('/api/corpus/compute-query')
def compute_indicators_from_query(req: QueryCorpusRequest):
    df = None
    if req.topic_id:
        df = engine.corpus_builder.from_topic_id(req.topic_id)
    elif req.source_id:
        df = engine.corpus_builder.from_source_id(req.source_id)
    elif req.institution_id:
        df = engine.corpus_builder.from_institution_id(req.institution_id)
    elif req.dois:
        df = engine.corpus_builder.from_dois(req.dois)
    elif req.openalex_ids:
        df = engine.corpus_builder.from_openalex_ids(req.openalex_ids)
    else:
        raise HTTPException(status_code=400, detail='Debe especificar al menos un criterio de búsqueda.')

    if df is None or len(df) == 0:
        raise HTTPException(status_code=404, detail='No se encontraron artículos para el criterio especificado.')

    result = engine.process_and_export_package(df, package_name=req.package_name)
    return result

@app.post('/api/corpus/upload-file')
async def upload_corpus_and_compute(file: UploadFile = File(...), package_name: str = 'Uploaded_Corpus_Metrics'):
    temp_dir = Path('/mnt/expansion/desplegados/TlachIA-Metrics/data/temp_uploads')
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / file.filename

    with open(temp_path, 'wb') as f:
        content = await file.read()
        f.write(content)

    try:
        df = engine.load_corpus(temp_path)
        if df is None or len(df) == 0:
            raise HTTPException(status_code=400, detail='El archivo no contiene artículos válidos.')

        result = engine.process_and_export_package(df, package_name=package_name)
        return result
    finally:
        if temp_path.exists():
            temp_path.unlink()

@app.get('/api/indicators/download/{package_name}')
def download_indicators_zip(package_name: str):
    zip_path = EXPORTS_DIR / package_name / f'{package_name}.zip'
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail='Paquete de indicadores no encontrado.')
    return FileResponse(zip_path, filename=f'{package_name}.zip', media_type='application/zip')
