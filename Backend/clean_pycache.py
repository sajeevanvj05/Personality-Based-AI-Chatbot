import os
import shutil
from pathlib import Path


def remove_pycache(root: Path) -> None:
    """Recursively remove all __pycache__ directories under root.

    Skips common virtualenv folders to avoid touching installed packages.
    """
    skip_dirs = {".venv", "venv", "env"}

    for current_root, dirs, files in os.walk(root):
        # Skip virtualenv-like directories entirely
        parts = set(Path(current_root).parts)
        if parts & skip_dirs:
            continue

        # Work on a copy of dirs so we can modify it safely
        for d in list(dirs):
            if d == "__pycache__":
                cache_path = Path(current_root) / d
                try:
                    shutil.rmtree(cache_path)
                    print(f"Removed: {cache_path}")
                except Exception as exc:  # noqa: BLE001
                    print(f"Failed to remove {cache_path}: {exc}")
                # Prevent descending into this directory
                dirs.remove(d)


if __name__ == "__main__":
    project_root = Path(__file__).resolve().parent
    print(f"Cleaning __pycache__ under: {project_root}")
    remove_pycache(project_root)
    print("Done.")
