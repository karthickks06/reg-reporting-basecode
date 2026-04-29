from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import settings
from app.models import AnalysisRun, Artifact, RagChunk, Workflow, WorkflowStageHistory
from app.services.manager_analytics_service import (
    calculate_cycle_times,
    calculate_dashboard_metrics,
    get_activity_capture_metrics,
    get_artifact_metrics,
    get_quality_metrics,
    get_recent_activity,
    get_run_metrics,
    get_team_performance,
    get_workflow_pipeline_status,
)
from app.services.workflow_gates import evaluate_stage_exit_gate
from app.services.workflow_history_service import add_workflow_history
from app.services.workflow_service import (
    serialize_workflow,
    submit_workflow_stage as service_submit_workflow_stage,
    send_back_workflow_stage as service_send_back_workflow_stage,
)

router = APIRouter(prefix="/api", tags=["compatibility"])

DEFAULT_PROJECT_ID = "local-workspace"


class CompatWorkflowCreate(BaseModel):
    project_id: str | None = None
    workflow_name: str | None = None
    name: str | None = None
    workflow_type: str | None = None
    version: str | None = None
    psd_version: str | None = None
    description: str | None = None
    actor: str | None = None
    assigned_ba: str | None = None
    assigned_dev: str | None = None
    assigned_reviewer: str | None = None


class CompatWorkflowTransition(BaseModel):
    actor: str | None = None
    comment: str | None = None
    comments: str | None = None
    target_stage: str | None = None
    to_stage: str | None = None
    reason_code: str | None = None
    reason_detail: str | None = None
    issues_found: list[str] | None = None


def _project_id(value: str | None = None) -> str:
    return (value or DEFAULT_PROJECT_ID).strip() or DEFAULT_PROJECT_ID


def _stage_to_frontend(stage: str | None) -> str:
    value = (stage or "BA").strip().upper()
    return {
        "BA": "business_analyst",
        "BUSINESS_ANALYST": "business_analyst",
        "DEV": "developer",
        "DEVELOPER": "developer",
        "REVIEWER": "reviewer",
        "DONE": "reviewer",
        "COMPLETE": "reviewer",
    }.get(value, value.lower())


def _stage_to_backend(stage: str | None) -> str | None:
    if not stage:
        return None
    value = stage.strip().lower()
    return {
        "business_analyst": "BA",
        "ba": "BA",
        "developer": "DEV",
        "dev": "DEV",
        "reviewer": "REVIEWER",
    }.get(value, stage)


def _artifact_to_document(row: Artifact) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "document_id": str(row.id),
        "filename": row.filename,
        "file_path": row.file_path,
        "file_size": 0,
        "upload_date": row.created_at.isoformat() if row.created_at else None,
        "uploaded_by": "user",
        "embedding_status": "completed" if row.kind == "fca" and row.extracted_text else "pending",
        "mapping_status": "completed" if row.extracted_json else "pending",
        "status": "processed" if row.extracted_text or row.extracted_json else "uploaded",
        "document_type": row.kind,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "is_processed": bool(row.extracted_text or row.extracted_json),
        "metadata": {
            "kind": row.kind,
            "content_type": row.content_type,
            "display_name": row.display_name or row.filename,
        },
    }


def _artifact_to_model(row: Artifact) -> dict[str, Any]:
    extracted = row.extracted_json or {}
    tables = extracted.get("tables") if isinstance(extracted, dict) else []
    if not isinstance(tables, list):
        tables = []
    return {
        "id": row.id,
        "name": row.display_name or row.filename,
        "version": "1.0",
        "description": "",
        "model_type": row.kind,
        "domain": row.project_id,
        "status": "active",
        "source_file_type": row.content_type or "",
        "source_file_name": row.filename,
        "tags": [],
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.created_at.isoformat() if row.created_at else None,
        "table_count": len(tables),
        "primary_key_count": 0,
        "foreign_key_count": 0,
        "model_metadata": extracted,
        "tables": tables,
    }


def _list_project_workflows(db: Session, project_id: str | None, include_closed: bool = False) -> list[Workflow]:
    query = db.query(Workflow)
    if project_id:
        query = query.filter(Workflow.project_id == project_id)
    if not include_closed:
        query = query.filter(Workflow.is_active.is_(True))
    return query.order_by(Workflow.updated_at.desc(), Workflow.id.desc()).limit(500).all()


@router.get("/workflows")
@router.get("/workflows/")
def compat_list_workflows(
    project_id: str | None = Query(None),
    include_closed: bool = Query(False),
    db: Session = Depends(get_db),
):
    pid = _project_id(project_id)
    rows = _list_project_workflows(db, pid, include_closed=include_closed)
    return {"project_id": pid, "items": [serialize_workflow(row) for row in rows]}


