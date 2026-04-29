import json

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.constants import WORKFLOW_SEND_BACK_REASON_CODES
from app.models import Workflow
from app.services.logging_service import log_workflow_action
from app.services.workflow_gates import evaluate_stage_exit_gate
from app.services.workflow_history_service import add_workflow_history

VALID_PERSONAS = {"BA", "DEV", "REVIEWER"}
STAGE_NEXT = {"BA": "DEV", "DEV": "REVIEWER", "REVIEWER": "COMPLETED"}
STAGE_PREV = {"DEV": "BA", "REVIEWER": "DEV"}
ROLE_STAGE = {"BA": "BA", "DEV": "DEV", "REVIEWER": "REVIEWER"}


def normalize_persona(persona: str) -> str:
    """Validate and normalize a workflow persona label used by API calls and UI filters."""
    role = str(persona or "").strip().upper()
    if role not in VALID_PERSONAS:
        raise HTTPException(status_code=422, detail="invalid_persona")
    return role


def workflow_pending_for(workflow: Workflow, persona: str) -> bool:
    """Return whether the workflow currently expects action from the supplied persona."""
    role = normalize_persona(persona)
    return workflow.current_stage == ROLE_STAGE[role] and workflow.status == "in_progress"


def workflow_assignee(workflow: Workflow, stage: str) -> str | None:
    """Resolve the assignee field that owns a given workflow stage."""
    if stage == "BA":
        return workflow.assigned_ba
    if stage == "DEV":
        return workflow.assigned_dev
    if stage == "REVIEWER":
        return workflow.assigned_reviewer
    return None


def workflow_display_id(workflow: Workflow) -> str:
    """Create the stable user-facing workflow identifier shown across the UI and logs."""
    year = workflow.created_at.year if workflow.created_at else 0
    return f"WF-{year:04d}-{int(workflow.id):06d}"


def serialize_workflow(workflow: Workflow, persona: str | None = None) -> dict:
    """Convert ORM workflow state into the frontend/API contract, including persona-specific flags."""
    pending = False
    if persona:
        pending = workflow_pending_for(workflow, persona)
    return {
        "id": workflow.id,
        "display_id": workflow_display_id(workflow),
        "project_id": workflow.project_id,
        "name": workflow.name,
        "workflow_name": workflow.name,
        "workflow_type": getattr(workflow, "workflow_type", None) or "Complete",
        "description": getattr(workflow, "description", None),
        "version": getattr(workflow, "version", None) or workflow.psd_version or "1.0",
        "psd_version": workflow.psd_version,
        "current_stage": workflow.current_stage,
        "status": workflow.status,
        "stage_status": getattr(workflow, "stage_status", None) or ("completed" if workflow.status == "completed" else "in_progress"),
        "assigned_ba": workflow.assigned_ba,
        "assigned_dev": workflow.assigned_dev,
        "assigned_reviewer": workflow.assigned_reviewer,
        "current_assignee": workflow.current_assignee,
        "started_by": workflow.started_by,
        "parent_workflow_id": workflow.parent_workflow_id,
        "latest_gap_run_id": workflow.latest_gap_run_id,
        "latest_sql_run_id": workflow.latest_sql_run_id,
        "latest_xml_run_id": workflow.latest_xml_run_id,
        "latest_report_xml_artifact_id": workflow.latest_report_xml_artifact_id,
        "functional_spec_artifact_id": workflow.functional_spec_artifact_id,
        "ba_gap_waivers_json": workflow.ba_gap_waivers_json,
        "pending_for_me": pending,
        "created_at": workflow.created_at.isoformat() if workflow.created_at else None,
        "updated_at": workflow.updated_at.isoformat() if workflow.updated_at else None,
    }


def quality_open_issue_count(metrics: dict | None) -> int:
    """Collapse gate metrics into a simple outstanding-issue count for the workflow home cards."""
    payload = metrics or {}
    if payload.get("degraded_quality") is True:
        return max(int(payload.get("llm_error_batches") or 0) + int(payload.get("fallback_batches") or 0), 1)
    for key in ("unresolved_missing_rows", "open_issues_count"):
        value = payload.get(key)
        try:
            return max(int(value), 0)
        except Exception:
            continue
    if payload.get("xsd_pass") is False:
        return 1
    if payload.get("rule_pass") is False:
        return 1
    if payload.get("schema_validation_status") not in (None, "", "passed"):
        return 1
    return 0


