from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from app.config import settings
from app.db import engine
from app.services.runtime.state import build_troubleshooting_steps


@dataclass(frozen=True)
class SchemaPatch:
    patch_id: str
    description: str
    apply: Callable[[Connection], None]


def _checksum(patch: SchemaPatch) -> str:
    raw = f"{patch.patch_id}:{patch.description}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _table_exists(conn: Connection, table_name: str) -> bool:
    return inspect(conn).has_table(table_name)


def _column_exists(conn: Connection, table_name: str, column_name: str) -> bool:
    if not _table_exists(conn, table_name):
        return False
    columns = inspect(conn).get_columns(table_name)
    return column_name in {column["name"] for column in columns}


def _index_exists(conn: Connection, table_name: str, index_name: str) -> bool:
    if not _table_exists(conn, table_name):
        return False
    indexes = inspect(conn).get_indexes(table_name)
    return index_name in {index["name"] for index in indexes}


def _run(conn: Connection, sql: str) -> None:
    conn.execute(text(sql))


def _add_column_if_missing(conn: Connection, table_name: str, column_name: str, ddl: str) -> None:
    if _table_exists(conn, table_name) and not _column_exists(conn, table_name, column_name):
        _run(conn, f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}")


def _create_index_if_missing(conn: Connection, table_name: str, index_name: str, columns: str) -> None:
    if _table_exists(conn, table_name) and not _index_exists(conn, table_name, index_name):
        _run(conn, f"CREATE INDEX {index_name} ON {table_name} ({columns})")


def _json_type(conn: Connection) -> str:
    return "JSONB" if conn.dialect.name == "postgresql" else "JSON"


def _now_sql(conn: Connection) -> str:
    return "now()" if conn.dialect.name == "postgresql" else "CURRENT_TIMESTAMP"


def _ensure_patch_table(conn: Connection) -> None:
    if conn.dialect.name == "postgresql":
        _run(
            conn,
            """
            CREATE TABLE IF NOT EXISTS app_schema_patches (
                patch_id VARCHAR(120) PRIMARY KEY,
                checksum VARCHAR(64) NOT NULL,
                description TEXT NOT NULL,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
            )
            """,
        )
        return

    _run(
        conn,
        """
        CREATE TABLE IF NOT EXISTS app_schema_patches (
            patch_id VARCHAR(120) PRIMARY KEY,
            checksum VARCHAR(64) NOT NULL,
            description TEXT NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
        """,
    )


def _applied_patch_ids(conn: Connection) -> set[str]:
    rows = conn.execute(text("SELECT patch_id FROM app_schema_patches")).fetchall()
    return {str(row[0]) for row in rows}


def _record_patch(conn: Connection, patch: SchemaPatch) -> None:
    if conn.dialect.name == "postgresql":
        conn.execute(
            text(
                """
                INSERT INTO app_schema_patches (patch_id, checksum, description)
                VALUES (:patch_id, :checksum, :description)
                ON CONFLICT (patch_id) DO UPDATE
                SET checksum = EXCLUDED.checksum,
                    description = EXCLUDED.description
                """
            ),
            {
                "patch_id": patch.patch_id,
                "checksum": _checksum(patch),
                "description": patch.description,
            },
        )
        return

    conn.execute(
        text(
            """
            INSERT OR REPLACE INTO app_schema_patches (patch_id, checksum, description)
            VALUES (:patch_id, :checksum, :description)
            """
        ),
        {
            "patch_id": patch.patch_id,
            "checksum": _checksum(patch),
            "description": patch.description,
        },
    )


def _patch_incremental_workflow_columns(conn: Connection) -> None:
    json_type = _json_type(conn)
    _add_column_if_missing(conn, "artifacts", "is_deleted", "BOOLEAN NOT NULL DEFAULT false")
    _add_column_if_missing(conn, "artifacts", "deleted_at", "TIMESTAMP WITH TIME ZONE")
    _add_column_if_missing(conn, "artifacts", "deleted_by", "VARCHAR(120)")
    _add_column_if_missing(conn, "workflows", "latest_report_xml_artifact_id", "INTEGER")
    _add_column_if_missing(conn, "workflows", "ba_gap_waivers_json", json_type)
    _add_column_if_missing(conn, "workflow_stage_history", "details_json", json_type)


def _patch_artifact_display_name(conn: Connection) -> None:
    _add_column_if_missing(conn, "artifacts", "display_name", "VARCHAR(255)")
    if _table_exists(conn, "artifacts") and _column_exists(conn, "artifacts", "filename"):
        _run(conn, "UPDATE artifacts SET display_name = filename WHERE display_name IS NULL")