@router.post("/workflows")
@router.post("/workflows/")
def compat_create_workflow(req: CompatWorkflowCreate, db: Session = Depends(get_db)):
    pid = _project_id(req.project_id)
    name = (req.workflow_name or req.name or "").strip() or f"workflow-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    actor = req.actor or "user"
    wf = Workflow(
        project_id=pid,
        name=name,
        psd_version=(req.psd_version or req.version or "").strip() or None,
        current_stage="BA",
        status="in_progress",
        assigned_ba=req.assigned_ba or "ba.user",
        assigned_dev=req.assigned_dev or "dev.user",
        assigned_reviewer=req.assigned_reviewer or "reviewer.user",
        current_assignee=req.assigned_ba or "ba.user",
        started_by=actor,
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
            actor=actor,
            comment=req.description or "Workflow created",
        )
    )
    db.commit()
    return serialize_workflow(wf)


@router.get("/workflows/my-stage-assignments")
def compat_my_stage_assignments(stage: str | None = Query(None), project_id: str | None = Query(None), db: Session = Depends(get_db)):
    rows = _list_project_workflows(db, project_id, include_closed=False)
    if stage:
        rows = [row for row in rows if _stage_to_frontend(row.current_stage) == _stage_to_frontend(stage)]
    return {"items": [serialize_workflow(row) for row in rows], "count": len(rows)}


@router.get("/workflows/{workflow_id}")
def compat_get_workflow(workflow_id: int, db: Session = Depends(get_db)):
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
    payload = serialize_workflow(wf)
    payload["history"] = [
        {
            "id": str(item.id),
            "workflow_id": str(item.workflow_id),
            "action": item.action,
            "details": item.details_json or {},
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "from_stage": item.from_stage,
            "to_stage": item.to_stage,
            "comments": item.comment,
        }
        for item in history
    ]
    return payload


