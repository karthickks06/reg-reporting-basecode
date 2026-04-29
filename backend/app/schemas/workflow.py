from typing import Literal

from pydantic import BaseModel, Field


class GapRow(BaseModel):
    ref: str = Field(min_length=1)
    field: str = Field(min_length=1)
    matching_column: str = ""
    status: Literal["Full Match", "Partial Match", "Missing"]
    confidence: float = Field(ge=0.0, le=1.0)
    description: str = Field(min_length=1)
    evidence: str = Field(min_length=1)


class GapRowUpdateRequest(BaseModel):
    workflow_id: int = Field(gt=0)
    ref: str = Field(min_length=1)
    status: Literal["Full Match", "Partial Match", "Missing"]
    matching_column: str = ""
    confidence: float | None = None
    description: str | None = None
    evidence: str | None = None


class WorkflowResponse(BaseModel):
    id: int
    display_id: str
    project_id: str
    name: str
    psd_version: str | None = None
    workflow_type: str | None = None
    workflow_name: str | None = None
    description: str | None = None
    version: str | None = None
    current_stage: str
    status: str
    stage_status: str | None = None
    assigned_ba: str | None = None
    assigned_dev: str | None = None
    assigned_reviewer: str | None = None
    current_assignee: str | None = None
    started_by: str | None = None
    parent_workflow_id: int | None = None
    latest_gap_run_id: int | None = None
    latest_sql_run_id: int | None = None
    latest_xml_run_id: int | None = None
    latest_report_xml_artifact_id: int | None = None
    functional_spec_artifact_id: int | None = None
    ba_gap_waivers_json: dict | None = None
    pending_for_me: bool = False
    created_at: str | None = None
    updated_at: str | None = None


class WorkflowResponseEnvelope(BaseModel):
    ok: bool
    workflow: WorkflowResponse
    source_workflow_id: int | None = None
    functional_spec_artifact_id: int | None = None


class WorkflowListResponse(BaseModel):
    project_id: str
    items: list[WorkflowResponse]


class WorkflowHistoryEntry(BaseModel):
    id: int
    from_stage: str | None = None
    to_stage: str
    action: str
    actor: str | None = None
    comment: str | None = None
    details_json: dict | None = None
    created_at: str | None = None


class WorkflowDetailResponse(BaseModel):
    workflow: WorkflowResponse
    history: list[WorkflowHistoryEntry]


class WorkflowGateStatus(BaseModel):
    passed: bool
    pass_: bool | None = Field(default=None, alias="pass")
    code: str
    message: str
    metrics: dict


class WorkflowQualitySummaryResponse(BaseModel):
    workflow_id: int
    stage: str
    pending_for_me: bool
    exit_gate_status: WorkflowGateStatus
    open_issues_count: int
    last_action_at: str | None = None
    last_action_by: str | None = None