def _patch_normalize_workflow_action_logs(conn: Connection) -> None:
    if not _table_exists(conn, "workflow_action_logs"):
        return

    _run(
        conn,
        """
        UPDATE workflow_action_logs
        SET action_type = lower(replace(replace(trim(action_type), ' ', '_'), '-', '_'))
        WHERE action_type IS NOT NULL
        """,
    )
    _run(
        conn,
        """
        UPDATE workflow_action_logs
        SET action_category = CASE
            WHEN upper(trim(coalesce(action_category, ''))) IN ('BA', 'BA_ACTION', 'BUSINESS_ANALYST') THEN 'BA'
            WHEN upper(trim(coalesce(action_category, ''))) IN ('DEV', 'DEV_ACTION', 'DEVELOPER') THEN 'DEV'
            WHEN upper(trim(coalesce(action_category, ''))) IN ('REVIEWER', 'REVIEWER_ACTION', 'QA') THEN 'REVIEWER'
            ELSE 'SYSTEM'
        END
        """,
    )
    _run(
        conn,
        """
        UPDATE workflow_action_logs
        SET actor = CASE
            WHEN upper(trim(coalesce(actor, ''))) IN ('BA', 'BUSINESS_ANALYST') THEN 'ba.user'
            WHEN upper(trim(coalesce(actor, ''))) IN ('DEV', 'DEVELOPER') THEN 'dev.user'
            WHEN upper(trim(coalesce(actor, ''))) IN ('REVIEWER', 'QA') THEN 'reviewer.user'
            WHEN lower(trim(coalesce(actor, ''))) = 'system' THEN 'system'
            WHEN trim(coalesce(actor, '')) = '' THEN
                CASE
                    WHEN action_category = 'BA' THEN 'ba.user'
                    WHEN action_category = 'DEV' THEN 'dev.user'
                    WHEN action_category = 'REVIEWER' THEN 'reviewer.user'
                    ELSE 'system'
                END
            ELSE actor
        END
        """,
    )
    _run(
        conn,
        """
        UPDATE workflow_action_logs
        SET status = CASE
            WHEN lower(trim(coalesce(status, ''))) IN ('ok', 'success') THEN 'success'
            WHEN lower(trim(coalesce(status, ''))) IN ('warning', 'warn', 'partial') THEN 'partial'
            WHEN lower(trim(coalesce(status, ''))) IN ('failure', 'failed', 'error') THEN 'failure'
            ELSE 'success'
        END
        """,
    )
    _run(
        conn,
        """
        UPDATE workflow_action_logs
        SET stage = CASE
            WHEN upper(trim(coalesce(stage, ''))) IN ('BA', 'DEV', 'REVIEWER', 'COMPLETED') THEN upper(trim(stage))
            WHEN action_category IN ('BA', 'DEV', 'REVIEWER') THEN action_category
            ELSE NULL
        END
        """,
    )


def _patch_indexes(conn: Connection) -> None:
    index_specs = [
        ("rag_chunks", "ix_rag_chunks_project_id_source_ref", "project_id, source_ref"),
        ("gate_configurations", "ix_gate_configurations_project_stage", "project_id, stage"),
        ("workflow_action_logs", "ix_workflow_action_logs_workflow_id", "workflow_id"),
        ("workflow_action_logs", "ix_workflow_action_logs_project_id", "project_id"),
        ("workflow_action_logs", "ix_workflow_action_logs_action_type", "action_type"),
        ("workflow_action_logs", "ix_workflow_action_logs_action_category", "action_category"),
        ("workflow_action_logs", "ix_workflow_action_logs_actor", "actor"),
        ("workflow_action_logs", "ix_workflow_action_logs_status", "status"),
        ("workflow_action_logs", "ix_workflow_action_logs_stage", "stage"),
        ("workflow_action_logs", "ix_workflow_action_logs_created_at", "created_at"),
        ("system_audit_logs", "ix_system_audit_logs_event_type", "event_type"),
        ("system_audit_logs", "ix_system_audit_logs_event_category", "event_category"),
        ("system_audit_logs", "ix_system_audit_logs_severity", "severity"),
        ("system_audit_logs", "ix_system_audit_logs_actor", "actor"),
        ("system_audit_logs", "ix_system_audit_logs_target_type", "target_type"),
        ("system_audit_logs", "ix_system_audit_logs_project_id", "project_id"),
        ("system_audit_logs", "ix_system_audit_logs_status", "status"),
        ("system_audit_logs", "ix_system_audit_logs_created_at", "created_at"),
        ("job_queue", "ix_job_queue_job_type", "job_type"),
        ("job_queue", "ix_job_queue_status", "status"),
        ("job_queue", "ix_job_queue_workflow_id", "workflow_id"),
        ("job_queue", "ix_job_queue_project_id", "project_id"),
        ("job_queue", "ix_job_queue_created_at", "created_at"),
    ]
    for table_name, index_name, columns in index_specs:
        _create_index_if_missing(conn, table_name, index_name, columns)


