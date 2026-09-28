from datetime import datetime
from pydantic import BaseModel, Field


class VoicePrompt(BaseModel):
    prompt_id: str
    text: str


class VoicePromptsResponse(BaseModel):
    prompts: list[VoicePrompt]


class VoiceSampleInfo(BaseModel):
    sample_id: str
    path: str
    filename: str
    content_type: str | None = None
    size_bytes: int


class VoiceProfileOut(BaseModel):
    id: str = Field(alias="_id")
    client_id: str
    personality_id: str | None = None
    username: str | None = None
    created_at: datetime
    updated_at: datetime
    language: str
    samples: list[VoiceSampleInfo]
    speaker_wav_path: str | None = None
    reference_sample_id: str | None = None
    status: str
    kind: str | None = None


class VoiceEnrollResponse(BaseModel):
    message: str
    profile: VoiceProfileOut


class VoiceSpeakRequest(BaseModel):
    text: str = Field(..., min_length=1)
    language: str = Field(default="en")
    personality_id: str | None = Field(default=None, description="Optional personality_id for per-personality voice")


class VoiceToTextResponse(BaseModel):
    text: str
    

