from pydantic import BaseModel, ConfigDict, Field


class GapAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    project_id: str
    fca_artifact_id: int | None = None
    data_model_artifact_id: int | None = None
    model: str | None = None
    dataset_family: str | None = None
    allow_fallback: bool = False
    user_context: str | None = None
    workflow_id: int | None = None
    min_mapped_coverage_pct: float | None = None
    candidate_top_k: int = 8


class GapRemediationRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    project_id: str
    base_gap_run_id: int
    workflow_id: int | None = None
    model: str | None = None
    allow_fallback: bool = True
    user_context: str | None = None
    include_statuses: list[str] = Field(default_factory=lambda: ["Missing", "Partial Match"])
    supplemental_artifact_ids: list[int] | None = None
    max_rows: int = 80
    candidate_top_k: int = 8


class SqlGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    project_id: str
    gap_run_id: int | None = None
    data_model_artifact_id: int | None = None
    extra_requirements_artifact_id: int | None = None
    model: str | None = None
    user_context: str | None = None
    workflow_id: int | None = None


class XmlGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    project_id: str
    data_artifact_id: int | None = None
    xsd_artifact_id: int | None = None
    fca_artifact_id: int | None = None
    functional_spec_artifact_id: int | None = None
    model: str | None = None
    user_context: str | None = None
    workflow_id: int | None = None


class XmlValidateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    project_id: str
    report_xml_artifact_id: int | None = None
    xsd_artifact_id: int | None = None
    fca_artifact_id: int | None = None
    data_artifact_id: int | None = None
    data_model_artifact_id: int | None = None
    functional_spec_artifact_id: int | None = None
    model: str | None = None
    user_context: str | None = None
    workflow_id: int | None = None
    compact: bool = True
    include_raw: bool = False
