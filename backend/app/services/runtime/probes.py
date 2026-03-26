from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

import httpx
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.engine import URL, make_url

from app.config import settings
from app.db import engine
from app.models import Base
from app.services.runtime.state import build_troubleshooting_steps, get_startup_state

BACKEND_ROOT = Path(__file__).resolve().parents[3]


def mask_connection_url(raw_url: str) -> str:
    """Mask connection url within the service layer."""
    try:
        url = make_url(raw_url)
        if isinstance(url, URL):
            return url.render_as_string(hide_password=True)
    except Exception:
        pass
    return raw_url


def probe_database() -> dict:
    """Probe database within the service layer."""
    status = {
        "configured_url": mask_connection_url(settings.database_url),
        "dialect": engine.url.get_backend_name(),
        "ok": False,
    }
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            inspector = inspect(conn)
            existing_tables = sorted(inspector.get_table_names())
            required_tables = sorted(Base.metadata.tables.keys())
            missing_tables = sorted(set(required_tables) - set(existing_tables))
            vector_installed = False
            server_version = None

            if conn.dialect.name == "postgresql":
                server_version = conn.execute(text("SHOW server_version")).scalar_one_or_none()
                vector_installed = bool(
                    conn.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")).scalar()
                )

            status.update(
                {
                    "ok": True,
                    "server_version": server_version,
                    "vector_installed": vector_installed,
                    "schema": {
                        "required_table_count": len(required_tables),
                        "existing_table_count": len(existing_tables),
                        "missing_tables": missing_tables,
                        "complete": not missing_tables,
                    },
                }
            )
    except Exception as exc:
        status["error"] = str(exc)
        status["troubleshooting"] = build_troubleshooting_steps("database")
    return status


def ensure_pgvector_extension() -> dict:
    """Ensure pgvector extension within the service layer."""
    result = {
        "attempted": False,
        "installed": False,
        "required_for_bootstrap": True,
    }
    if engine.url.get_backend_name() != "postgresql":
        result["detail"] = "Skipped pgvector extension check for non-PostgreSQL backend."
        return result

    result["attempted"] = True
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            result["installed"] = bool(
                conn.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")).scalar()
            )
            result["detail"] = "pgvector extension is available."
    except Exception as exc:
        result["error"] = str(exc)
        result["detail"] = "pgvector extension could not be enabled automatically."
        result["troubleshooting"] = build_troubleshooting_steps("pgvector")
    return result