def submit_workflow_stage(
    db: Session,
    workflow: Workflow,
    *,
    actor: str,
    comment: str | None,
    min_review_coverage_score: int,
) -> Workflow:
    """Advance a workflow to the next stage after verifying the configured exit gate."""
    if workflow.status != "in_progress":
        raise HTTPException(status_code=422, detail="workflow_not_in_progress")

    current = workflow.current_stage
    next_stage = STAGE_NEXT.get(current)
    if not next_stage:
        raise HTTPException(status_code=422, detail="invalid_current_stage")

    gate = evaluate_stage_exit_gate(db, workflow, min_review_coverage_score)
    if not gate.passed:
        raise HTTPException(status_code=422, detail=gate.as_dict())

    workflow.current_stage = next_stage
    if next_stage == "COMPLETED":
        workflow.status = "completed"
        workflow.stage_status = "completed"
        workflow.is_active = False
        workflow.current_assignee = None
    else:
        workflow.stage_status = "in_progress"
        workflow.current_assignee = workflow_assignee(workflow, next_stage)

    db.add(
        add_workflow_history(
            workflow_id=workflow.id,
            project_id=workflow.project_id,
            from_stage=current,
            to_stage=next_stage,
            action="submit",
            actor=actor,
            comment=comment,
        )
    )
    
    # Log the action
    log_workflow_action(
        db,
        workflow_id=workflow.id,
        project_id=workflow.project_id,
        action_type="submit_stage",
        action_category=current,
        description=f"Stage submitted: {current} -> {next_stage}",
        actor=actor,
        status="success",
        stage=current,
        details={
            "from_stage": current,
            "to_stage": next_stage,
            "comment": comment,
            "gate_passed": True,
        },
    )
    
    db.commit()
    db.refresh(workflow)
    return workflow


def send_back_workflow_stage(
    db: Session,
    workflow: Workflow,
    *,
    actor: str,
    target_stage: str | None,
    reason_code: str | None,
    reason_detail: str | None,
    comment: str | None,
) -> Workflow:
    """Move a workflow back to BA or DEV with a mandatory structured send-back reason."""
    if workflow.status != "in_progress":
        raise HTTPException(status_code=422, detail="workflow_not_in_progress")

    current = workflow.current_stage
    fallback_stage = STAGE_PREV.get(current)
    target = str(target_stage or fallback_stage or "").strip().upper()
    if target not in {"BA", "DEV"}:
        raise HTTPException(status_code=422, detail="invalid_target_stage")

    reason_code_value = str(reason_code or "").strip().upper()
    reason_detail_value = str(reason_detail or "").strip()
    if not reason_code_value:
        raise HTTPException(status_code=422, detail="send_back_reason_code_required")
    if reason_code_value not in WORKFLOW_SEND_BACK_REASON_CODES:
        raise HTTPException(status_code=422, detail="invalid_send_back_reason_code")
    if len(reason_detail_value) < 10:
        raise HTTPException(status_code=422, detail="send_back_reason_detail_too_short")

    workflow.current_stage = target
    workflow.stage_status = "in_progress"
    workflow.current_assignee = workflow_assignee(workflow, target)
    detail_payload = {
        "reason_code": reason_code_value,
        "reason_detail": reason_detail_value,
        "comment": (comment or "").strip() or None,
    }
    db.add(
        add_workflow_history(
            workflow_id=workflow.id,
            project_id=workflow.project_id,
            from_stage=current,
            to_stage=target,
            action="send_back",
            actor=actor,
            comment="Stage sent back",
            details_json=detail_payload,
        )
    )
    
    # Log the action
    log_workflow_action(
        db,
        workflow_id=workflow.id,
        project_id=workflow.project_id,
        action_type="send_back",
        action_category=current,
        description=f"Stage sent back: {current} -> {target}. Reason: {reason_code_value}",
        actor=actor,
        status="success",
        stage=current,
        details=detail_payload,
    )
    
    db.commit()
    db.refresh(workflow)
    return workflow


def create_workflow_version_comment(
    source_workflow_id: int,
    reuse_latest_gap_run: bool,
    reuse_functional_spec: bool,
    clone_unresolved_only: bool,
    unresolved_refs_count: int,
) -> str:
    """Persist machine-readable provenance when a new workflow version is spawned."""
    return json.dumps(
        {
            "message": f"Created from workflow {source_workflow_id}",
            "reuse_latest_gap_run": reuse_latest_gap_run,
            "reuse_functional_spec": reuse_functional_spec,
            "clone_unresolved_only": clone_unresolved_only,
            "unresolved_refs_count": unresolved_refs_count,
        }
    )
