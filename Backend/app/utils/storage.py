from __future__ import annotations

import os
from pathlib import Path


def get_storage_root() -> Path:
    # Local disk storage under project root
    root = os.getenv("STORAGE_ROOT", "storage")
    return Path(root)


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


