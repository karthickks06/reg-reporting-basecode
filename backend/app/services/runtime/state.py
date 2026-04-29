from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

STARTUP_STATE: dict[str, Any] = {
    "state": "not_started",
    "started_at": None,
    "completed_at": None,
    "steps": [],
    "errors": [],
}


def build_troubleshooting_steps(topic: str) -> list[str]:
    """Build troubleshooting guidance for the requested startup topic."""
    if topic == "database":
        return [
            "Verify DATABASE_URL points to a reachable PostgreSQL instance.",
            "If using local containers, run .\\start-local.ps1 or confirm the postgres container is healthy.",
            "For AWS, verify the RDS security group and database name exist.",
        ]
    if topic == "chroma":
        return [
            "Confirm the Chroma service is running and reachable from the backend.",
            "Check CHROMA_HOST, CHROMA_PORT, and CHROMA_COLLECTION in the backend environment.",
            "Check /ready for degraded mode details before inviting users.",
        ]
    if topic == "schema-patches":
        return [
            "Review startup logs for the first failing schema patch.",
            "Confirm DATABASE_URL targets the intended environment before retrying startup.",
            "Inspect app_schema_patches to see which schema patches were already applied.",
        ]
    if topic == "llm":
        return [
            "Verify AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are set in backend/.env",
            "Confirm the Azure OpenAI endpoint is reachable from the host or container network.",
            "Verify the Azure OpenAI deployment name matches your Azure configuration.",
            "The API can remain usable in degraded mode while the LLM endpoint is offline.",
        ]
    return [
        "Inspect the startup logs for the failing step.",
        "Check /ready for dependency details.",
        "Review docs/19_STARTUP_TROUBLESHOOTING.md for recovery steps.",
    ]


def utc_now_iso() -> str:
    """Return the current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


def push_startup_step(name: str, status: str, detail: str) -> None:
    """Append a startup step update to the shared runtime state."""
    STARTUP_STATE["steps"].append(
        {
            "name": name,
            "status": status,
            "detail": detail,
            "at": utc_now_iso(),
        }
    )


def get_startup_state() -> dict[str, Any]:
    """Return the current startup status snapshot."""
    return deepcopy(STARTUP_STATE)


def reset_startup_state() -> None:
    """Reset the in-memory startup status snapshot."""
    STARTUP_STATE["state"] = "starting"
    STARTUP_STATE["started_at"] = utc_now_iso()
    STARTUP_STATE["completed_at"] = None
    STARTUP_STATE["steps"] = []
    STARTUP_STATE["errors"] = []
