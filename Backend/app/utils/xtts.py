import os
import threading
from pathlib import Path

import torch
from TTS.api import TTS


_lock = threading.Lock()
_tts: TTS | None = None
_device: str | None = None


def get_xtts() -> tuple[TTS, str]:
    """
    Lazy-load XTTS once per process. This model is large; avoid reloading per request.
    """
    global _tts, _device
    if _tts is not None and _device is not None:
        return _tts, _device

    with _lock:
        if _tts is not None and _device is not None:
            return _tts, _device

        _device = "cuda" if torch.cuda.is_available() else "cpu"

        # Prefer loading from a local checked-in weights folder (your `ml_weights/xtts_v2`)
        # so voice cloning doesn't need to download anything at runtime.
        #
        # Set XTTS_MODEL_DIR to an absolute path or a path relative to the Chatbot folder.
        model_dir = os.getenv("XTTS_MODEL_DIR", "ml_weights/xtts_v2")
        model_dir_path = Path(model_dir)
        if not model_dir_path.is_absolute():
            # Resolve relative to the Chatbot project root (cwd is typically Chatbot/ when running uvicorn here)
            model_dir_path = (Path.cwd() / model_dir_path).resolve()

        config_path = model_dir_path / "config.json"
        model_file_path = model_dir_path / "model.pth"

        if config_path.exists() and model_file_path.exists():
            # Important for XTTS (TTS==0.22.0):
            # XTTS `load_checkpoint()` expects a *directory* (checkpoint_dir) and appends `model.pth` internally.
            # If we pass the file path, it becomes ".../model.pth/model.pth" and crashes.
            _tts = TTS(
                model_path=str(model_dir_path),  # directory containing model.pth, vocab.json, speakers_xtts.pth
                config_path=str(config_path),
            ).to(_device)
        else:
            # Fallback to the normal Coqui model name (will download if not present in cache)
            model_name = os.getenv("XTTS_MODEL_NAME", "tts_models/multilingual/multi-dataset/xtts_v2")
            _tts = TTS(model_name).to(_device)
        return _tts, _device


