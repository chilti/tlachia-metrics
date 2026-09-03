"""
api/db_users.py - Persistencia SQLite y Control de Acceso ORCID para TlachIA Metrics
"""
import os
import sqlite3
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

ROOT_DIR = Path(__file__).resolve().parent.parent
DB_DIR = ROOT_DIR / "data"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "users.db"


def _clean_set_from_env(env_var_names: list) -> set:
    """Extrae y normaliza un conjunto de identificadores ORCID desde variables de entorno."""
    for name in env_var_names:
        raw_val = os.getenv(name)
        if raw_val:
            clean_str = raw_val.replace('"', '').replace("'", "").strip()
            if clean_str:
                return {item.strip() for item in clean_str.split(",") if item.strip()}
    return set()


def get_admin_orcids() -> set:
    """Obtiene el conjunto de ORCID de administradores configurados."""
    return _clean_set_from_env(["admins", "ADMINS", "ADMIN_ORCIDS"])


def get_valid_user_orcids() -> set:
    """Obtiene el conjunto de ORCID autorizados en la lista blanca (valid_users)."""
    valid_set = _clean_set_from_env(["valid_users", "VALID_USERS", "VALID_ORCIDS"])
    # Los administradores siempre son considerados usuarios válidos
    return valid_set.union(get_admin_orcids())


def is_user_authorized(orcid: str) -> bool:
    """Valida si el ORCID está permitido para ingresar a la plataforma."""
    if not orcid:
        return False
    return orcid.strip() in get_valid_user_orcids()


def is_user_admin(orcid: str) -> bool:
    """Valida si el ORCID tiene privilegios de administrador."""
    if not orcid:
        return False
    return orcid.strip() in get_admin_orcids()


def init_users_db():
    """Inicializa las tablas de usuarios y de paquetes asignados por usuario."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # Tabla de investigadores registrados
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS registered_users (
        orcid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        institution TEXT,
        country TEXT,
        role TEXT DEFAULT 'user',
        first_login DATETIME,
        last_login DATETIME,
        login_count INTEGER DEFAULT 1,
        raw_metadata TEXT
    )
    """)

    # Tabla de paquetes asociados a cada usuario
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_packages (
        package_name TEXT PRIMARY KEY,
        owner_orcid TEXT NOT NULL,
        owner_name TEXT,
        created_at DATETIME,
        total_works INTEGER,
        zip_size_bytes INTEGER,
        source_mode TEXT DEFAULT 'filters'
    )
    """)
    conn.commit()
    conn.close()


def upsert_user(orcid: str, name: str, institution: str = "", country: str = "", role: str = "user", raw_metadata: str = "") -> dict:
    """Inserta o actualiza el registro de un investigador al iniciar sesión."""
    init_users_db()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("SELECT * FROM registered_users WHERE orcid = ?", (orcid,))
    existing = cursor.fetchone()

    admin_set = get_admin_orcids()
    final_role = "admin" if orcid in admin_set else role

    if existing:
        new_count = existing["login_count"] + 1
        final_inst = institution or existing["institution"] or ""
        final_country = country or existing["country"] or ""
        final_name = name or existing["name"] or ""

        cursor.execute("""
            UPDATE registered_users
            SET name = ?, institution = ?, country = ?, role = ?, last_login = ?, login_count = ?
            WHERE orcid = ?
        """, (final_name, final_inst, final_country, final_role, now_iso, new_count, orcid))
        conn.commit()
        user_record = {
            "orcid": orcid,
            "name": final_name,
            "institution": final_inst,
            "country": final_country,
            "role": final_role,
            "first_login": existing["first_login"],
            "last_login": now_iso,
            "login_count": new_count,
            "is_admin": (final_role == "admin")
        }
    else:
        cursor.execute("""
            INSERT INTO registered_users (orcid, name, institution, country, role, first_login, last_login, login_count, raw_metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        """, (orcid, name, institution, country, final_role, now_iso, now_iso, raw_metadata))
        conn.commit()
        user_record = {
            "orcid": orcid,
            "name": name,
            "institution": institution,
            "country": country,
            "role": final_role,
            "first_login": now_iso,
            "last_login": now_iso,
            "login_count": 1,
            "is_admin": (final_role == "admin")
        }

    conn.close()
    return user_record


def get_all_users() -> list:
    """Obtiene el listado completo de usuarios registrados ordenados por último acceso."""
    init_users_db()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    admin_set = get_admin_orcids()

    cursor.execute("SELECT * FROM registered_users ORDER BY last_login DESC")
    rows = cursor.fetchall()
    users = []
    for r in rows:
        orcid_val = r["orcid"]
        is_adm = (orcid_val in admin_set) or (r["role"] == "admin")
        users.append({
            "orcid": orcid_val,
            "name": r["name"],
            "institution": r["institution"] or "No especificada",
            "country": r["country"] or "No especificado",
            "role": "admin" if is_adm else "user",
            "is_admin": is_adm,
            "first_login": r["first_login"],
            "last_login": r["last_login"],
            "login_count": r["login_count"]
        })
    conn.close()
    return users


def register_user_package(package_name: str, owner_orcid: str, owner_name: str = "", total_works: int = 0, zip_size_bytes: int = 0, source_mode: str = "filters"):
    """Registra la pertenencia de un paquete de indicadores a un usuario específico."""
    init_users_db()
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        INSERT OR REPLACE INTO user_packages (package_name, owner_orcid, owner_name, created_at, total_works, zip_size_bytes, source_mode)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (package_name, owner_orcid, owner_name, now_iso, total_works, zip_size_bytes, source_mode))
    conn.commit()
    conn.close()


def get_package_owner_info(package_name: str) -> dict:
    """Retorna el ORCID y nombre del propietario de un paquete."""
    init_users_db()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT owner_orcid, owner_name FROM user_packages WHERE package_name = ?", (package_name,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return {"owner_orcid": row["owner_orcid"], "owner_name": row["owner_name"]}
    return {"owner_orcid": "", "owner_name": ""}


def delete_user_package_record(package_name: str):
    """Elimina el registro de pertenencia de un paquete."""
    init_users_db()
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    cursor.execute("DELETE FROM user_packages WHERE package_name = ?", (package_name,))
    conn.commit()
    conn.close()


# Inicializar DB al importar
init_users_db()