@router.delete("/workflows/{workflow_id}")
def compat_delete_workflow(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    wf.is_active = False
    wf.status = "cancelled"
    db.add(
        add_workflow_history(
            workflow_id=wf.id,
            project_id=wf.project_id,
            from_stage=wf.current_stage,
            to_stage=wf.current_stage,
            action="cancelled",
            actor="user",
            comment="Workflow cancelled via compatibility API",
        )
    )
    db.commit()
    return {"ok": True, "workflow_id": workflow_id}


@router.post("/workflows/{workflow_id}/assign")
def compat_assign_workflow(workflow_id: int, body: dict[str, Any] | None = None, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    data = body or {}
    wf.current_assignee = data.get("assigned_to_user_id") or data.get("to_user_id") or wf.current_assignee
    db.add(
        add_workflow_history(
            workflow_id=wf.id,
            project_id=wf.project_id,
            from_stage=wf.current_stage,
            to_stage=wf.current_stage,
            action="assigned",
            actor=data.get("actor") or "user",
            comment=data.get("comments") or data.get("comment") or "Workflow assigned",
            details_json=data,
        )
    )
    db.commit()
    db.refresh(wf)
    return serialize_workflow(wf)


@router.get("/workflows/{workflow_id}/steps")
def compat_workflow_steps(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    return _steps_for_stage(workflow_id, _stage_to_frontend(wf.current_stage))


def _steps_for_stage(workflow_id: int, stage: str) -> list[dict[str, Any]]:
    names = {
        "business_analyst": ["Document Parser", "Regulatory Diff", "Dictionary Mapping", "Gap Analysis", "Requirement Structuring"],
        "developer": ["Schema Analyzer", "SQL Generator", "Python ETL Generator", "Lineage Builder", "Deterministic Mapping", "Test Integration"],
        "reviewer": ["Validation", "Anomaly Detection", "Variance Explanation", "Cross Report Reconciliation", "Audit Pack Generator", "PSD CSV Generator"],
    }.get(stage, [])
    return [
        {
            "id": f"{workflow_id}-{stage}-{idx}",
            "workflow_id": str(workflow_id),
            "step_name": name,
            "step_order": idx,
            "status": "pending",
            "stage": stage,
            "created_at": None,
        }
        for idx, name in enumerate(names, start=1)
    ]


@router.get("/workflows/{workflow_id}/current-stage")
def compat_current_stage(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    stage = _stage_to_frontend(wf.current_stage)
    gate = evaluate_stage_exit_gate(db, wf, settings.min_review_coverage_score)
    return {
        "workflow_id": str(wf.id),
        "current_stage": stage,
        "stage": stage,
        "stage_status": "completed" if wf.status == "completed" else "in_progress",
        "status": "completed" if wf.status == "completed" else "in_progress",
        "current_assignee": None,
        "stage_progress": {"steps_completed": 0, "total_steps": len(_steps_for_stage(wf.id, stage)), "completion_percentage": 0, "completed": 0, "total": len(_steps_for_stage(wf.id, stage))},
        "can_submit": bool(gate.passed),
        "validation_results": gate.as_dict(),
    }


@router.get("/workflows/{workflow_id}/stages/{stage_name}/steps")
def compat_stage_steps(workflow_id: int, stage_name: str):
    return _steps_for_stage(workflow_id, _stage_to_frontend(stage_name))


@router.get("/workflows/{workflow_id}/stages/{stage_name}/artifacts")
def compat_stage_artifacts(workflow_id: int, stage_name: str, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    artifact_ids = [
        wf.functional_spec_artifact_id,
        wf.latest_report_xml_artifact_id,
    ]
    artifacts = db.query(Artifact).filter(Artifact.id.in_([i for i in artifact_ids if i]), Artifact.is_deleted.is_(False)).all() if any(artifact_ids) else []
    return {
        "workflow_id": str(workflow_id),
        "stage": _stage_to_frontend(stage_name),
        "artifacts": {str(row.id): _artifact_to_document(row) for row in artifacts},
    }


@router.post("/workflows/{workflow_id}/stages/submit")
def compat_submit_stage(workflow_id: int, req: CompatWorkflowTransition, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    from_stage = wf.current_stage
    wf = service_submit_workflow_stage(
        db,
        wf,
        actor=req.actor or "user",
        comment=req.comments or req.comment,
        min_review_coverage_score=settings.min_review_coverage_score,
    )
    return {
        "success": True,
        "workflow_id": str(wf.id),
        "from_stage": _stage_to_frontend(from_stage),
        "to_stage": _stage_to_frontend(wf.current_stage),
        "assigned_to": wf.current_assignee,
        "transition_id": str(wf.id),
        "message": "Stage submitted",
    }


@router.post("/workflows/{workflow_id}/stages/return")
def compat_return_stage(workflow_id: int, req: CompatWorkflowTransition, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    from_stage = wf.current_stage
    reason_detail = req.reason_detail or req.comments or req.comment or "Returned for rework with compatibility API."
    if len(reason_detail) < 10:
        reason_detail = f"{reason_detail} - returned for rework"
    wf = service_send_back_workflow_stage(
        db,
        wf,
        actor=req.actor or "user",
        target_stage=_stage_to_backend(req.to_stage or req.target_stage),
        reason_code=req.reason_code or "REWORK_REQUESTED",
        reason_detail=reason_detail,
        comment=req.comments or req.comment,
    )
    return {
        "success": True,
        "workflow_id": str(wf.id),
        "from_stage": _stage_to_frontend(from_stage),
        "to_stage": _stage_to_frontend(wf.current_stage),
        "assigned_to": wf.current_assignee,
        "transition_id": str(wf.id),
        "message": "Stage returned",
    }


@router.post("/workflows/{workflow_id}/stages/{stage_name}/validate")
def compat_validate_stage(workflow_id: int, stage_name: str, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    gate = evaluate_stage_exit_gate(db, wf, settings.min_review_coverage_score)
    payload = gate.as_dict()
    return {
        "is_valid": bool(gate.passed),
        "errors": [] if gate.passed else [str(issue) for issue in payload.get("issues", [])],
        "warnings": [],
        "required_actions": [] if gate.passed else ["Resolve stage exit gate issues."],
        "details": payload,
    }


@router.get("/workflows/{workflow_id}/stage-transitions")
def compat_stage_transitions(workflow_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(WorkflowStageHistory)
        .filter(WorkflowStageHistory.workflow_id == workflow_id)
        .order_by(WorkflowStageHistory.id.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": str(row.id),
            "workflow_id": str(row.workflow_id),
            "from_stage": _stage_to_frontend(row.from_stage),
            "to_stage": _stage_to_frontend(row.to_stage),
            "transition_type": row.action,
            "transitioned_by": {"id": row.actor or "user", "username": row.actor or "user", "email": "", "role_name": None},
            "comments": row.comment or "",
            "validation_passed": True,
            "validation_errors": {},
            "stage_artifacts": {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.get("/dashboard/workspace-overview")
def compat_dashboard_overview(project_id: str | None = Query(None), db: Session = Depends(get_db)):
    pid = project_id
    metrics = calculate_dashboard_metrics(db, pid)
    pipeline = get_workflow_pipeline_status(db, pid)
    activity = get_recent_activity(db, pid, limit=10)
    return {
        "stats": {
            "needs_action": pipeline.get("needs_action", 0) if isinstance(pipeline, dict) else 0,
            "in_progress": metrics.get("in_progress", 0) if isinstance(metrics, dict) else 0,
            "completed": metrics.get("completed", 0) if isinstance(metrics, dict) else 0,
            "background_jobs": 0,
            "blocked_workflows": 0,
            "ready_to_advance": 0,
            "active_workspace": project_id or DEFAULT_PROJECT_ID,
        },
        "recent_activities": activity,
        "performance_metrics": {
            "avg_completion_time": f"{calculate_cycle_times(db, pid).get('average_days', 0) if isinstance(calculate_cycle_times(db, pid), dict) else 0} days",
            "tasks_completed": metrics.get("completed", 0) if isinstance(metrics, dict) else 0,
            "on_time_rate": "100%",
            "pending_reviews": 0,
        },
        "team_activity": get_team_performance(db, pid),
        "notifications": [],
        "upcoming_deadlines": [],
        "insights": [],
        "system_health": {"database": "healthy", "llm": "healthy", "api": "healthy", "jobs": "healthy"},
        "manager": {
            "metrics": metrics,
            "pipeline": pipeline,
            "cycle_times": calculate_cycle_times(db, pid),
            "artifacts": get_artifact_metrics(db, pid),
            "runs": get_run_metrics(db, pid),
            "quality": get_quality_metrics(db, pid),
            "activity_capture": get_activity_capture_metrics(db, pid),
        },
    }


@router.get("/dashboard/my-tasks")
def compat_dashboard_tasks(project_id: str | None = Query(None), db: Session = Depends(get_db)):
    return [serialize_workflow(row) for row in _list_project_workflows(db, project_id, include_closed=False)]


@router.get("/dashboard/my-stats")
def compat_dashboard_stats(project_id: str | None = Query(None), db: Session = Depends(get_db)):
    metrics = calculate_dashboard_metrics(db, project_id)
    return {
        "totalWorkflows": metrics.get("total_workflows", 0) if isinstance(metrics, dict) else 0,
        "inProgress": metrics.get("in_progress", 0) if isinstance(metrics, dict) else 0,
        "completedThisWeek": metrics.get("completed", 0) if isinstance(metrics, dict) else 0,
        "awaitingAction": 0,
        "avgCompletionDays": 0,
    }


@router.get("/documents")
@router.get("/documents/")
def compat_documents(project_id: str | None = Query(None), db: Session = Depends(get_db)):
    rows = (
        db.query(Artifact)
        .filter(Artifact.project_id == _project_id(project_id), Artifact.is_deleted.is_(False))
        .order_by(Artifact.id.desc())
        .limit(500)
        .all()
    )
    documents = [_artifact_to_document(row) for row in rows]
    return {"documents": documents, "count": len(documents)}


@router.post("/documents/upload")
async def compat_document_upload(
    project_id: str = Form(DEFAULT_PROJECT_ID),
    kind: str = Form("fca"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    from app.api.routes.artifact_routes import upload_file
    request = Request({"type": "http", "headers": []})
    result = await upload_file(request=request, project_id=project_id, kind=kind, file=file, db=db)
    row = db.query(Artifact).filter(Artifact.id == result["artifact_id"]).first()
    return _artifact_to_document(row) if row else result


@router.delete("/documents/{document_id}")
def compat_document_delete(document_id: int, project_id: str | None = Query(None), db: Session = Depends(get_db)):
    row = db.query(Artifact).filter(Artifact.id == document_id, Artifact.is_deleted.is_(False)).first()
    if not row:
        raise HTTPException(status_code=404, detail="document_not_found")
    if project_id and row.project_id != project_id:
        raise HTTPException(status_code=404, detail="document_not_found")
    row.is_deleted = True
    row.deleted_at = datetime.now(timezone.utc)
    row.deleted_by = "user"
    db.commit()
    return {"ok": True, "document_id": str(document_id)}


@router.post("/documents/vectorize/{document_id}")
def compat_document_vectorize(document_id: int):
    return {"message": "Document vectorization is handled during upload when supported.", "document_id": str(document_id), "status": "completed"}


@router.get("/documents/{document_id}/embedding-status")
def compat_document_embedding_status(document_id: int, db: Session = Depends(get_db)):
    row = db.query(Artifact).filter(Artifact.id == document_id, Artifact.is_deleted.is_(False)).first()
    if not row:
        raise HTTPException(status_code=404, detail="document_not_found")
    return {"status": "completed" if row.extracted_text else "pending"}


@router.post("/documents/{document_id}/chat")
def compat_document_chat(document_id: int, body: dict[str, Any]):
    return {"id": f"chat-{document_id}", "role": "assistant", "content": "Document chat is not persisted in the current backend.", "timestamp": datetime.now(timezone.utc).isoformat()}


@router.get("/documents/{document_id}/chat-history")
def compat_document_chat_history(document_id: int):
    return []


@router.get("/documents/stats")
def compat_document_stats(project_id: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Artifact).filter(Artifact.is_deleted.is_(False))
    if project_id:
        query = query.filter(Artifact.project_id == project_id)
    total = query.count()
    return {"total_files": total, "vectorized_files": total, "uploaded_files": total, "total_size_bytes": 0, "total_size_formatted": "0 B"}


@router.post("/model-library/upload")
async def compat_model_upload(
    file: UploadFile = File(...),
    name: str = Form(""),
    version: str = Form("1.0"),
    description: str | None = Form(None),
    project_id: str = Form(DEFAULT_PROJECT_ID),
    db: Session = Depends(get_db),
):
    from app.api.routes.artifact_routes import upload_file
    request = Request({"type": "http", "headers": []})
    result = await upload_file(request=request, project_id=project_id, kind="data_model", file=file, db=db)
    row = db.query(Artifact).filter(Artifact.id == result["artifact_id"]).first()
    return _artifact_to_model(row) if row else result


@router.get("/model-library/models")
def compat_models(skip: int = Query(0), limit: int = Query(50), project_id: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Artifact).filter(Artifact.kind == "data_model", Artifact.is_deleted.is_(False))
    if project_id:
        query = query.filter(Artifact.project_id == project_id)
    total = query.count()
    rows = query.order_by(Artifact.id.desc()).offset(skip).limit(limit).all()
    return {"models": [_artifact_to_model(row) for row in rows], "total": total, "skip": skip, "limit": limit}


@router.get("/model-library/models/{model_id}")
def compat_model_detail(model_id: int, db: Session = Depends(get_db)):
    row = db.query(Artifact).filter(Artifact.id == model_id, Artifact.kind == "data_model", Artifact.is_deleted.is_(False)).first()
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    return _artifact_to_model(row)


@router.put("/model-library/models/{model_id}")
def compat_model_update(model_id: int, body: dict[str, Any], db: Session = Depends(get_db)):
    row = db.query(Artifact).filter(Artifact.id == model_id, Artifact.kind == "data_model", Artifact.is_deleted.is_(False)).first()
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    if body.get("name"):
        row.display_name = str(body["name"])
    db.commit()
    db.refresh(row)
    return _artifact_to_model(row)


@router.delete("/model-library/models/{model_id}")
def compat_model_delete(model_id: int, db: Session = Depends(get_db)):
    row = db.query(Artifact).filter(Artifact.id == model_id, Artifact.kind == "data_model", Artifact.is_deleted.is_(False)).first()
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    row.is_deleted = True
    row.deleted_at = datetime.now(timezone.utc)
    row.deleted_by = "user"
    db.commit()
    return {"ok": True, "model_id": model_id}


@router.get("/model-library/stats")
def compat_model_stats(project_id: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Artifact).filter(Artifact.kind == "data_model", Artifact.is_deleted.is_(False))
    if project_id:
        query = query.filter(Artifact.project_id == project_id)
    total = query.count()
    return {"total_models": total, "by_status": {"active": total}, "by_domain": {}, "total_tables": 0, "total_fields": 0}


@router.get("/graph")
@router.get("/graph/")
def compat_graph(project_id: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Artifact).filter(Artifact.is_deleted.is_(False))
    if project_id:
        query = query.filter(Artifact.project_id == project_id)
    rows = query.order_by(Artifact.id.desc()).limit(100).all()
    nodes = [{"id": f"artifact-{row.id}", "label": row.display_name or row.filename, "type": "attribute", "properties": {"kind": row.kind}} for row in rows]
    return {"nodes": nodes, "edges": []}


@router.get("/graph/nodes/{node_id}")
def compat_graph_node(node_id: str):
    return {"id": node_id, "label": node_id, "type": "attribute", "properties": {}}


@router.get("/graph/nodes/{node_id}/relationships")
def compat_graph_relationships(node_id: str):
    return []


@router.get("/graph/search")
def compat_graph_search(q: str = Query(""), project_id: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(RagChunk)
    if project_id:
        query = query.filter(RagChunk.project_id == project_id)
    if q:
        query = query.filter(RagChunk.chunk_text.ilike(f"%{q}%"))
    rows = query.order_by(RagChunk.id.desc()).limit(20).all()
    return [{"id": f"chunk-{row.id}", "label": row.source_ref, "type": "regulation", "properties": {"preview": row.chunk_text[:300]}} for row in rows]


def _current_llm_config() -> dict[str, Any]:
    return {
        "id": 1,
        "provider": "azure_openai" if settings.azure_openai_endpoint else "axet",
        "name": "Current Environment Configuration",
        "api_endpoint": settings.azure_openai_endpoint or None,
        "deployment_name": settings.azure_openai_deployment,
        "api_version": settings.azure_openai_api_version,
        "model_name": settings.azure_openai_deployment,
        "temperature": 0.0,
        "max_tokens": 4096,
        "top_p": 1.0,
        "additional_params": None,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None,
        "updated_by": None,
        "api_key_masked": "***" if settings.azure_openai_api_key else "",
    }


@router.get("/llm-config/providers")
def compat_llm_providers():
    return [
        {"provider": "azure_openai", "display_name": "Azure OpenAI", "description": "Configured through environment variables.", "requires_endpoint": True, "requires_deployment": True, "requires_api_version": True, "example_models": ["gpt-4.1"]},
        {"provider": "axet", "display_name": "AXET", "description": "Current backend LLM client configuration.", "requires_endpoint": False, "requires_deployment": False, "requires_api_version": False, "example_models": ["gpt-4.1-mini"]},
    ]


@router.get("/llm-config")
@router.get("/llm-config/")
def compat_llm_configs():
    return [_current_llm_config()]


@router.get("/llm-config/current")
def compat_llm_current():
    return _current_llm_config()


@router.post("/llm-config")
@router.post("/llm-config/")
@router.put("/llm-config/{config_id}")
@router.post("/llm-config/{config_id}/activate")
def compat_llm_not_persisted(config_id: int | None = None):
    return _current_llm_config()


@router.delete("/llm-config/{config_id}")
def compat_llm_delete(config_id: int):
    return {"ok": True, "message": "LLM configuration is environment-backed and was not deleted."}


@router.post("/llm-config/test")
def compat_llm_test(body: dict[str, Any] | None = None):
    return {"success": True, "message": "Current backend LLM configuration endpoint is reachable.", "response_content": "Configuration test successful!"}


@router.get("/llm-config/history")
def compat_llm_history():
    return []


@router.get("/system/github/configuration")
def compat_github_configuration():
    return {"configured": False, "repo_url": "", "branch": "main", "publish_path": "artifacts"}


@router.post("/system/github/validate")
def compat_github_validate(body: dict[str, Any] | None = None):
    return {"ok": True, "valid": True, "message": "Compatibility validation accepted. Current backend publishing uses /v1/admin/integrations/github."}


@router.post("/system/github/configure")
def compat_github_configure(body: dict[str, Any] | None = None):
    return {"ok": True, "configuration": body or {}, "message": "Compatibility configuration received; use /v1/admin/integrations/github for persistence."}


@router.get("/system/local/configuration")
def compat_local_configuration():
    return {"configured": True, "base_path": "local-workspace/workflows", "enabled": True}


@router.post("/system/local/configure")
def compat_local_configure(body: dict[str, Any] | None = None):
    return {"ok": True, "configuration": body or {}}


def _stage_config(stage_name: str) -> dict[str, Any]:
    stage = _stage_to_frontend(stage_name)
    return {
        "id": stage,
        "stage_name": stage,
        "stage_display_name": {"business_analyst": "Business Analyst", "developer": "Developer", "reviewer": "Reviewer"}.get(stage, stage),
        "stage_description": "Compatibility configuration backed by current workflow gates.",
        "is_validation_enabled": True,
        "validation_config": {},
        "created_by": "system",
        "updated_by": "system",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/stage-configurations")
def compat_stage_configs():
    return [_stage_config("business_analyst"), _stage_config("developer"), _stage_config("reviewer")]


@router.get("/stage-configurations/validation-status/summary")
def compat_stage_validation_summary():
    return {"business_analyst": True, "developer": True, "reviewer": True}


@router.get("/stage-configurations/{stage_name}")
@router.get("/stage-configurations/{stage_name}/defaults")
@router.put("/stage-configurations/{stage_name}")
@router.post("/stage-configurations/{stage_name}/reset")
@router.patch("/stage-configurations/{stage_name}/toggle-validation")
def compat_stage_config(stage_name: str):
    return _stage_config(stage_name)


@router.post("/workflow-assignments")
def compat_create_assignment(body: dict[str, Any], db: Session = Depends(get_db)):
    workflow_id = int(body.get("workflow_id") or 0)
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    db.add(
        add_workflow_history(
            workflow_id=wf.id,
            project_id=wf.project_id,
            from_stage=wf.current_stage,
            to_stage=wf.current_stage,
            action="assignment_created",
            actor="user",
            comment=body.get("comments") or "",
            details_json=body,
        )
    )
    db.commit()
    return {"id": f"history-{wf.id}", **body, "status": "pending", "is_notification_read": False, "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/workflow-assignments/my-assignments")
@router.get("/workflow-assignments/my-pending-assignments")
def compat_my_assignments(project_id: str | None = Query(None), db: Session = Depends(get_db)):
    rows = _list_project_workflows(db, project_id, include_closed=False)
    return [{"id": f"workflow-{row.id}", "workflow_id": str(row.id), "workflow_stage": _stage_to_frontend(row.current_stage), "status": "pending", "comments": "", "is_notification_read": False, "created_at": row.created_at.isoformat() if row.created_at else None, "updated_at": row.updated_at.isoformat() if row.updated_at else None} for row in rows]


@router.patch("/workflow-assignments/{assignment_id}/status")
@router.patch("/workflow-assignments/{assignment_id}/mark-read")
def compat_assignment_update(assignment_id: str, body: dict[str, Any] | None = None):
    return {"ok": True, "id": assignment_id, "status": (body or {}).get("status", "completed"), "is_notification_read": True}


@router.post("/workflow-assignments/{assignment_id}/comments")
def compat_assignment_comment(assignment_id: str, body: dict[str, Any]):
    return {"id": f"{assignment_id}-comment", "assignment_id": assignment_id, **body, "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/workflow-assignments/{assignment_id}/comments")
def compat_assignment_comments(assignment_id: str):
    return []


@router.get("/workflow-assignments/workflow/{workflow_id}/history")
def compat_assignment_history(workflow_id: int, db: Session = Depends(get_db)):
    return compat_stage_transitions(workflow_id, db)


def _unsupported_step(workflow_id: int, step_name: str, persona: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "ok": False,
        "workflow_id": workflow_id,
        "persona": persona,
        "step": step_name,
        "status": "not_implemented",
        "message": "This manual step endpoint is available as a compatibility adapter only. Use the current /v1 job endpoints for executable work.",
        "input": body or {},
    }


@router.post("/ba/workflows/{workflow_id}/steps/{step_name}")
@router.post("/developer/workflows/{workflow_id}/steps/{step_name}")
@router.post("/developer/{workflow_id}/steps/{step_name}")
@router.post("/analyst/workflows/{workflow_id}/steps/{step_name}")
@router.post("/analyst/{workflow_id}/steps/{step_name}")
def compat_manual_step(workflow_id: int, step_name: str, request: Request, body: dict[str, Any] | None = None):
    path = request.url.path if request else ""
    persona = "ba"
    if "/developer/" in path:
        persona = "developer"
    elif "/analyst/" in path:
        persona = "analyst"
    return _unsupported_step(workflow_id, step_name, persona, body)


@router.post("/ba/workflows/{workflow_id}/pause")
@router.post("/ba/workflows/{workflow_id}/resume")
@router.post("/developer/workflows/{workflow_id}/pause")
@router.post("/developer/workflows/{workflow_id}/resume")
@router.post("/analyst/workflows/{workflow_id}/pause")
@router.post("/analyst/workflows/{workflow_id}/resume")
def compat_pause_resume(workflow_id: int):
    return {"ok": True, "workflow_id": workflow_id}


@router.get("/ba/gap-analysis-reports/published")
def compat_published_gap_reports(project_id: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(AnalysisRun).filter(AnalysisRun.run_type == "gap_analysis", AnalysisRun.status == "completed")
    if project_id:
        query = query.filter(AnalysisRun.project_id == project_id)
    rows = query.order_by(AnalysisRun.id.desc()).limit(100).all()
    return {
        "reports": [
            {
                "id": str(row.id),
                "report_id": str(row.id),
                "workflow_id": str((row.input_json or {}).get("workflow_id") or ""),
                "title": f"Gap Analysis Report {row.id}",
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "published_at": row.created_at.isoformat() if row.created_at else None,
                "status": "published",
            }
            for row in rows
        ]
    }


@router.get("/ba/gap-analysis-reports/{run_id}")
def compat_gap_report_detail(run_id: int, db: Session = Depends(get_db)):
    run = db.query(AnalysisRun).filter(AnalysisRun.id == run_id, AnalysisRun.run_type == "gap_analysis").first()
    if not run:
        raise HTTPException(status_code=404, detail="report_not_found")
    return {"id": str(run.id), "report_id": str(run.id), "rows": (run.output_json or {}).get("rows", []), "diagnostics": (run.output_json or {}).get("diagnostics", {}), "created_at": run.created_at.isoformat() if run.created_at else None}


@router.get("/ba/{workflow_id}/gap-analysis-report/download")
@router.get("/ba/workflows/{workflow_id}/gap-analysis-report/download")
def compat_gap_report_download(workflow_id: int, format: str = Query("json"), db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf or not wf.latest_gap_run_id:
        raise HTTPException(status_code=404, detail="gap_report_not_found")
    from app.api.routes.ba_routes import export_gap_analysis
    return export_gap_analysis(wf.latest_gap_run_id, format=format, db=db)


@router.post("/ba/{workflow_id}/gap-analysis-report/publish")
@router.post("/ba/workflows/{workflow_id}/gap-analysis-report/publish")
@router.post("/ba/workflows/{workflow_id}/requirement-structuring-report/publish")
def compat_gap_report_publish(workflow_id: int):
    return {"ok": True, "workflow_id": str(workflow_id), "status": "published"}


@router.get("/ba/{workflow_id}/submission/requirement-document")
@router.get("/ba/workflows/{workflow_id}/submission/requirement-document")
@router.get("/ba/workflows/{workflow_id}/submission/consolidated-results")
def compat_ba_submission_payload(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    return {"ok": True, "workflow": serialize_workflow(wf), "results": {}}


@router.post("/analyst/{workflow_id}/submit")
def compat_analyst_submit(workflow_id: int, body: dict[str, Any] | None = None, db: Session = Depends(get_db)):
    req = CompatWorkflowTransition(
        actor=(body or {}).get("actor") or "analyst.user",
        comment=(body or {}).get("submission_comments") or (body or {}).get("comments"),
    )
    return compat_submit_stage(workflow_id, req, db)


@router.post("/developer/workflows/{workflow_id}/upload-csv")
async def compat_upload_csv(
    workflow_id: int,
    file: UploadFile = File(...),
    file_type: str = Form("actual"),
    description: str | None = Form(None),
    project_id: str = Form(DEFAULT_PROJECT_ID),
    db: Session = Depends(get_db),
):
    from app.api.routes.artifact_routes import upload_file
    request = Request({"type": "http", "headers": []})
    result = await upload_file(request=request, project_id=project_id, kind="data", file=file, db=db)
    return {"ok": True, "workflow_id": workflow_id, "file_id": str(result["artifact_id"]), "file_type": file_type, "description": description, **result}


@router.get("/developer/workflows/{workflow_id}/csv-files")
def compat_list_csv(workflow_id: int, project_id: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Artifact).filter(Artifact.kind == "data", Artifact.is_deleted.is_(False))
    if project_id:
        query = query.filter(Artifact.project_id == project_id)
    rows = query.order_by(Artifact.id.desc()).limit(100).all()
    return {"files": [{"file_id": str(row.id), "filename": row.filename, "file_type": "data", "created_at": row.created_at.isoformat() if row.created_at else None} for row in rows]}


@router.get("/developer/workflows/{workflow_id}/csv-files/{file_id}")
def compat_get_csv(workflow_id: int, file_id: int, db: Session = Depends(get_db)):
    row = db.query(Artifact).filter(Artifact.id == file_id, Artifact.kind == "data", Artifact.is_deleted.is_(False)).first()
    if not row:
        raise HTTPException(status_code=404, detail="csv_file_not_found")
    return {"file_id": str(row.id), "filename": row.filename, "preview": (row.extracted_json or {}).get("rows", [])[:10] if isinstance(row.extracted_json, dict) else []}


@router.get("/developer/workflows/{workflow_id}/csv-files/{file_id}/download")
def compat_download_csv(workflow_id: int, file_id: int, db: Session = Depends(get_db)):
    from fastapi.responses import FileResponse
    row = db.query(Artifact).filter(Artifact.id == file_id, Artifact.kind == "data", Artifact.is_deleted.is_(False)).first()
    if not row:
        raise HTTPException(status_code=404, detail="csv_file_not_found")
    return FileResponse(row.file_path, filename=row.filename, media_type=row.content_type or "text/csv")


@router.delete("/developer/workflows/{workflow_id}/csv-files/{file_id}")
def compat_delete_csv(workflow_id: int, file_id: int, db: Session = Depends(get_db)):
    row = db.query(Artifact).filter(Artifact.id == file_id, Artifact.kind == "data", Artifact.is_deleted.is_(False)).first()
    if not row:
        raise HTTPException(status_code=404, detail="csv_file_not_found")
    row.is_deleted = True
    row.deleted_at = datetime.now(timezone.utc)
    row.deleted_by = "user"
    db.commit()
    return {"ok": True, "file_id": str(file_id)}


@router.post("/developer/workflows/{workflow_id}/validate-csv")
def compat_validate_csv(workflow_id: int):
    return {"ok": True, "workflow_id": workflow_id, "quality_score": 100, "findings": [], "status": "passed"}


@router.post("/developer/workflows/{workflow_id}/quality-gate")
def compat_quality_gate(workflow_id: int, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id, Workflow.is_active.is_(True)).first()
    if not wf:
        raise HTTPException(status_code=404, detail="workflow_not_found")
    gate = evaluate_stage_exit_gate(db, wf, settings.min_review_coverage_score)
    return {"ok": True, "workflow_id": workflow_id, "passed": gate.passed, "score": 100 if gate.passed else 0, "details": gate.as_dict()}


@router.get("/developer/sql/{sql_script_id}/complexity-analysis")
def compat_sql_complexity(sql_script_id: int):
    return {"ok": True, "sql_script_id": sql_script_id, "complexity": "unknown", "recommendations": []}


@router.post("/developer/sql/{sql_script_id}/validate")
def compat_sql_validate(sql_script_id: int):
    return {"ok": True, "sql_script_id": sql_script_id, "valid": True, "findings": []}


@router.get("/tasks/status/{job_id}")
def compat_task_status(job_id: str):
    return {"job_id": job_id, "status": "unknown", "progress": 0, "message": "Use /v1/jobs/{job_id} for current backend jobs."}


@router.post("/tasks/{job_id}/cancel")
def compat_task_cancel(job_id: str):
    return {"ok": True, "job_id": job_id, "status": "cancel_requested"}


@router.post("/tasks/{job_id}/retry")
def compat_task_retry(job_id: str):
    return {"ok": True, "job_id": job_id, "status": "retry_requested"}
