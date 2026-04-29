from __future__ import annotations

import logging
from pathlib import Path

from app.config import settings
from app.db import SessionLocal
from app.services.runtime.probes import ensure_schema_tables, probe_database
from app.services.runtime.schema_patches import run_schema_patches
from app.services.runtime.state import STARTUP_STATE, build_troubleshooting_steps, push_startup_step, reset_startup_state, utc_now_iso
from app.services.vector_service import backfill_missing_embeddings
from app.services.vector_store import probe_chroma

logger = logging.getLogger(__name__)


def run_startup_sequence(data_root: Path, artifact_root: Path) -> None:
    """Run the backend startup sequence and record dependency status."""
    reset_startup_state()
    logger.info("Startup sequence started environment=%s", settings.environment)

    for directory, name in ((data_root, "data-root"), (artifact_root, "artifact-root")):
        directory.mkdir(parents=True, exist_ok=True)
        logger.info("Startup step complete step=%s path=%s", name, directory)
        push_startup_step(name, "ok", f"Prepared {directory}")

    db_status = probe_database()
    if not db_status.get("ok"):
        guidance = " | ".join(build_troubleshooting_steps("database"))
        detail = f"Database connection failed: {db_status.get('error', 'unknown error')}. Troubleshooting: {guidance}"
        push_startup_step("database-connectivity", "failed", detail)
        STARTUP_STATE["state"] = "failed"
        STARTUP_STATE["completed_at"] = utc_now_iso()
        STARTUP_STATE["errors"].append(detail)
        raise RuntimeError(detail)

    push_startup_step("database-connectivity", "ok", "Database connection established.")
    logger.info("Startup step complete step=database-connectivity")

    vector_status = probe_chroma()
    vector_step_status = "ok" if vector_status.get("ok") else "warn"
    push_startup_step("chroma", vector_step_status, vector_status.get("detail", "Chroma check completed."))
    if vector_status.get("error") or not vector_status.get("ok"):
        logger.warning(
            "Startup step warning step=chroma error=%s troubleshooting=%s",
            vector_status.get("error") or vector_status.get("detail"),
            " | ".join(vector_status.get("troubleshooting", build_troubleshooting_steps("chroma"))),
        )
    else:
        logger.info("Startup step complete step=chroma ok=%s count=%s", vector_status.get("ok"), vector_status.get("count"))

    if settings.auto_create_schema:
        schema_status = ensure_schema_tables()
        schema_step_status = "ok" if schema_status.get("ok") else "failed"
        detail = schema_status.get("detail") or schema_status.get("error", "")
        push_startup_step("schema-bootstrap", schema_step_status, detail)
        if not schema_status.get("ok"):
            STARTUP_STATE["state"] = "failed"
            STARTUP_STATE["completed_at"] = utc_now_iso()
            STARTUP_STATE["errors"].append(schema_status.get("error", "Schema bootstrap failed."))
            raise RuntimeError(f"Schema bootstrap failed: {schema_status.get('error', 'unknown error')}")
        logger.info("Startup step complete step=schema-bootstrap missing_tables=%s", schema_status.get("missing_tables", []))
    else:
        push_startup_step("schema-bootstrap", "skipped", "AUTO_CREATE_SCHEMA is disabled.")

    schema_patch_status = run_schema_patches()
    schema_patch_step_status = "ok" if schema_patch_status.get("ok") else "failed"
    push_startup_step("schema-patches", schema_patch_step_status, schema_patch_status.get("detail") or schema_patch_status.get("error", ""))
    if not schema_patch_status.get("ok"):
        STARTUP_STATE["state"] = "failed"
        STARTUP_STATE["completed_at"] = utc_now_iso()
        STARTUP_STATE["errors"].append(schema_patch_status.get("error", "Schema patching failed."))
        raise RuntimeError(
            "Database schema patching failed: "
            f"{schema_patch_status.get('error', 'unknown error')}. Troubleshooting: "
            f"{' | '.join(schema_patch_status.get('troubleshooting', build_troubleshooting_steps('schema-patches')))}"
        )
    logger.info(
        "Startup step complete step=schema-patches applied=%s skipped=%s",
        schema_patch_status.get("applied", []),
        schema_patch_status.get("skipped", []),
    )

    if settings.auto_backfill_rag_embeddings:
        backfill_count = 0
        try:
            with SessionLocal() as db:
                batch_size = int(settings.rag_embedding_backfill_batch_size or 2000)
                backfill_count = backfill_missing_embeddings(db, batch_size=batch_size)
            push_startup_step("rag-vector-store-sync", "ok", f"Synced {backfill_count} RAG chunks into the vector store.")
            logger.info("Startup step complete step=rag-vector-store-sync rows=%s", backfill_count)
        except Exception as exc:
            push_startup_step("rag-vector-store-sync", "warn", f"RAG vector store sync skipped: {exc}")
            logger.warning("Startup step warning step=rag-vector-store-sync error=%s", exc)
    else:
        push_startup_step("rag-vector-store-sync", "skipped", "AUTO_BACKFILL_RAG_EMBEDDINGS is disabled.")

    STARTUP_STATE["state"] = "ready"
    STARTUP_STATE["completed_at"] = utc_now_iso()
    logger.info("Startup sequence completed status=ready")
