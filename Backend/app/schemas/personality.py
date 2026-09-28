from datetime import datetime
from pydantic import BaseModel, Field

from app.schemas.system_prompt import SystemPromptOut


class PersonalityProfileCreateIn(BaseModel):
    display_name: str | None = Field(default=None, description="Optional friendly name for this personality")


class PersonalityProfileUpdateIn(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=80, description="New name for the personality")


class FamousPersonalityStartIn(BaseModel):
    famous_name: str = Field(..., min_length=2, max_length=80, description="Famous person to base this personality on")
    display_name: str | None = Field(default=None, max_length=80, description="Optional name for this personality")


class FamousPersonalityStartResponse(BaseModel):
    message: str
    personality_id: str
    session_id: str
    famous_name: str
    reply: str


class FamousPersonalityChatIn(BaseModel):
    personality_id: str = Field(..., min_length=4, description="Personality ID to continue building")
    message: str = Field(..., min_length=1, description="User message for the builder chat")


class FamousPersonalityChatResponse(BaseModel):
    personality_id: str
    session_id: str
    reply: str


class FamousPersonalityGeneratePromptIn(BaseModel):
    personality_id: str = Field(..., min_length=4)


class FamousPersonalityGeneratePromptResponse(BaseModel):
    message: str
    personality_id: str
    prompt: SystemPromptOut


class IdentifyFamousPersonIn(BaseModel):
    text: str = Field(..., min_length=3, max_length=2000, description="Quote/snippet/description to identify the person")


class IdentifyFamousPersonCandidate(BaseModel):
    name: str
    confidence: float = Field(..., ge=0, le=1)
    reason: str
    notes: str | None = None


class IdentifyFamousPersonResponse(BaseModel):
    best_guess_name: str
    candidates: list[IdentifyFamousPersonCandidate]
    needs_more_info: bool
    followup_question: str | None = None


class PersonalityProfileOut(BaseModel):
    id: str = Field(alias="_id")
    client_id: str
    personality_id: str
    display_name: str | None = None
    created_at: datetime


class PersonalityProfilesResponse(BaseModel):
    profiles: list[PersonalityProfileOut]


class PersonalityQuestionOut(BaseModel):
    question_id: str
    part: str
    question: str


class PersonalityQuestionsResponse(BaseModel):
    question_set_id: str
    personality_id: str
    questions: list[PersonalityQuestionOut]


class PersonalityAnswerIn(BaseModel):
    question_id: str = Field(..., description="Stable ID for the question being answered")
    answer: str = Field(..., min_length=1, description="User's free-text answer")


class PersonalitySubmissionIn(BaseModel):
    question_set_id: str = Field(..., description="ID of the question set the user answered")
    personality_id: str | None = Field(default=None, description="Optional; inferred from question_set_id if omitted")
    answers: list[PersonalityAnswerIn] = Field(..., min_length=1)


class PersonalityAnswerOut(BaseModel):
    question_id: str
    question: str
    answer: str


class PersonalitySectionOut(BaseModel):
    part: str
    answers: list[PersonalityAnswerOut]


class PersonalitySectionsOnlyResponse(BaseModel):
    sections: list[PersonalitySectionOut]


class PersonalitySubmissionOut(BaseModel):
    id: str = Field(alias="_id")
    client_id: str
    personality_id: str | None = None
    username: str
    created_at: datetime
    answers: list[PersonalityAnswerOut]
    sections: list[PersonalitySectionOut] | None = None


class PersonalitySubmitResponse(BaseModel):
    message: str
    submission: PersonalitySubmissionOut
    prompt: SystemPromptOut | None = None

