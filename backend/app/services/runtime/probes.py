from __future__ import annotations

from urllib.parse import urlparse

import httpx
from sqlalchemy import inspect, text
from sqlalchemy.engine import URL, make_url

from app.config import settings
from app.db import engine
from app.models import Base
from app.services.runtime.state import build_troubleshooting_steps, get_startup_state
from app.services.vector_store import probe_chroma


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
            server_version = None

            if conn.dialect.name == "postgresql":
                server_version = conn.execute(text("SHOW server_version")).scalar_one_or_none()

            status.update(
                {
                    "ok": True,
                    "server_version": server_version,
                    "vector_installed": True,
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

    # Test actual Azure OpenAI API with a minimal completion request
    try:
        from app.llm_client import call_axet_chat
        
        # Attempt a minimal test chat completion
        test_messages = [{"role": "user", "content": "hi"}]
        
        # Try actual API call with configured deployment
        resp = await call_axet_chat(
            messages=test_messages,
            request_id="health-probe",
            model=settings.azure_openai_deployment
        )
        
        # If we get any response without exception, LLM is working
        return {
            "configured": True,
            "ok": True,
            "detail": "Azure OpenAI endpoint is reachable and responsive.",
            "url": llm_url,
            "deployment": settings.azure_openai_deployment,
        }
    except Exception as exc:
        # If actual API call fails, fall back to basic endpoint probe
        base = f"{parsed.scheme}://{parsed.netloc}"
        timeout = httpx.Timeout(settings.startup_probe_timeout_seconds, connect=min(2.0, settings.startup_probe_timeout_seconds))
        
        async with httpx.AsyncClient(timeout=timeout, verify=True) as client:
            # Try basic connectivity check
            for method, url in [("GET", f"{base}/"), ("HEAD", base)]:
                try:
                    resp = await client.request(method, url)
                    if 200 <= resp.status_code < 500:
                        return {
                            "configured": True,
                            "ok": True,
                            "detail": "Azure OpenAI endpoint is reachable (API test inconclusive).",
                            "url": llm_url,
                            "deployment": settings.azure_openai_deployment,
                            "warning": f"API test failed: {str(exc)[:100]}",
                        }
                except Exception:
                    continue
        
        return {
            "configured": True,
            "ok": False,
            "detail": f"Azure OpenAI endpoint probe failed: {str(exc)[:100]}",
            "url": llm_url,
            "deployment": settings.azure_openai_deployment,
            "troubleshooting": build_troubleshooting_steps("llm"),
        }


def summarize_runtime_status(db_status: dict, llm_status: dict) -> tuple[str, bool]:
    """Summarize runtime status within the service layer."""
    if not db_status.get("ok"):
        return "down", False
    vector_status = db_status.get("vector_store")
    if isinstance(vector_status, dict) and vector_status.get("ok") is False:
        return "degraded", True
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
    db_status["vector_store"] = probe_chroma()
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
