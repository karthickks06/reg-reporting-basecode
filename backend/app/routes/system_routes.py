from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.llm_client import call_axet_chat
from app.services.runtime_health_service import collect_runtime_health
from app.services.llm_service import llm_content

router = APIRouter()

@router.get("/health")
async def health():
    """Return the basic service health status."""
    return await collect_runtime_health()


@router.get("/ready")
async def ready():
    """Return the readiness status for runtime dependencies."""
    return await collect_runtime_health()


@router.get("/v1/llm/health")
async def llm_health():
    """Return the current health status of the LLM integration."""
    health_payload = await collect_runtime_health()
    up = bool(health_payload.get("llm_up"))
    return {"ok": up, "llm_up": up}


class LlmProxyRequest(BaseModel):
    messages: list[dict]
    model: str | None = None
    request_id: str | None = None


@router.post("/v1/llm/chat")
async def llm_chat(req: LlmProxyRequest):
    """Proxy a chat request through the configured LLM gateway."""
    try:
        resp = await call_axet_chat(messages=req.messages, request_id=req.request_id, model=req.model or settings.azure_openai_deployment)
        return {"ok": True, "raw": resp, "content": llm_content(resp)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"llm_chat_failed: {exc}") from exc
