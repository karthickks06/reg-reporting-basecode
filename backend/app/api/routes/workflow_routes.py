from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import settings
from app.models import AnalysisRun, Artifact, Workflow, WorkflowStageHistory
from app.paths import ARTIFACT_ROOT
from app.schemas import WorkflowDetailResponse, WorkflowListResponse, WorkflowQualitySummaryResponse, WorkflowResponseEnvelope
from app.services.functional_spec_service import (
    build_functional_spec_artifact,
    functional_spec_download_payload,
    validate_store_format,
    write_functional_spec_file,
)
from app.services.logging_service import log_workflow_action
from app.services.workflow_action_log_utils import workflow_action_log_details
from app.services.workflow_history_service import add_workflow_history
from app.services.workflow_provenance_service import ensure_gap_run_is_current_for_workflow
from app.services.workflow_service import (
    create_workflow_version_comment,
    normalize_persona,
    quality_open_issue_count,
    send_back_workflow_stage as service_send_back_workflow_stage,
    serialize_workflow,
    submit_workflow_stage as service_submit_workflow_stage,
    workflow_pending_for,
)
from app.services.workflow_gates import evaluate_stage_exit_gate

router = APIRouter()


class WorkflowCreateRequest(BaseModel):
    project_id: str
    name: str
    psd_version: str | None = None
    workflow_type: str | None = None
    description: str | None = None
    version: str | None = None
    actor: str = "ba.user"
    assigned_ba: str = "ba.user"
    assigned_dev: str = "dev.user"
    assigned_reviewer: str = "reviewer.user"
    parent_workflow_id: int | None = None


class WorkflowTransitionRequest(BaseModel):
    actor: str
    comment: str | None = None
    target_stage: str | None = None
    reason_code: str | None = None
    reason_detail: str | None = None


class WorkflowFinalizeSpecRequest(BaseModel):
    actor: str
    gap_run_id: int
    store_format: str = "json"
    auto_advance: bool = False


class WorkflowCreateVersionRequest(BaseModel):
    actor: str = "ba.user"
    name: str | None = None
    psd_version: str | None = None
    comment: str | None = None
    reuse_latest_gap_run: bool = True
    reuse_functional_spec: bool = True
    clone_unresolved_only: bool = False


class WorkflowUpdateRequest(BaseModel):
    gap_run_id: int | None = None
    sql_run_id: int | None = None
    xml_validation_run_id: int | None = None
    ba_gap_waivers_json: dict | None = None
    actor: str | None = None
    comment: str | None = None


@router.post("/v1/workflows", response_model=WorkflowResponseEnvelope)
def create_workflow(req: WorkflowCreateRequest, db: Session = Depends(get_db)):
    """Create workflow."""
    wf = Workflow(
        project_id=req.project_id,
        name=req.name.strip() or f"workflow-{uuid4()}",
        psd_version=(req.psd_version or "").strip() or None,
        workflow_type=(req.workflow_type or "Complete").strip() or "Complete",
        description=(req.description or "").strip() or None,
        version=(req.version or req.psd_version or "1.0").strip() or "1.0",
        current_stage="BA",
        status="in_progress",
        stage_status="in_progress",
        assigned_ba=req.assigned_ba,
        assigned_dev=req.assigned_dev,
        assigned_reviewer=req.assigned_reviewer,
        current_assignee=req.assigned_ba,
        started_by=req.actor,
        parent_workflow_id=req.parent_workflow_id,
        is_active=True,
    )
    db.add(wf)
    db.commit()
    db.refresh(wf)

    db.add(
        add_workflow_history(
            workflow_id=wf.id,
            project_id=wf.project_id,
            from_stage=None,
            to_stage="BA",
            action="created",
            actor=req.actor,
            comment="Workflow created",
        )
    )
    db.commit()
    return {"ok": True, "workflow": serialize_workflow(wf)}


