from fastapi import APIRouter

from app.api.routes.auth_routes import router as auth_router
from app.api.routes.admin_routes import router as admin_router
from app.api.routes.artifact_routes import router as artifact_router
from app.api.routes.ba_routes import router as ba_router
from app.api.routes.compat_routes import router as compat_router
from app.api.routes.dev_routes import router as dev_router
from app.api.routes.gate_config_routes import router as gate_config_router
from app.api.routes.integration_routes import router as integration_router
from app.api.routes.job_routes import router as job_router
from app.api.routes.logging_routes import router as logging_router
from app.api.routes.manager_routes import router as manager_router
from app.api.routes.rag_routes import router as rag_router
from app.api.routes.reviewer_routes import router as reviewer_router
from app.api.routes.system_routes import router as system_router
from app.api.routes.workflow_routes import router as workflow_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(auth_router, prefix="/api")
api_router.include_router(system_router)
api_router.include_router(rag_router)
api_router.include_router(artifact_router)
api_router.include_router(admin_router)
api_router.include_router(gate_config_router)
api_router.include_router(integration_router)
api_router.include_router(logging_router)
api_router.include_router(job_router)
api_router.include_router(ba_router)
api_router.include_router(compat_router)
api_router.include_router(dev_router)
api_router.include_router(reviewer_router)
api_router.include_router(workflow_router)
api_router.include_router(manager_router)

__all__ = ["api_router"]
