from fastapi import APIRouter, Depends, HTTPException, status, Query
from uuid import uuid4

from app.crud.personality import (
    create_personality_profile,
    create_personality_question_set,
    create_personality_submission,
    create_personality_system_prompt,
    create_famous_builder_chat_session,
    get_latest_famous_builder_chat_session,
    append_famous_builder_chat_message,
    get_latest_personality_submission,
    get_latest_personality_system_prompt,
    get_latest_personality_question_set,
    get_personality_question_set_by_id,
    get_personality_submission_by_question_set_id,
    list_personality_profiles,
    list_personality_profiles_by_client_id,
    update_personality_profile_name,
)
from app.schemas.personality import (
    PersonalityProfileCreateIn,
    PersonalityProfileUpdateIn,
    PersonalityProfilesResponse,
    FamousPersonalityStartIn,
    FamousPersonalityStartResponse,
    FamousPersonalityChatIn,
    FamousPersonalityChatResponse,
    FamousPersonalityGeneratePromptIn,
    FamousPersonalityGeneratePromptResponse,
    IdentifyFamousPersonIn,
    IdentifyFamousPersonResponse,
    PersonalitySubmissionIn,
    PersonalityQuestionsResponse,
    PersonalitySectionsOnlyResponse,
    PersonalitySubmissionOut,
    PersonalitySubmitResponse,
)
from app.schemas.system_prompt import GenerateSystemPromptResponse, SystemPromptLatestResponse, SystemPromptOut
from app.utils.chat_completion import generate_chat_reply
from app.utils.deps import get_current_user
from app.utils.famous_person_identify import identify_famous_person_from_text
from app.utils.famous_personality_prompt import generate_system_prompt_from_famous_builder_chat
from app.utils.personality_questions import generate_personality_questions
from app.utils.personality_prompt import generate_system_prompt_from_submission


router = APIRouter(prefix="/personality", tags=["Personality"])

@router.get("/profiles", response_model=PersonalityProfilesResponse)
async def get_personality_profiles(current_user: dict = Depends(get_current_user)):
    profiles = await list_personality_profiles(user=current_user)
    return {"profiles": profiles}


@router.get("/profiles/by-client/{client_id}", response_model=PersonalityProfilesResponse)
async def get_personality_profiles_by_client_id(client_id: str, current_user: dict = Depends(get_current_user)):
    """
    Return all personalities for a given client_id.
    Security: only allow requesting your own client_id.
    """
    if not current_user.get("client_id") or current_user.get("client_id") != client_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for this client_id")
    profiles = await list_personality_profiles_by_client_id(client_id=client_id)
    return {"profiles": profiles}


@router.post("/profiles", status_code=status.HTTP_201_CREATED)
async def create_profile(payload: PersonalityProfileCreateIn, current_user: dict = Depends(get_current_user)):
    doc = await create_personality_profile(user=current_user, display_name=payload.display_name)
    return {"message": "Personality created", "profile": doc}