def ensure_rag_chunk_embedding_column() -> dict:
    """Align rag_chunks.embedding with pgvector even for pre-migration local databases."""
    result = {
        "attempted": False,
        "aligned": False,
        "installed": False,
    }
    if engine.url.get_backend_name() != "postgresql":
        result["detail"] = "Skipped rag_chunks embedding alignment for non-PostgreSQL backend."
        return result

    result["attempted"] = True
    try:
        with engine.begin() as conn:
            exists = bool(
                conn.execute(
                    text(
                        """
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_name = 'rag_chunks' AND column_name = 'embedding'
                        """
                    )
                ).scalar()
            )
            if not exists:
                result["detail"] = "rag_chunks.embedding column is not present yet."
                result["aligned"] = True
                return result

            udt_name = conn.execute(
                text(
                    """
                    SELECT udt_name
                    FROM information_schema.columns
                    WHERE table_name = 'rag_chunks' AND column_name = 'embedding'
                    """
                )
            ).scalar_one_or_none()

            if str(udt_name or "").lower() != "vector":
                conn.execute(
                    text(
                        f"""
                        ALTER TABLE rag_chunks
                        ALTER COLUMN embedding
                        TYPE vector({int(settings.embedding_dim)})
                        USING CASE
                            WHEN embedding IS NULL THEN NULL
                            ELSE embedding::vector
                        END
                        """
                    )
                )

            conn.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS ix_rag_chunks_project_id_source_ref
                    ON rag_chunks (project_id, source_ref)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS ix_rag_chunks_embedding_ivfflat
                    ON rag_chunks USING ivfflat (embedding vector_cosine_ops)
                    WITH (lists = 100)
                    """
                )
            )

        result["aligned"] = True
        result["installed"] = True
        result["detail"] = "rag_chunks.embedding is aligned to pgvector storage."
    except Exception as exc:
        result["error"] = str(exc)
        result["detail"] = "rag_chunks.embedding could not be aligned to pgvector automatically."
        result["troubleshooting"] = build_troubleshooting_steps("pgvector")
    return result


def run_database_migrations() -> dict:
    """Handle run database migrations within the service layer."""
    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    try:
        command.upgrade(cfg, "head")
        return {"ran": True, "ok": True, "detail": "Alembic migrations applied."}
    except Exception as exc:
        return {"ran": True, "ok": False, "error": str(exc), "troubleshooting": build_troubleshooting_steps("migrations")}


def ensure_schema_tables() -> dict:
    """Ensure schema tables within the service layer."""
    try:
        Base.metadata.create_all(bind=engine)
        post_probe = probe_database()
        return {
            "ran": True,
            "ok": post_probe.get("ok", False),
            "missing_tables": post_probe.get("schema", {}).get("missing_tables", []),
            "detail": "SQLAlchemy metadata synchronization completed.",
        }
    except Exception as exc:
        return {"ran": True, "ok": False, "error": str(exc)}


async def probe_llm() -> dict:
    """Probe LLM within the service layer - checks Azure OpenAI configuration."""
    # Check if Azure OpenAI is configured
    if not settings.azure_openai_endpoint or not settings.azure_openai_api_key:
        return {
            "configured": False,
            "ok": False,
            "detail": "Azure OpenAI not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY.",
            "endpoint": settings.azure_openai_endpoint or "not set",
            "troubleshooting": build_troubleshooting_steps("llm"),
        }

    llm_url = settings.azure_openai_endpoint
    parsed = urlparse(llm_url)
    if not parsed.scheme or not parsed.netloc:
        return {
            "configured": True,
            "ok": False,
            "detail": "AZURE_OPENAI_ENDPOINT is invalid.",
            "url": llm_url,
            "troubleshooting": build_troubleshooting_steps("llm"),
        }

    # Probe Azure OpenAI endpoint
    base = f"{parsed.scheme}://{parsed.netloc}"
    candidates = [
        ("GET", f"{base}/"),
        ("HEAD", base),
    ]

    timeout = httpx.Timeout(settings.startup_probe_timeout_seconds, connect=min(2.0, settings.startup_probe_timeout_seconds))
    async with httpx.AsyncClient(timeout=timeout, verify=True) as client:
        for method, url in candidates:
            try:
                resp = await client.request(method, url)
                if 200 <= resp.status_code < 500:
                    return {
                        "configured": True,
                        "ok": True,
                        "detail": "Azure OpenAI endpoint is reachable.",
                        "url": llm_url,
                        "deployment": settings.azure_openai_deployment,
                    }
            except Exception:
                continue
    
    return {
        "configured": True,
        "ok": False,
        "detail": "Azure OpenAI endpoint probe failed (may still work for API calls).",
        "url": llm_url,
        "deployment": settings.azure_openai_deployment,
        "troubleshooting": build_troubleshooting_steps("llm"),
    }


def summarize_runtime_status(db_status: dict, llm_status: dict) -> tuple[str, bool]:
    """Summarize runtime status within the service layer."""
    if not db_status.get("ok"):
        return "down", False
    if llm_status.get("ok") is False:
        return "degraded", True
    if db_status.get("schema", {}).get("complete") is False:
        return "degraded", True
    if db_status.get("vector_installed") is False:
        return "degraded", True
    return "ready", True


async def collect_runtime_health() -> dict:
    """Collect runtime health within the service layer."""
    db_status = probe_database()
    llm_status = await probe_llm()
    status, ready = summarize_runtime_status(db_status, llm_status)
    return {
        "ok": ready,
        "ready": ready,
        "status": status,
        "service": "fca-local-api",
        "environment": settings.environment,
        "llm_endpoint": settings.azure_openai_endpoint,
        "llm_deployment": settings.azure_openai_deployment,
        "llm_up": llm_status.get("ok", False),
        "startup": get_startup_state(),
        "dependencies": {
            "database": db_status,
            "llm": llm_status,
        },
    }
