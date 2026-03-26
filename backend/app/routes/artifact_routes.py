from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.deps import get_db, record_admin_audit, verify_admin
from app.models import AnalysisRun, Artifact, RagChunk
from app.paths import ARTIFACT_ROOT
from app.services.artifact_naming_service import build_uploaded_artifact_display_name
from app.services.logging_service import log_system_audit, log_workflow_action
from app.services.parsing_service import (
    chunk_text,
    extract_data_rows,
    extract_mapping_contract,
    extract_model_catalog,
    extract_text_from_file,
    strip_nul_recursive,
    strip_nul_text,
)
from app.services.vector_service import embedding_for_text
from app.services.workflow_action_log_utils import (
    resolve_workflow_for_artifact,
    workflow_action_log_details,
    workflow_stage_from_artifact_kind,
)

router = APIRouter()


@router.post("/v1/files/upload")
async def upload_file(
    request: Request,
    project_id: str = Form(...),
    kind: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Restrict admin-managed artifact kinds
    """Upload the file for the API response."""
    k = (kind or "").strip().lower()
    if k in {"data_model", "mapping_contract"}:
        verify_admin(request)
    safe_name = f"{uuid4()}_{Path(file.filename or 'upload.bin').name}"
    project_dir = ARTIFACT_ROOT / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    save_path = project_dir / safe_name
    payload = await file.read()
    save_path.write_bytes(payload)

    extracted_text = strip_nul_text(extract_text_from_file(save_path)) or ""
    extracted_json = None
    k = (kind or "").strip().lower()
    if k == "data_model":
        extracted_json = strip_nul_recursive(extract_model_catalog(save_path))
    elif k == "data":
        extracted_json = strip_nul_recursive({"rows": extract_data_rows(save_path)})
    elif k == "mapping_contract":
        extracted_json = extract_mapping_contract(save_path)
        if not extracted_json:
            raise HTTPException(status_code=422, detail="invalid_mapping_contract_document")

    row = Artifact(
        project_id=project_id,
        kind=k,
        filename=file.filename or safe_name,
        display_name=build_uploaded_artifact_display_name(k, file.filename or safe_name),
        content_type=file.content_type,
        file_path=str(save_path),
        extracted_text=extracted_text[:500000],
        extracted_json=extracted_json,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    if k == "fca" and extracted_text.strip():
        chunks = chunk_text(extracted_text, size=1200, overlap=150)
        for i, ch in enumerate(chunks):
            db.add(
                RagChunk(
                    project_id=project_id,
                    source_ref=f"artifact:{row.id}:chunk:{i}",
                    chunk_text=ch,
                    chunk_metadata={"artifact_id": row.id, "kind": k},
                    embedding=embedding_for_text(ch),
                )
            )
        db.commit()

    # Log artifact upload
    log_system_audit(
        db,
        event_type="artifact_uploaded",
        event_category="DATA_OPERATION",
        severity="info",
        actor="user",
        description=f"Uploaded {k} artifact: {row.filename}",
        target_type="artifact",
        target_id=str(row.id),
        details={
            "project_id": project_id,
            "kind": k,
            "filename": row.filename,
            "content_type": file.content_type,
            "has_text": bool(extracted_text),
            "has_json": bool(extracted_json),
        },
        status="success",
    )
    db.commit()

    return {
        "ok": True,
        "artifact_id": row.id,
        "project_id": project_id,
        "kind": k,
        "filename": row.filename,
        "display_name": row.display_name or row.filename,
    }


@router.get("/v1/artifacts")
def list_artifacts(
    project_id: str = Query(...),
    include_deleted: bool = Query(False),
    db: Session = Depends(get_db),
):
    """List the artifacts for the API response."""
    query = db.query(Artifact).filter(Artifact.project_id == project_id)
    if not include_deleted:
        query = query.filter(Artifact.is_deleted.is_(False))
    rows = query.order_by(Artifact.id.desc()).limit(500).all()
    return {
        "ok": True,
        "project_id": project_id,
        "items": [
            {
                "id": r.id,
                "kind": r.kind,
                "filename": r.filename,
                "display_name": r.display_name or r.filename,
                "content_type": r.content_type,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "is_deleted": bool(r.is_deleted),
                "deleted_at": r.deleted_at.isoformat() if r.deleted_at else None,
                "deleted_by": r.deleted_by,
            }
            for r in rows
        ],
    }


@router.get("/v1/artifacts/{artifact_id}")
def get_artifact(artifact_id: int, db: Session = Depends(get_db)):
    """Return the artifact for the API response."""
    row = db.query(Artifact).filter(Artifact.id == artifact_id, Artifact.is_deleted.is_(False)).first()
    if not row:
        raise HTTPException(status_code=404, detail="artifact_not_found")
    return {
        "id": row.id,
        "project_id": row.project_id,
        "kind": row.kind,
        "filename": row.filename,
        "display_name": row.display_name or row.filename,
        "content_type": row.content_type,
        "file_path": row.file_path,
        "extracted_text_preview": (row.extracted_text or "")[:3000],
        "extracted_json": row.extracted_json,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/v1/artifacts/{artifact_id}/download")
def download_artifact(artifact_id: int, request: Request, db: Session = Depends(get_db)):
    """Download the artifact for the API response."""
    row = db.query(Artifact).filter(Artifact.id == artifact_id, Artifact.is_deleted.is_(False)).first()
    if not row:
        raise HTTPException(status_code=404, detail="artifact_not_found")
    
    # Restrict data_model downloads to admin only
    if row.kind == "data_model":
        verify_admin(request)
    p = Path(row.file_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="artifact_file_missing")
    workflow = resolve_workflow_for_artifact(db, row)
    if workflow:
        stage = workflow_stage_from_artifact_kind(row.kind) or workflow.current_stage
        log_workflow_action(
            db,
            workflow_id=workflow.id,
            project_id=workflow.project_id,
            action_type="artifact_download",
            action_category=stage or "SYSTEM",
            actor="admin.user" if row.kind == "data_model" else "user",
            description=f"Downloaded artifact: {row.display_name or row.filename}",
            status="success",
            stage=stage,
            details=workflow_action_log_details(
                source_type="artifact",
                source_id=row.id,
                artifact=row,
            ),
        )
        db.commit()
    return FileResponse(p, filename=row.filename, media_type=row.content_type or "application/octet-stream")


@router.delete("/v1/artifacts/{artifact_id}")
def delete_artifact(
    artifact_id: int,
    request: Request,
    project_id: str = Query(...),
    actor: str = Query("admin"),
    hard_delete: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Delete the artifact for the API response."""
    verify_admin(request)
    row = db.query(Artifact).filter(Artifact.id == artifact_id, Artifact.project_id == project_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="artifact_not_found")

    if hard_delete:
        file_path = Path(row.file_path)
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass

        db.query(RagChunk).filter(RagChunk.project_id == project_id, RagChunk.source_ref.like(f"artifact:{row.id}:chunk:%")).delete(synchronize_session=False)
        db.query(AnalysisRun).filter(AnalysisRun.project_id == project_id, AnalysisRun.output_artifact_id == row.id).update({AnalysisRun.output_artifact_id: None}, synchronize_session=False)
        db.delete(row)

        record_admin_audit(
            db,
            action="artifact_hard_delete",
            target_type="artifact",
            target_id=str(artifact_id),
            project_id=project_id,
            actor=actor,
            details={"hard_delete": True},
        )
        
        # Log system audit
        log_system_audit(
            db,
            event_type="artifact_deleted",
            event_category="DATA_OPERATION",
            severity="warning",
            actor=actor,
            description=f"Hard deleted artifact: {row.filename}",
            target_type="artifact",
            target_id=str(artifact_id),
            details={
                "project_id": project_id,
                "kind": row.kind,
                "filename": row.filename,
                "hard_delete": True,
            },
            status="success",
        )
        
        db.commit()
        return {"ok": True, "artifact_id": artifact_id, "hard_delete": True}

    row.is_deleted = True
    from datetime import datetime, timezone

    row.deleted_at = datetime.now(timezone.utc)
    row.deleted_by = actor
    record_admin_audit(
        db,
        action="artifact_soft_delete",
        target_type="artifact",
        target_id=str(artifact_id),
        project_id=project_id,
        actor=actor,
        details={"hard_delete": False},
    )
    
    # Log system audit
    log_system_audit(
        db,
        event_type="artifact_deleted",
        event_category="DATA_OPERATION",
        severity="info",
        actor=actor,
        description=f"Soft deleted artifact: {row.filename}",
        target_type="artifact",
        target_id=str(artifact_id),
        details={
            "project_id": project_id,
            "kind": row.kind,
            "filename": row.filename,
            "hard_delete": False,
        },
        status="success",
    )
    
    db.commit()
    return {"ok": True, "artifact_id": artifact_id, "hard_delete": False}


@router.post("/v1/admin/artifacts/{artifact_id}/restore")
def restore_artifact(
    artifact_id: int,
    request: Request,
    project_id: str = Query(...),
    actor: str = Query("admin"),
    db: Session = Depends(get_db),
):
    """Restore the artifact for the API response."""
    verify_admin(request)
    row = db.query(Artifact).filter(Artifact.id == artifact_id, Artifact.project_id == project_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="artifact_not_found")
    row.is_deleted = False
    row.deleted_at = None
    row.deleted_by = None
    record_admin_audit(
        db,
        action="artifact_restore",
        target_type="artifact",
        target_id=str(artifact_id),
        project_id=project_id,
        actor=actor,
        details={},
    )
    
    # Log system audit
    log_system_audit(
        db,
        event_type="artifact_restored",
        event_category="DATA_OPERATION",
        severity="info",
        actor=actor,
        description=f"Restored artifact: {row.filename}",
        target_type="artifact",
        target_id=str(artifact_id),
        details={
            "project_id": project_id,
            "kind": row.kind,
            "filename": row.filename,
        },
        status="success",
    )
    
    db.commit()
    return {"ok": True, "artifact_id": artifact_id}


@router.post("/v1/admin/artifacts/{artifact_id}/reparse")
def reparse_artifact(
    artifact_id: int,
    request: Request,
    project_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """Reparse an existing artifact to update its extracted_json with latest parsing logic."""
    verify_admin(request)
    row = db.query(Artifact).filter(Artifact.id == artifact_id, Artifact.project_id == project_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="artifact_not_found")
    
    file_path = Path(row.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="artifact_file_missing")
    
    # Re-extract based on kind
    k = (row.kind or "").strip().lower()
    extracted_json = None
    
    if k == "data_model":
        extracted_json = strip_nul_recursive(extract_model_catalog(file_path))
    elif k == "data":
        extracted_json = strip_nul_recursive({"rows": extract_data_rows(file_path)})
    elif k == "mapping_contract":
        extracted_json = extract_mapping_contract(file_path)
        if not extracted_json:
            raise HTTPException(status_code=422, detail="invalid_mapping_contract_document")
    
    # Update the artifact
    old_json_keys = list((row.extracted_json or {}).keys()) if isinstance(row.extracted_json, dict) else []
    row.extracted_json = extracted_json
    
    # Log the reparse action
    log_system_audit(
        db,
        event_type="artifact_reparsed",
        event_category="DATA_OPERATION",
        severity="info",
        actor="admin",
        description=f"Reparsed {k} artifact: {row.filename}",
        target_type="artifact",
        target_id=str(artifact_id),
        details={
            "project_id": project_id,
            "kind": k,
            "filename": row.filename,
            "old_json_keys": old_json_keys,
            "new_json_keys": list((extracted_json or {}).keys()) if isinstance(extracted_json, dict) else [],
            "has_tables_key": "tables" in (extracted_json or {}) if isinstance(extracted_json, dict) else False,
        },
        status="success",
    )
    
    db.commit()
    db.refresh(row)
    
    return {
        "ok": True,
        "artifact_id": artifact_id,
        "kind": k,
        "filename": row.filename,
        "has_tables_key": "tables" in (row.extracted_json or {}) if isinstance(row.extracted_json, dict) else False,
        "extracted_json_keys": list((row.extracted_json or {}).keys()) if isinstance(row.extracted_json, dict) else [],
    }


@router.get("/v1/admin/artifacts")
def admin_list_artifacts(
    request: Request,
    project_id: str = Query(...),
    include_deleted: bool = Query(True),
    db: Session = Depends(get_db),
):
    """Handle the list artifacts API request."""
    verify_admin(request)
    query = db.query(Artifact).filter(Artifact.project_id == project_id)
    if not include_deleted:
        query = query.filter(Artifact.is_deleted.is_(False))
    rows = query.order_by(Artifact.id.desc()).limit(1000).all()
    return {
        "ok": True,
        "project_id": project_id,
        "items": [
            {
                "id": r.id,
                "kind": r.kind,
                "filename": r.filename,
                "display_name": r.display_name or r.filename,
                "content_type": r.content_type,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "is_deleted": bool(r.is_deleted),
                "deleted_at": r.deleted_at.isoformat() if r.deleted_at else None,
                "deleted_by": r.deleted_by,
            }
            for r in rows
        ],
    }