def _patch_drop_legacy_rag_embedding(conn: Connection) -> None:
    if _table_exists(conn, "rag_chunks") and _column_exists(conn, "rag_chunks", "embedding"):
        _run(conn, "ALTER TABLE rag_chunks DROP COLUMN embedding")


def _patch_gate_configuration_legacy_table(conn: Connection) -> None:
    if not (_table_exists(conn, "gate_configuration") and _table_exists(conn, "gate_configurations")):
        return

    now_sql = _now_sql(conn)
    _run(
        conn,
        f"""
        INSERT INTO gate_configurations (
            project_id,
            stage,
            gate_enabled,
            allow_unresolved_missing,
            allow_degraded_quality,
            require_sql_validation,
            require_xml_artifact,
            min_coverage_score,
            require_xsd_validation,
            require_rule_checks,
            updated_by,
            custom_config_json,
            created_at,
            updated_at
        )
        SELECT
            source.project_id,
            source.stage,
            coalesce(source.gate_enabled, true),
            coalesce(source.allow_unresolved_missing, false),
            coalesce(source.allow_degraded_quality, false),
            coalesce(source.require_sql_validation, true),
            coalesce(source.require_xml_artifact, true),
            coalesce(source.min_coverage_score, 0.85),
            coalesce(source.require_xsd_validation, true),
            coalesce(source.require_rule_checks, true),
            source.updated_by,
            source.custom_config_json,
            coalesce(source.created_at, {now_sql}),
            coalesce(source.updated_at, {now_sql})
        FROM gate_configuration source
        WHERE NOT EXISTS (
            SELECT 1
            FROM gate_configurations target
            WHERE target.project_id = source.project_id
              AND target.stage = source.stage
        )
        """
    )


def _patch_mark_compat_placeholder(conn: Connection) -> None:
    # Preserves parity with the old no-op Alembic compatibility revision.
    return None


PATCHES: tuple[SchemaPatch, ...] = (
    SchemaPatch("20260304_01_incremental_workflow_columns", "Add soft-delete and workflow stage detail columns.", _patch_incremental_workflow_columns),
    SchemaPatch("20260305_01_gate_configuration_legacy_copy", "Copy legacy singular gate configuration rows into the current plural table.", _patch_gate_configuration_legacy_table),
    SchemaPatch("20260311_01_artifact_display_name", "Add and backfill artifact display names.", _patch_artifact_display_name),
    SchemaPatch("20260311_02_normalize_workflow_action_logs", "Normalize existing workflow action log values.", _patch_normalize_workflow_action_logs),
    SchemaPatch("20260316_01_compat_placeholder", "Record compatibility placeholder from the previous migration chain.", _patch_mark_compat_placeholder),
    SchemaPatch("20260429_01_drop_legacy_rag_embedding", "Drop legacy Postgres vector embedding column after Chroma migration.", _patch_drop_legacy_rag_embedding),
    SchemaPatch("20260319_01_supporting_indexes", "Create supporting indexes not guaranteed by create_all on existing tables.", _patch_indexes),
)


def run_schema_patches() -> dict:
    """Apply idempotent schema patches and record successful patch ids."""
    if not settings.auto_apply_schema_patches:
        return {"ran": False, "ok": True, "detail": "AUTO_APPLY_SCHEMA_PATCHES is disabled.", "applied": [], "skipped": []}

    applied: list[str] = []
    skipped: list[str] = []
    try:
        with engine.begin() as conn:
            _ensure_patch_table(conn)
            already_applied = _applied_patch_ids(conn)
            for patch in PATCHES:
                if patch.patch_id in already_applied:
                    skipped.append(patch.patch_id)
                    continue
                patch.apply(conn)
                _record_patch(conn, patch)
                applied.append(patch.patch_id)

        detail = f"Applied {len(applied)} schema patch(es); skipped {len(skipped)} already-applied patch(es)."
        return {"ran": True, "ok": True, "detail": detail, "applied": applied, "skipped": skipped}
    except Exception as exc:
        return {
            "ran": True,
            "ok": False,
            "error": str(exc),
            "applied": applied,
            "skipped": skipped,
            "troubleshooting": build_troubleshooting_steps("schema-patches"),
        }
