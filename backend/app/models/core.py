from sqlalchemy import JSON, Boolean, Column, DateTime, Integer, String, Text, func

from app.db import Base


class RagChunk(Base):
    __tablename__ = "rag_chunks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String(100), index=True, nullable=False)
    source_ref = Column(String(255), nullable=False)
    chunk_text = Column(Text, nullable=False)
    chunk_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Artifact(Base):
    __tablename__ = "artifacts"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String(100), index=True, nullable=False)
    kind = Column(String(50), index=True, nullable=False)
    filename = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=True)
    content_type = Column(String(100), nullable=True)
    file_path = Column(Text, nullable=False)
    extracted_text = Column(Text, nullable=True)
    extracted_json = Column(JSON, nullable=True)
    is_deleted = Column(Boolean, nullable=False, server_default="false")
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    deleted_by = Column(String(120), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String(100), index=True, nullable=False)
    run_type = Column(String(50), index=True, nullable=False)
    status = Column(String(30), index=True, nullable=False, default="completed")
    input_json = Column(JSON, nullable=True)
    output_json = Column(JSON, nullable=True)
    output_artifact_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AgentInstruction(Base):
    __tablename__ = "agent_instructions"

    id = Column(Integer, primary_key=True, index=True)
    agent_key = Column(String(80), index=True, nullable=False)
    version = Column(Integer, nullable=False)
    instruction = Column(Text, nullable=False)
    updated_by = Column(String(120), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(80), index=True, nullable=False)
    target_type = Column(String(80), index=True, nullable=False)
    target_id = Column(String(120), nullable=True)
    project_id = Column(String(100), index=True, nullable=True)
    actor = Column(String(120), nullable=True)
    details_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String(100), index=True, nullable=False)
    name = Column(String(255), nullable=False)
    psd_version = Column(String(80), nullable=True)
    workflow_type = Column(String(80), nullable=True)
    description = Column(Text, nullable=True)
    version = Column(String(80), nullable=True)
    current_stage = Column(String(40), index=True, nullable=False, default="BA")
    status = Column(String(40), index=True, nullable=False, default="in_progress")
    stage_status = Column(String(40), nullable=True)
    assigned_ba = Column(String(120), nullable=True)
    assigned_dev = Column(String(120), nullable=True)
    assigned_reviewer = Column(String(120), nullable=True)
    current_assignee = Column(String(120), nullable=True)
    started_by = Column(String(120), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default="true")
    parent_workflow_id = Column(Integer, nullable=True)
    latest_gap_run_id = Column(Integer, nullable=True)
    latest_sql_run_id = Column(Integer, nullable=True)
    latest_xml_run_id = Column(Integer, nullable=True)
    latest_report_xml_artifact_id = Column(Integer, nullable=True)
    functional_spec_artifact_id = Column(Integer, nullable=True)
    ba_gap_waivers_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class WorkflowStageHistory(Base):
    __tablename__ = "workflow_stage_history"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, index=True, nullable=False)
    project_id = Column(String(100), index=True, nullable=False)
    from_stage = Column(String(40), nullable=True)
    to_stage = Column(String(40), nullable=False)
    action = Column(String(40), index=True, nullable=False)
    actor = Column(String(120), nullable=True)
    comment = Column(Text, nullable=True)
    details_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