@router.post("/v1/workflows/{workflow_id}/create-version", response_model=WorkflowResponseEnvelope)
def create_workflow_version(workflow_id: int, req: WorkflowCreateVersionRequest, db: Session = Depends(get_db)):
    """Create workflow version."""
    source = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="workflow_not_found")

    next_name = (req.name or "").strip() or f"{source.name} - New Version"
    next_psd_version = (req.psd_version or "").strip() or source.psd_version
    carry_gap_run_id = source.latest_gap_run_id if req.reuse_latest_gap_run else None
    carry_spec_artifact_id = source.functional_spec_artifact_id if req.reuse_functional_spec else None
    unresolved_refs: list[str] = []
    unresolved_fields: list[str] = []
    if req.clone_unresolved_only and carry_gap_run_id:
        prior_gap = (
            db.query(AnalysisRun)
            .filter(
                AnalysisRun.id == carry_gap_run_id,
                AnalysisRun.project_id == source.project_id,
                AnalysisRun.run_type == "gap_analysis",
            )
            .first()
        )
        rows = ((prior_gap.output_json or {}).get("rows") if prior_gap else []) or []
        for row in rows:
            if not isinstance(row, dict):
                continue
            status = str(row.get("status") or "").strip().lower()
            if "missing" not in status:
                continue
            ref = str(row.get("ref") or "").strip()
            field = str(row.get("field") or "").strip()
            if ref:
                unresolved_refs.append(ref)
            if field:
                unresolved_fields.append(field)

    new_workflow = Workflow(
        project_id=source.project_id,
        name=next_name,
        psd_version=next_psd_version,
        workflow_type=source.workflow_type,
        description=source.description,
        version=source.version or next_psd_version or "1.0",
        current_stage="BA",
        status="in_progress",
        stage_status="in_progress",
        assigned_ba=source.assigned_ba,
        assigned_dev=source.assigned_dev,
        assigned_reviewer=source.assigned_reviewer,
        current_assignee=source.assigned_ba,
        started_by=req.actor,
        parent_workflow_id=source.id,
        latest_gap_run_id=carry_gap_run_id,
        functional_spec_artifact_id=carry_spec_artifact_id,
        ba_gap_waivers_json=(
            {
                "carry_forward_mode": "unresolved_only",
                "unresolved_refs": sorted(set(unresolved_refs)),
                "unresolved_fields": sorted(set(unresolved_fields)),
            }
            if req.clone_unresolved_only
            else source.ba_gap_waivers_json
        ),
        is_active=True,
    )
    db.add(new_workflow)
    db.commit()
    db.refresh(new_workflow)

    db.add(
        add_workflow_history(
            workflow_id=new_workflow.id,
            project_id=new_workflow.project_id,
            from_stage=None,
            to_stage="BA",
            action="version_created",
            actor=req.actor,
            comment=(
                req.comment
                or create_workflow_version_comment(
                    source.id,
                    req.reuse_latest_gap_run,
                    req.reuse_functional_spec,
                    req.clone_unresolved_only,
                    len(set(unresolved_refs)),
                )
            ),
        )
    )
    db.add(
        add_workflow_history(
            workflow_id=source.id,
            project_id=source.project_id,
            from_stage=source.current_stage,
            to_stage=source.current_stage,
            action="version_spawned",
            actor=req.actor,
            comment=f"Spawned workflow version {new_workflow.id}",
        )
    )
    db.commit()
    return {"ok": True, "workflow": serialize_workflow(new_workflow), "source_workflow_id": source.id}


@router.get("/v1/workflows", response_model=WorkflowListResponse)
def list_workflows(
    project_id: str = Query(...),
    persona: str | None = Query(None),
    include_closed: bool = Query(False),
    db: Session = Depends(get_db),
):
    """List workflows."""
    query = db.query(Workflow).filter(Workflow.project_id == project_id)
    if not include_closed:
        query = query.filter(Workflow.is_active.is_(True))
    rows = query.order_by(Workflow.updated_at.desc(), Workflow.id.desc()).all()
    norm_persona = normalize_persona(persona) if persona else None
    return {
        "project_id": project_id,
        "items": [serialize_workflow(w, norm_persona) for w in rows],
    }


