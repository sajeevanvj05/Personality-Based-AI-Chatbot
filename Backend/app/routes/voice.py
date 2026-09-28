import asyncio
import os
import tempfile
import hashlib
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.crud.voice import get_voice_profile, upsert_voice_profile
from app.crud.personality import get_personality_profile
from app.schemas.voice import VoiceEnrollResponse, VoicePromptsResponse, VoiceSpeakRequest, VoiceToTextResponse
from app.utils.deps import get_current_user
from app.utils.openai_client import get_openai_client, get_openai_transcribe_model
from app.utils.storage import ensure_dir, get_storage_root
from app.utils.xtts import get_xtts


PROMPTS = [
    {
        "prompt_id": "sample_1",
        "text": "Hi, I am recording this audio sample to help the system learn my voice and create my digital twin.",
    },
    {
        "prompt_id": "sample_2",
        "text": "When I look back at my past experiences, I realize that every challenge was actually an opportunity in disguise.",
    },
    {
        "prompt_id": "sample_3",
        "text": "The specific rhythm, tone, and clear articulation of these words will allow the artificial intelligence to mimic exactly how I speak.",
    },
]


router = APIRouter(prefix="/voice", tags=["Voice"])


@router.get("/prompts", response_model=VoicePromptsResponse)
async def get_voice_prompts():
    # Public: frontend can display the 3 sentences without auth.
    return {"prompts": PROMPTS}


