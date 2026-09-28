import os

from openai import OpenAI
from dotenv import load_dotenv


def get_openai_client() -> OpenAI:
    """
    Creates an OpenAI client using environment variables.
    Requires OPENAI_API_KEY in your .env / environment.
    """
    # Ensure .env is loaded even if the app is started in a way that doesn't load it.
    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=api_key)


def get_openai_model() -> str:
    # Allow OPENAI_MODEL in .env, default to a reasonable chat model name.
    return os.getenv("OPENAI_MODEL", "gpt-4o-mini")


def get_openai_transcribe_model() -> str:
    """
    Speech-to-text model for audio transcription.
    Default: whisper-1 (compatible and widely available).
    """
    return os.getenv("OPENAI_TRANSCRIBE_MODEL", "whisper-1")

