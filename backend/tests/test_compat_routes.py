from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db import Base
from app.main import app
from app.models import AnalysisRun, Artifact, Workflow


def test_compat_routes_expose_frontend_shapes():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        client = TestClient(app)

        created = client.post(
            "/api/workflows",
            json={"project_id": "local-workspace", "workflow_name": "Compat WF", "version": "1.0"},
        )
        assert created.status_code == 200
        workflow_id = created.json()["id"]

        listed = client.get("/api/workflows", params={"project_id": "local-workspace"})
        assert listed.status_code == 200
        assert listed.json()["items"][0]["id"] == workflow_id

        dashboard = client.get("/api/dashboard/workspace-overview")
        assert dashboard.status_code == 200
        assert "stats" in dashboard.json()

        stage = client.get(f"/api/workflows/{workflow_id}/current-stage")
        assert stage.status_code == 200
        assert stage.json()["current_stage"] == "business_analyst"
        assert stage.json()["stage_progress"]["total_steps"] == 5

        steps = client.get(f"/api/workflows/{workflow_id}/stages/business_analyst/steps")
        assert steps.status_code == 200
        assert [step["step_key"] for step in steps.json()] == [
            "document-parser",
            "regulatory-diff",
            "dictionary-mapping",
            "gap-analysis",
            "requirement-structuring",
        ]

        with SessionLocal() as db:
            gap_run = AnalysisRun(
                project_id="local-workspace",
                run_type="gap_analysis",
                status="completed",
                input_json={"workflow_id": workflow_id},
                output_json={"rows": []},
            )
            spec_artifact = Artifact(
                project_id="local-workspace",
                kind="functional_spec",
                filename="functional_spec.json",
                file_path="functional_spec.json",
                extracted_json={"rows": [], "gap_run_id": 1},
            )
            db.add(gap_run)
            db.add(spec_artifact)
            db.commit()
            db.refresh(gap_run)
            db.refresh(spec_artifact)
            workflow = db.query(Workflow).filter(Workflow.id == workflow_id).one()
            workflow.latest_gap_run_id = gap_run.id
            workflow.functional_spec_artifact_id = spec_artifact.id
            db.commit()

        updated_steps = client.get(f"/api/workflows/{workflow_id}/stages/business_analyst/steps")
        assert updated_steps.status_code == 200
        assert all(step["status"] == "completed" for step in updated_steps.json())

        artifacts = client.get(f"/api/workflows/{workflow_id}/stages/business_analyst/artifacts")
        assert artifacts.status_code == 200
        assert artifacts.json()["artifacts"]["gap_reports"] == 1
        assert artifacts.json()["artifacts"]["requirement_reports"] == 1

        manual = client.post(f"/api/developer/workflows/{workflow_id}/steps/python-etl-generator", json={"actor": "dev.user"})
        assert manual.status_code == 200
        assert manual.json()["status"] == "completed"
        assert manual.json()["result"]["status"] == "completed"

        fallback_gap = client.post(
            "/v1/gap-analysis/run",
            json={
                "project_id": "local-workspace",
                "workflow_id": workflow_id,
                "regulatory_diff": {"differences": [{"field": "Capital amount"}]},
                "dictionary_mapping": {"mappings": [{"field": "Capital amount", "status": "Partial Match"}]},
            },
        )
        assert fallback_gap.status_code == 200
        assert fallback_gap.json()["ok"] is True
        assert fallback_gap.json()["functional_spec_artifact_id"]

        assigned = client.post(
            f"/api/workflows/{workflow_id}/assign",
            json={"assigned_to_user_id": "dev.user", "current_stage": "development"},
        )
        assert assigned.status_code == 200
        assert assigned.json()["current_stage"] == "developer"

        sql_step = client.post(f"/api/developer/{workflow_id}/steps/sql-generator", json={"schema": {"tables": []}})
        assert sql_step.status_code == 200
        assert sql_step.json()["result"]["run_id"]

        xml_step = client.post(f"/api/developer/{workflow_id}/steps/deterministic-mapping", json={"output_format": "xml"})
        assert xml_step.status_code == 200
        assert xml_step.json()["result"]["report_xml_artifact_id"]

        review_assigned = client.post(
            f"/api/workflows/{workflow_id}/assign",
            json={"assigned_to_user_id": "reviewer.user", "current_stage": "reviewer"},
        )
        assert review_assigned.status_code == 200
        assert review_assigned.json()["current_stage"] == "reviewer"

        validation_step = client.post(f"/api/analyst/{workflow_id}/steps/validation", json={"rule_set": "standard"})
        assert validation_step.status_code == 200
        assert validation_step.json()["result"]["run_id"]

        documents = client.get("/api/documents", params={"project_id": "local-workspace"})
        assert documents.status_code == 200
        assert documents.json()["documents"] == []

        llm = client.get("/api/llm-config/current")
        assert llm.status_code == 200
        assert llm.json()["is_active"] is True
    finally:
        app.dependency_overrides.clear()
