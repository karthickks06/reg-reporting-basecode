from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db import Base
from app.main import app


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

        documents = client.get("/api/documents", params={"project_id": "local-workspace"})
        assert documents.status_code == 200
        assert documents.json()["documents"] == []

        llm = client.get("/api/llm-config/current")
        assert llm.status_code == 200
        assert llm.json()["is_active"] is True
    finally:
        app.dependency_overrides.clear()
