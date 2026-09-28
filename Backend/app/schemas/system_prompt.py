from datetime import datetime
from pydantic import BaseModel, Field


class SystemPromptLatestResponse(BaseModel):
    client_id: str
    personality_id: str | None = None
    system_prompt: str


class SystemPromptOut(BaseModel):
    id: str = Field(alias="_id")
    client_id: str
    personality_id: str | None = None
    created_at: datetime
    source_submission_id: str
    model: str | None = None
    system_prompt: str


class GenerateSystemPromptResponse(BaseModel):
    message: str
    prompt: SystemPromptOut

