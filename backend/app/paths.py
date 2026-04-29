from pathlib import Path

from app.config import settings

DATA_ROOT = Path(settings.data_root).expanduser().resolve()
ARTIFACT_ROOT = DATA_ROOT / "artifacts"
SYNTHETIC_ROOT = DATA_ROOT / "synthetic"
