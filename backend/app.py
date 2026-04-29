"""
Local backend launcher.

Run with:
    python app.py

This starts the FastAPI API and the background job worker from one backend
terminal. The frontend still runs separately with `npm run dev`.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parent


def prepare_runtime() -> None:
    """Load backend-local settings no matter where the command is launched."""
    os.chdir(BACKEND_DIR)
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    env_file = BACKEND_DIR / ".env"
    if env_file.exists():
        load_dotenv(env_file, override=False)

    # Keep the app.py path runnable even before backend/.env has been created.
    os.environ.setdefault("ENVIRONMENT", "local-native")
    os.environ.setdefault("API_PORT", "8000")
    os.environ.setdefault("DATA_ROOT", "../data")
    os.environ.setdefault("DATABASE_URL", "sqlite:///../data/reg_reporting_local.db")
    os.environ.setdefault("VECTOR_STORE", "chroma")
    os.environ.setdefault("CHROMA_HOST", "")
    os.environ.setdefault("CHROMA_PERSIST_DIR", "../data/chroma")


def start_worker() -> subprocess.Popen:
    """Start the queue worker beside the API server."""
    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND_DIR)
    return subprocess.Popen(
        [sys.executable, "start_worker.py"],
        cwd=BACKEND_DIR,
        env=env,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    )


def stop_worker(worker: subprocess.Popen | None) -> None:
    """Stop the queue worker when the API process exits."""
    if worker is None or worker.poll() is not None:
        return

    if os.name == "nt":
        worker.send_signal(signal.CTRL_BREAK_EVENT)
    else:
        worker.terminate()

    try:
        worker.wait(timeout=8)
    except subprocess.TimeoutExpired:
        worker.kill()
        worker.wait(timeout=5)


def main() -> None:
    prepare_runtime()

    from app.config import settings
    import uvicorn

    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", str(settings.api_port)))
    log_level = str(settings.app_log_level or "INFO").lower()

    worker = start_worker()
    print("=" * 72)
    print("Reg Reporting AI Platform backend")
    print(f"API:    http://localhost:{port}")
    print(f"Docs:   http://localhost:{port}/docs")
    print(f"Ready:  http://localhost:{port}/ready")
    print(f"Worker: started with pid {worker.pid}")
    print("=" * 72)

    try:
        uvicorn.run(
            "app.main:app",
            host=host,
            port=port,
            reload=False,
            log_level=log_level,
        )
    finally:
        stop_worker(worker)


if __name__ == "__main__":
    main()