@router.post("/enroll", response_model=VoiceEnrollResponse, status_code=status.HTTP_201_CREATED)
async def enroll_voice(
    sample1: UploadFile = File(...),
    sample2: UploadFile = File(...),
    sample3: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload 3 short recordings to enroll a user's voice profile (tied to client_id).
    """
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=400, detail="User has no client_id")

    root = ensure_dir(get_storage_root() / "voices" / client_id)
    samples: list[dict] = []

    async def save_sample(sample_id: str, f: UploadFile) -> dict:
        data = await f.read()
        if not data:
            raise HTTPException(status_code=400, detail=f"{sample_id} is empty")

        # Save as .wav (we assume user uploads wav, but we don't strictly enforce here).
        filename = f"{sample_id}.wav"
        out_path = root / filename
        out_path.write_bytes(data)
        return {
            "sample_id": sample_id,
            "path": str(out_path.as_posix()),
            "filename": f.filename or filename,
            "content_type": f.content_type,
            "size_bytes": len(data),
        }

    samples.append(await save_sample("sample_1", sample1))
    samples.append(await save_sample("sample_2", sample2))
    samples.append(await save_sample("sample_3", sample3))

    # "Process" voice here: pick a reference wav and ensure the XTTS model is loaded.
    # (No expensive generation here; just prep so /voice/speak stays lightweight.)
    reference = max(samples, key=lambda s: s.get("size_bytes", 0))
    speaker_wav_path = reference["path"]
    reference_sample_id = reference["sample_id"]
    get_xtts()  # warm-load the model weights once per process

    profile = await upsert_voice_profile(
        user=current_user,
        language="en",
        samples=samples,
        speaker_wav_path=speaker_wav_path,
        reference_sample_id=reference_sample_id,
        personality_id=None,
        kind="user",
    )
    return {"message": "Voice samples uploaded successfully", "profile": profile}


@router.post("/enroll/famous", response_model=VoiceEnrollResponse, status_code=status.HTTP_201_CREATED)
async def enroll_famous_voice(
    personality_id: str = Form(...),
    clip1: UploadFile = File(...),
    clip2: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload 2 voice clips (recommended ~10 seconds each) for a specific personality_id.
    This is intended for famous-character personalities.
    """
    client_id = current_user.get("client_id")
    if not client_id:
        raise HTTPException(status_code=400, detail="User has no client_id")

    # Ensure the personality belongs to the current user.
    prof = await get_personality_profile(user=current_user, personality_id=personality_id)
    if not prof:
        raise HTTPException(status_code=404, detail="Personality not found")

    root = ensure_dir(get_storage_root() / "voices" / client_id / "personalities" / personality_id)
    samples: list[dict] = []

    async def save_sample(sample_id: str, f: UploadFile) -> dict:
        data = await f.read()
        if not data:
            raise HTTPException(status_code=400, detail=f"{sample_id} is empty")
        filename = f"{sample_id}.wav"
        out_path = root / filename
        out_path.write_bytes(data)
        return {
            "sample_id": sample_id,
            "path": str(out_path.as_posix()),
            "filename": f.filename or filename,
            "content_type": f.content_type,
            "size_bytes": len(data),
        }

    samples.append(await save_sample("clip_1", clip1))
    samples.append(await save_sample("clip_2", clip2))

    reference = max(samples, key=lambda s: s.get("size_bytes", 0))
    speaker_wav_path = reference["path"]
    reference_sample_id = reference["sample_id"]
    get_xtts()

    profile = await upsert_voice_profile(
        user=current_user,
        language="en",
        samples=samples,
        speaker_wav_path=speaker_wav_path,
        reference_sample_id=reference_sample_id,
        personality_id=personality_id,
        kind="famous",
    )
    return {"message": "Famous personality voice uploaded successfully", "profile": profile}


@router.post("/speak")
async def speak_with_enrolled_voice(
    payload: VoiceSpeakRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate TTS audio using the user's enrolled voice (XTTS).
    Returns a WAV file.
    """
    # If a personality_id is provided, try that voice profile first (famous personas).
    # Fallback to the user's base voice profile if missing.
    profile = await get_voice_profile(user=current_user, personality_id=payload.personality_id)
    if payload.personality_id and (not profile or not profile.get("samples")):
        profile = await get_voice_profile(user=current_user, personality_id=None)

    # Auto-sync using client_id: if there's no DB profile yet, but audio samples exist
    # on disk at storage/voices/<client_id>/, build the profile automatically so the
    # frontend only needs to call /voice/speak.
    if not profile or not profile.get("samples"):
        client_id = current_user.get("client_id")
        if not client_id:
            raise HTTPException(status_code=400, detail="User has no client_id")

        # If personality_id provided, check its folder first; else use base.
        if payload.personality_id:
            voices_dir = get_storage_root() / "voices" / client_id / "personalities" / payload.personality_id
        else:
            voices_dir = get_storage_root() / "voices" / client_id
        if voices_dir.exists():
            wav_files = sorted(voices_dir.glob("*.wav"))
        else:
            wav_files = []

        if wav_files:
            samples: list[dict] = []
            for p in wav_files:
                try:
                    size = p.stat().st_size
                except Exception:
                    size = 0
                samples.append(
                    {
                        "sample_id": p.stem,
                        "path": str(p.as_posix()),
                        "filename": p.name,
                        "content_type": "audio/wav",
                        "size_bytes": size,
                    }
                )

            reference = max(samples, key=lambda s: s.get("size_bytes", 0))
            speaker_wav_path = reference["path"]
            reference_sample_id = reference["sample_id"]

            # Warm-load model so the first /voice/speak isn't extra slow
            get_xtts()

            profile = await upsert_voice_profile(
                user=current_user,
                language=payload.language,
                samples=samples,
                speaker_wav_path=speaker_wav_path,
                reference_sample_id=reference_sample_id,
                personality_id=payload.personality_id,
                kind="famous" if payload.personality_id else "user",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No voice samples found. Enroll voice first.",
            )

    # /voice/speak should only do text->voice; reference voice is prepared during /voice/enroll.
    speaker_wav = profile.get("speaker_wav_path")
    if not speaker_wav or not Path(speaker_wav).exists():
        raise HTTPException(status_code=500, detail="Stored speaker_wav file is missing on disk")

    client_id = current_user.get("client_id") or "unknown"
    # Separate cache/output per personality to avoid mixing voices.
    out_dir = ensure_dir(
        get_storage_root()
        / "voice_outputs"
        / client_id
        / ("personalities" if payload.personality_id else "base")
        / (payload.personality_id or "default")
    )

    # Cache key: stable per client_id + voice profile version + language + text
    # If the voice profile changes, updated_at/reference_sample_id should change and invalidate the cache.
    profile_version = str(profile.get("updated_at") or "") + "|" + str(profile.get("reference_sample_id") or "")
    cache_key = f"{client_id}|{payload.personality_id or 'base'}|{profile_version}|{payload.language}|{payload.text}"
    digest = hashlib.sha256(cache_key.encode("utf-8")).hexdigest()[:32]
    out_path = out_dir / f"{digest}.wav"

    # Cache hit: return existing wav immediately
    if out_path.exists() and out_path.stat().st_size > 0:
        return FileResponse(
            path=str(out_path),
            media_type="audio/wav",
            filename="output.wav",
        )

    tts, _device = get_xtts()

    # XTTS is CPU/GPU heavy and blocking; run in a worker thread.
    await asyncio.to_thread(
        tts.tts_to_file,
        text=payload.text,
        speaker_wav=speaker_wav,
        language=payload.language,
        file_path=str(out_path),
    )

    return FileResponse(
        path=str(out_path),
        media_type="audio/wav",
        filename="output.wav",
    )


@router.post("/transcribe", response_model=VoiceToTextResponse, tags=["Voice to text"])
async def voice_to_text(
    audio: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload a voice clip and extract text using OpenAI Whisper (speech-to-text).
    """
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty")

    # Best-effort suffix for temporary file (helps OpenAI infer format).
    suffix = (Path(audio.filename).suffix if audio.filename else "") or ".wav"
    if len(suffix) > 10 or any(c in suffix for c in ["\\", "/", ":", "*", "?", "\"", "<", ">", "|"]):
        suffix = ".wav"

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        client = get_openai_client()
        model = get_openai_transcribe_model()

        def _transcribe():
            assert tmp_path is not None
            with open(tmp_path, "rb") as f:
                return client.audio.transcriptions.create(
                    model=model,
                    file=f,
                )

        resp = await asyncio.to_thread(_transcribe)

        text = ""
        # openai>=1.x returns an object with `.text`
        if hasattr(resp, "text"):
            text = (resp.text or "").strip()
        elif isinstance(resp, dict):
            text = (resp.get("text") or "").strip()

        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Voice to text failed: {e}")
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except Exception:
                pass

