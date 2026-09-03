"""
api/routers/corpus_manager.py - Enrutador para guardar, listar, cargar y eliminar corpus de usuario
"""
import uuid
import logging
from typing import Optional, Dict, Any, List
from starlette.requests import Request
from starlette.responses import JSONResponse

from api.db_users import (
    save_user_corpus,
    list_user_corpuses,
    get_user_corpus,
    delete_user_corpus,
    is_user_authorized,
    is_user_admin
)

logger = logging.getLogger('corpus_manager')


def _get_request_user(request: Request, fallback_orcid: Optional[str] = None) -> Optional[dict]:
    """Extrae el ORCID autenticado desde cabeceras, parámetros o fallback."""
    user_orcid = (
        request.headers.get("X-User-ORCID") or
        request.headers.get("x-user-orcid") or
        request.query_params.get("user_orcid") or
        request.query_params.get("orcid") or
        fallback_orcid
    )
    if not user_orcid:
        return None
    user_orcid = user_orcid.strip()
    if not is_user_authorized(user_orcid):
        return None
    return {
        "orcid": user_orcid,
        "is_admin": is_user_admin(user_orcid)
    }


async def list_saved_corpuses_endpoint(request: Request):
    """Lista todos los corpus guardados por el usuario autenticado."""
    user = _get_request_user(request)
    if not user:
        return JSONResponse({"error": "No autorizado. Inicia sesión con ORCID."}, status_code=401)

    try:
        corpuses = list_user_corpuses(user["orcid"], is_admin=user["is_admin"])
        return JSONResponse({"corpuses": corpuses, "total": len(corpuses)})
    except Exception as e:
        logger.error(f"Error listando corpus guardados: {e}")
        return JSONResponse({"error": f"Error interno: {str(e)}"}, status_code=500)


async def save_corpus_endpoint(request: Request):
    """Guarda un nuevo corpus o actualiza uno existente para el usuario autenticado."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    fallback_orcid = body.get("user_orcid") or body.get("owner_orcid")
    user = _get_request_user(request, fallback_orcid=fallback_orcid)
    if not user:
        return JSONResponse({"error": "No autorizado. Inicia sesión con ORCID."}, status_code=401)

    corpus_name = (body.get("corpus_name") or "").strip()
    if not corpus_name:
        return JSONResponse({"error": "El nombre del corpus es obligatorio."}, status_code=400)

    corpus_id = (body.get("corpus_id") or str(uuid.uuid4())).strip()
    owner_name = (body.get("owner_name") or user["orcid"]).strip()
    description = (body.get("description") or "").strip()
    source_mode = (body.get("source_mode") or "filters").strip()
    filters = body.get("filters") or {}
    ids_list = body.get("ids_list") or []
    total_works_estimated = int(body.get("total_works_estimated") or 0)
    is_favorite = 1 if body.get("is_favorite") else 0
    parent_corpus_id = body.get("parent_corpus_id")
    lineage_type = (body.get("lineage_type") or "standalone").strip()

    try:
        saved = save_user_corpus(
            corpus_id=corpus_id,
            owner_orcid=user["orcid"],
            owner_name=owner_name,
            corpus_name=corpus_name,
            description=description,
            source_mode=source_mode,
            filters=filters,
            ids_list=ids_list,
            total_works_estimated=total_works_estimated,
            is_favorite=is_favorite,
            parent_corpus_id=parent_corpus_id,
            lineage_type=lineage_type
        )
        return JSONResponse({"success": True, "corpus": saved})
    except Exception as e:
        logger.error(f"Error guardando corpus: {e}")
        return JSONResponse({"error": f"Error guardando corpus: {str(e)}"}, status_code=500)


async def get_saved_corpus_endpoint(request: Request):
    """Obtiene los detalles y filtros de un corpus guardado específico."""
    user = _get_request_user(request)
    if not user:
        return JSONResponse({"error": "No autorizado. Inicia sesión con ORCID."}, status_code=401)

    corpus_id = request.path_params.get("corpus_id")
    if not corpus_id:
        return JSONResponse({"error": "corpus_id no proporcionado."}, status_code=400)

    try:
        corpus = get_user_corpus(corpus_id, user["orcid"], is_admin=user["is_admin"])
        if not corpus:
            return JSONResponse({"error": "Corpus no encontrado o no autorizado."}, status_code=404)
        return JSONResponse({"corpus": corpus})
    except Exception as e:
        logger.error(f"Error obteniendo corpus: {e}")
        return JSONResponse({"error": f"Error interno: {str(e)}"}, status_code=500)


async def delete_saved_corpus_endpoint(request: Request):
    """Elimina un corpus guardado."""
    user = _get_request_user(request)
    if not user:
        return JSONResponse({"error": "No autorizado. Inicia sesión con ORCID."}, status_code=401)

    corpus_id = request.path_params.get("corpus_id")
    if not corpus_id:
        return JSONResponse({"error": "corpus_id no proporcionado."}, status_code=400)

    try:
        deleted = delete_user_corpus(corpus_id, user["orcid"], is_admin=user["is_admin"])
        if not deleted:
            return JSONResponse({"error": "Corpus no encontrado o no autorizado para eliminación."}, status_code=404)
        return JSONResponse({"success": True, "message": "Corpus eliminado exitosamente."})
    except Exception as e:
        logger.error(f"Error eliminando corpus: {e}")
        return JSONResponse({"error": f"Error interno: {str(e)}"}, status_code=500)