@router.patch("/profiles/{personality_id}")
async def rename_personality(
    personality_id: str,
    payload: PersonalityProfileUpdateIn,
    current_user: dict = Depends(get_current_user),
):
    """
    Update the display name of an existing personality.
    """
    doc = await update_personality_profile_name(
        user=current_user,
        personality_id=personality_id,
        display_name=payload.display_name.strip(),
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Personality not found")
    return {"message": "Personality updated", "profile": doc}


@router.post("/famous/start", response_model=FamousPersonalityStartResponse, status_code=status.HTTP_201_CREATED)
async def start_famous_personality(payload: FamousPersonalityStartIn, current_user: dict = Depends(get_current_user)):
    """
    Start creating a new personality based on a famous person's public persona via a builder chat.
    Creates: personality profile + builder chat session.
    """
    personality_id = uuid4().hex
    display_name = payload.display_name or f"{payload.famous_name} (inspired)"

    try:
        await create_personality_profile(user=current_user, personality_id=personality_id, display_name=display_name)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create profile: {e}")

    try:
        session = await create_famous_builder_chat_session(
            user=current_user,
            personality_id=personality_id,
            famous_name=payload.famous_name,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to start chat session: {e}")

    # First assistant message: guide user on what info to provide to approximate the persona.
    builder_system_prompt = (
        "You are a helpful assistant helping the user build a chatbot persona inspired by a famous person's PUBLIC persona.\n"
        "Ask concise clarifying questions about tone, topics, mannerisms, and boundaries.\n"
        "Do not claim you are the real person. Keep it safe.\n"
    )
    seed_user = (
        f"We are creating a chatbot persona inspired by: {payload.famous_name}.\n"
        "Ask me 3 short questions to clarify which era/style and what to emphasize (tone, humor, formality, typical topics)."
    )
    try:
        first = generate_chat_reply(system_prompt=builder_system_prompt, user_message=seed_user)
        reply = first.get("reply", "").strip()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate starter message: {e}")

    # Store the initial assistant reply in the transcript.
    await append_famous_builder_chat_message(
        user=current_user,
        session_id=session.get("_id"),
        personality_id=personality_id,
        role="assistant",
        content=reply,
    )

    return {
        "message": "Famous personality builder started",
        "personality_id": personality_id,
        "session_id": session.get("_id"),
        "famous_name": payload.famous_name,
        "reply": reply,
    }


@router.post("/famous/identify", response_model=IdentifyFamousPersonResponse)
async def identify_famous_person(payload: IdentifyFamousPersonIn, current_user: dict = Depends(get_current_user)):
    """
    If user doesn't know the famous person's name, identify candidates from a quote/snippet/description.
    """
    try:
        result = identify_famous_person_from_text(text=payload.text, language="English")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to identify person: {e}")

    return {
        "best_guess_name": result.get("best_guess_name", ""),
        "candidates": result.get("candidates", []),
        "needs_more_info": bool(result.get("needs_more_info")),
        "followup_question": result.get("followup_question") or None,
    }


@router.post("/famous/chat", response_model=FamousPersonalityChatResponse)
async def famous_personality_chat(payload: FamousPersonalityChatIn, current_user: dict = Depends(get_current_user)):
    """
    Continue the builder chat for a famous-person-based personality.
    Stores transcript and returns next assistant reply.
    """
    session = await get_latest_famous_builder_chat_session(user=current_user, personality_id=payload.personality_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No builder session found for this personality")

    user_text = payload.message.strip()
    if not user_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty")

    await append_famous_builder_chat_message(
        user=current_user,
        session_id=session.get("_id"),
        personality_id=payload.personality_id,
        role="user",
        content=user_text,
    )

    builder_system_prompt = (
        "You are a helpful assistant helping the user build a chatbot persona inspired by a famous person's PUBLIC persona.\n"
        "Ask clarifying questions and summarize what you learned.\n"
        "When enough info is collected, tell the user they can generate the system prompt.\n"
        "Do not claim you are the real person. Keep it safe.\n"
    )

    try:
        result = generate_chat_reply(system_prompt=builder_system_prompt, user_message=user_text)
        reply = (result.get("reply") or "").strip()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Chat failed: {e}")

    await append_famous_builder_chat_message(
        user=current_user,
        session_id=session.get("_id"),
        personality_id=payload.personality_id,
        role="assistant",
        content=reply,
    )

    return {"personality_id": payload.personality_id, "session_id": session.get("_id"), "reply": reply}


@router.post(
    "/famous/system-prompt/generate",
    response_model=FamousPersonalityGeneratePromptResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_famous_personality_system_prompt(
    payload: FamousPersonalityGeneratePromptIn,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate and store the system prompt for a famous-person-based personality from the builder chat transcript.
    """
    session = await get_latest_famous_builder_chat_session(user=current_user, personality_id=payload.personality_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No builder session found for this personality")

    famous_name = (session.get("famous_name") or "").strip()
    messages = session.get("messages") or []

    # Use the transcript to generate a system prompt.
    try:
        generated = generate_system_prompt_from_famous_builder_chat(
            famous_name=famous_name or "Unknown",
            messages=messages,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate system prompt: {e}")

    prompt_doc = await create_personality_system_prompt(
        user=current_user,
        source_submission_id=session.get("_id"),
        system_prompt=generated.get("system_prompt", ""),
        model=generated.get("model"),
        personality_id=payload.personality_id,
        metadata={
            "source": "famous_builder_chat",
            "famous_name": famous_name,
            "style_rules": generated.get("style_rules"),
            "personality_summary": generated.get("personality_summary"),
            "safety_notes": generated.get("safety_notes"),
        },
    )

    return {
        "message": "Famous personality system prompt generated",
        "personality_id": payload.personality_id,
        "prompt": prompt_doc,
    }


@router.get("/questions", response_model=PersonalityQuestionsResponse)
async def get_personality_questions(current_user: dict = Depends(get_current_user)):
    """
    Generate a dynamic set of 15 questions via OpenAI function calling, persist it,
    and return it with a `question_set_id` so the client can submit answers reliably.
    """
    # IMPORTANT: In Next.js dev mode (React Strict Mode), effects can run twice,
    # which may call this endpoint twice. To prevent duplicate personalities,
    # we reuse the latest *unanswered* question set if it exists.
    latest = await get_latest_personality_question_set(user=current_user)
    if latest and latest.get("_id"):
        existing_submission = await get_personality_submission_by_question_set_id(
            user=current_user,
            question_set_id=str(latest["_id"]),
        )
        if not existing_submission:
            return {
                "personality_id": latest.get("personality_id") or "",
                "question_set_id": latest.get("_id"),
                "questions": latest.get("questions") or [],
            }

    try:
        generated = generate_personality_questions(language="English")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate personality questions: {e}",
        )

    questions = generated.get("questions", [])

    # Create a new personality_id for a new personality questionnaire run.
    personality_id = uuid4().hex
    try:
        # Default name until the user renames it after completing the questions.
        await create_personality_profile(user=current_user, personality_id=personality_id, display_name="Default")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create personality profile: {e}",
        )

    try:
        doc = await create_personality_question_set(
            user=current_user,
            questions=questions,
            model=generated.get("model"),
            personality_id=personality_id,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store personality question set: {e}",
        )

    return {"personality_id": personality_id, "question_set_id": doc.get("_id"), "questions": questions}


@router.get("/answers/latest", response_model=PersonalitySectionsOnlyResponse)
async def get_latest_personality_answers(
    current_user: dict = Depends(get_current_user),
    personality_id: str | None = Query(default=None),
):
    submission = await get_latest_personality_submission(user=current_user, personality_id=personality_id)
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No personality answers found for this user",
        )
    # Group answers into 3 main sections for easy UI rendering.
    section_order = [
        "Attitude & Worldview",
        "Personality (Big Five)",
        "Communication Style",
    ]
    sections_map: dict[str, list[dict]] = {name: [] for name in section_order}

    for a in submission.get("answers", []):
        qid = a.get("question_id")
        # Prefer stored `part` (recommended). If missing, keep it in "Other".
        part = a.get("part")
        if part not in sections_map:
            # If something unexpected sneaks in, keep it but don't break the response.
            sections_map.setdefault(part or "Other", [])

        sections_map[part or "Other"].append(
            {
                "question_id": qid,
                "question": a.get("question"),
                "answer": a.get("answer"),
            }
        )

    sections = [
        {"part": part, "answers": sections_map.get(part, [])} for part in section_order
    ] + (
        [{"part": "Other", "answers": sections_map.get("Other", [])}]
        if sections_map.get("Other")
        else []
    )
    return {"sections": sections}


@router.post("/system-prompt/generate", response_model=GenerateSystemPromptResponse, status_code=status.HTTP_201_CREATED)
async def generate_personality_system_prompt(
    current_user: dict = Depends(get_current_user),
    personality_id: str | None = Query(default=None),
):
    """
    Generates a dynamic system prompt for the personalized chatbot from the latest saved questionnaire answers,
    and stores it in MongoDB with the user's client_id.
    """
    submission = await get_latest_personality_submission(user=current_user, personality_id=personality_id)
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No personality answers found for this user. Submit answers first.",
        )

    try:
        generated = generate_system_prompt_from_submission(submission=submission)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate system prompt: {e}",
        )

    prompt_doc = await create_personality_system_prompt(
        user=current_user,
        source_submission_id=submission.get("_id"),
        system_prompt=generated.get("system_prompt", ""),
        model=generated.get("model"),
        personality_id=submission.get("personality_id"),
        metadata={
            "style_rules": generated.get("style_rules"),
            "personality_summary": generated.get("personality_summary"),
        },
    )

    return {"message": "System prompt generated successfully", "prompt": prompt_doc}


@router.get("/system-prompt/latest", response_model=SystemPromptLatestResponse)
async def get_latest_personality_system_prompt_endpoint(
    current_user: dict = Depends(get_current_user),
    personality_id: str | None = Query(default=None),
):
    prompt_doc = await get_latest_personality_system_prompt(user=current_user, personality_id=personality_id)
    if not prompt_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No system prompt found for this user. Generate one first.",
        )
    return {
        "client_id": prompt_doc.get("client_id"),
        "personality_id": prompt_doc.get("personality_id"),
        "system_prompt": prompt_doc.get("system_prompt"),
    }


@router.post(
    "/answers",
    response_model=PersonalitySubmitResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_personality_answers(
    payload: PersonalitySubmissionIn,
    current_user: dict = Depends(get_current_user),
):
    # Validate question IDs against the question set the UI fetched, and enrich with question text.
    question_set = await get_personality_question_set_by_id(
        user=current_user,
        question_set_id=payload.question_set_id,
    )
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired question_set_id. Please reload the questions.",
        )

    # Personality is inferred from the stored question set.
    personality_id = question_set.get("personality_id")
    if payload.personality_id and personality_id and payload.personality_id != personality_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="personality_id does not match the provided question_set_id",
        )

    question_map: dict[str, dict] = {
        q.get("question_id"): q for q in (question_set.get("questions") or []) if q.get("question_id")
    }

    enriched_answers: list[dict] = []
    for item in payload.answers:
        q = question_map.get(item.question_id)
        if not q:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown question_id: {item.question_id}",
            )
        enriched_answers.append(
            {
                "question_id": item.question_id,
                "part": q["part"],
                "question": q["question"],
                "answer": item.answer,
            }
        )

    submission = await create_personality_submission(
        user=current_user,
        answers=enriched_answers,
        personality_id=personality_id,
        question_set_id=payload.question_set_id,
    )

    # Immediately generate & store the personalized system prompt (same logic as
    # POST /personality/system-prompt/generate), so the client can start chatting
    # right after submitting answers.
    try:
        generated = generate_system_prompt_from_submission(submission=submission)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Answers saved but failed to generate system prompt: {e}",
        )

    prompt_doc = await create_personality_system_prompt(
        user=current_user,
        source_submission_id=submission.get("_id"),
        system_prompt=generated.get("system_prompt", ""),
        model=generated.get("model"),
        personality_id=submission.get("personality_id"),
        metadata={
            "style_rules": generated.get("style_rules"),
            "personality_summary": generated.get("personality_summary"),
        },
    )

    return {
        "message": "Answers submitted successfully (system prompt generated)",
        "submission": submission,
        "prompt": prompt_doc,
    }