@router.patch("/v1/workflow/{workflow_id}", response_model=WorkflowResponseEnvelope)
def update_workflow(workflow_id: int, req: WorkflowUpdateRequest, db: Session = Depends(get_db)):
    """Update workflow."""
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    
    updated = False
    if req.gap_run_id is not None:
        gap_run = (
            db.query(AnalysisRun)
            .filter(
                AnalysisRun.id == req.gap_run_id,
                AnalysisRun.project_id == wf.project_id,
                AnalysisRun.run_type == "gap_analysis",
            )
            .first()
        )
        if not gap_run:
            raise HTTPException(status_code=404, detail="gap_run_not_found")
        if int((gap_run.input_json or {}).get("workflow_id") or 0) != wf.id:
            raise HTTPException(status_code=422, detail="workflow_run_mismatch")
        wf.latest_gap_run_id = req.gap_run_id
        updated = True
        print(f"[PATCH /v1/workflow/{workflow_id}] Updated latest_gap_run_id to {req.gap_run_id}")
    if req.sql_run_id is not None:
        wf.latest_sql_run_id = req.sql_run_id
        updated = True
    if req.xml_validation_run_id is not None:
        wf.latest_xml_validation_run_id = req.xml_validation_run_id
        updated = True
    if req.ba_gap_waivers_json is not None:
        wf.ba_gap_waivers_json = req.ba_gap_waivers_json
        updated = True
        db.add(
            add_workflow_history(
                workflow_id=wf.id,
                project_id=wf.project_id,
                from_stage=wf.current_stage,
                to_stage=wf.current_stage,
                action="ba_gap_waivers_updated",
                actor=req.actor or "ba.user",
                comment=req.comment or "Updated BA gap waivers",
                details_json={"ba_gap_waivers_json": req.ba_gap_waivers_json},
            )
        )
    
    if updated:
        db.commit()
        db.refresh(wf)
        print(f"[PATCH /v1/workflow/{workflow_id}] Committed changes. Workflow.latest_gap_run_id now: {wf.latest_gap_run_id}")
    
    return {"ok": True, "workflow": serialize_workflow(wf)}


@router.get("/v1/workflows/{workflow_id}", response_model=WorkflowDetailResponse)
def get_workflow(workflow_id: int, db: Session = Depends(get_db)):
    """Return workflow."""
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    history = (
        db.query(WorkflowStageHistory)
        .filter(WorkflowStageHistory.workflow_id == wf.id)
        .order_by(WorkflowStageHistory.id.desc())
        .limit(50)
        .all()
    )
    return {
        "workflow": serialize_workflow(wf),
        "history": [
            {
                "id": h.id,
                "from_stage": h.from_stage,
                "to_stage": h.to_stage,
                "action": h.action,
                "actor": h.actor,
                "comment": h.comment,
                "details_json": h.details_json,
                "created_at": h.created_at.isoformat() if h.created_at else None,
            }
            for h in history
        ],
    }


@router.get("/v1/workflows/{workflow_id}/quality-summary", response_model=WorkflowQualitySummaryResponse)
def get_workflow_quality_summary(
    workflow_id: int,
    persona: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Return workflow quality summary."""
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")

    gate = evaluate_stage_exit_gate(db, wf, settings.min_review_coverage_score)
    latest_history = (
        db.query(WorkflowStageHistory)
        .filter(WorkflowStageHistory.workflow_id == wf.id)
        .order_by(WorkflowStageHistory.id.desc())
        .first()
    )
    pending_for_me = workflow_pending_for(wf, persona) if persona else False
    open_issues_count = 0 if gate.passed else quality_open_issue_count(gate.metrics)
    gate_payload = gate.as_dict()
    gate_payload["pass"] = bool(gate_payload.get("passed"))
    return {
        "workflow_id": wf.id,
        "stage": wf.current_stage,
        "pending_for_me": pending_for_me,
        "exit_gate_status": gate_payload,
        "open_issues_count": open_issues_count,
        "last_action_at": latest_history.created_at.isoformat() if latest_history and latest_history.created_at else None,
        "last_action_by": latest_history.actor if latest_history else None,
    }


@router.post("/v1/workflows/{workflow_id}/submit", response_model=WorkflowResponseEnvelope)
def submit_workflow_stage(workflow_id: int, req: WorkflowTransitionRequest, db: Session = Depends(get_db)):
    """Submit workflow stage."""
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    wf = service_submit_workflow_stage(
        db,
        wf,
        actor=req.actor,
        comment=req.comment,
        min_review_coverage_score=settings.min_review_coverage_score,
    )
    return {"ok": True, "workflow": serialize_workflow(wf)}


@router.post("/v1/workflows/{workflow_id}/send-back", response_model=WorkflowResponseEnvelope)
def send_back_workflow_stage(workflow_id: int, req: WorkflowTransitionRequest, db: Session = Depends(get_db)):
    """Send back workflow stage."""
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    wf = service_send_back_workflow_stage(
        db,
        wf,
        actor=req.actor,
        target_stage=req.target_stage,
        reason_code=req.reason_code,
        reason_detail=req.reason_detail,
        comment=req.comment,
    )
    return {"ok": True, "workflow": serialize_workflow(wf)}


@router.post("/v1/workflows/{workflow_id}/functional-spec", response_model=WorkflowResponseEnvelope)
def finalize_functional_spec(workflow_id: int, req: WorkflowFinalizeSpecRequest, db: Session = Depends(get_db)):
    """Persist the workflow's latest BA output as a downloadable functional specification."""
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    if wf.current_stage != "BA":
        raise HTTPException(status_code=422, detail="workflow_not_in_ba_stage")

    run = (
        db.query(AnalysisRun)
        .filter(AnalysisRun.id == req.gap_run_id, AnalysisRun.project_id == wf.project_id, AnalysisRun.run_type == "gap_analysis")
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="gap_run_not_found")
    ensure_gap_run_is_current_for_workflow(wf, run)

    rows = (run.output_json or {}).get("rows") or []
    try:
        fmt = validate_store_format(req.store_format)
    except ValueError:
        raise HTTPException(status_code=422, detail="invalid_store_format")
    filename, full_path, content_type = write_functional_spec_file(ARTIFACT_ROOT, wf.project_id, wf.id, wf.name, rows, run.id, fmt)
    artifact = build_functional_spec_artifact(
        project_id=wf.project_id,
        filename=filename,
        file_path=full_path,
        content_type=content_type,
        rows=rows,
        gap_run_id=run.id,
        workflow_name=wf.name,
        workflow_id=wf.id,
    )
    db.add(artifact)
    db.commit()
    db.refresh(artifact)

    wf.latest_gap_run_id = run.id
    wf.functional_spec_artifact_id = artifact.id
    db.add(
        add_workflow_history(
            workflow_id=wf.id,
            project_id=wf.project_id,
            from_stage="BA",
            to_stage="BA",
            action="functional_spec_saved",
            actor=req.actor,
            comment=f"Stored functional spec ({fmt}) artifact_id={artifact.id}",
        )
    )

    if req.auto_advance:
        wf.current_stage = "DEV"
        wf.current_assignee = wf.assigned_dev
        db.add(
            add_workflow_history(
                workflow_id=wf.id,
                project_id=wf.project_id,
                from_stage="BA",
                to_stage="DEV",
                action="submit",
                actor=req.actor,
                comment="Auto advanced after functional spec save",
            )
        )
    db.commit()
    db.refresh(wf)
    log_workflow_action(
        db,
        workflow_id=wf.id,
        project_id=wf.project_id,
        action_type="functional_spec_saved",
        action_category="BA",
        actor=req.actor,
        description=f"Stored functional spec artifact {artifact.id} ({fmt})",
        status="success",
        stage="BA",
        details=workflow_action_log_details(
            source_type="functional_spec_artifact",
            source_id=artifact.id,
            format=fmt,
            artifact=artifact,
            run=run,
            extra={"auto_advance": req.auto_advance},
        ),
    )
    db.commit()
    db.refresh(wf)
    return {"ok": True, "workflow": serialize_workflow(wf), "functional_spec_artifact_id": artifact.id}


@router.get("/v1/workflows/{workflow_id}/functional-spec/download")
def download_functional_spec(workflow_id: int, format: str = Query("json"), db: Session = Depends(get_db)):
    """Download functional spec."""
    wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    if not wf.functional_spec_artifact_id:
        raise HTTPException(status_code=404, detail="functional_spec_not_found")

    art = db.query(Artifact).filter(Artifact.id == wf.functional_spec_artifact_id, Artifact.is_deleted.is_(False)).first()
    if not art:
        raise HTTPException(status_code=404, detail="artifact_not_found")

    rows = (art.extracted_json or {}).get("rows") or []
    fmt = str(format or "json").strip().lower()
    try:
        fmt = validate_store_format(fmt)
    except ValueError:
        raise HTTPException(status_code=422, detail="invalid_store_format")
    log_workflow_action(
        db,
        workflow_id=wf.id,
        project_id=wf.project_id,
        action_type="functional_spec_download",
        action_category="BA",
        actor="user",
        description=f"Downloaded functional spec ({fmt})",
        status="success",
        stage="BA",
        details=workflow_action_log_details(
            source_type="functional_spec_artifact",
            source_id=art.id,
            format=fmt,
            artifact=art,
        ),
    )
    db.commit()
    payload, media_type = functional_spec_download_payload(rows, fmt)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    safe_name = "".join(ch if ch.isalnum() else "_" for ch in (wf.name or "workflow")).strip("_").lower() or "workflow"
    return StreamingResponse(
        iter([payload]),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename=functional_spec_{safe_name}_wf_{wf.id}_{stamp}.{fmt}"},
    )
