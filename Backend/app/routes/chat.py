from fastapi import APIRouter, Depends, HTTPException, status, Query

from app.crud.personality import get_latest_personality_system_prompt
from app.schemas.chat import ChatRequest, ChatResponse
from app.utils.chat_completion import generate_chat_reply
from app.utils.deps import get_current_user


router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    current_user: dict = Depends(get_current_user),
    personality_id: str | None = Query(default=None),
):
    """
    Chat with the user's personalized chatbot.
    Uses the latest system prompt (same data as `/personality/system-prompt/latest`) and
    OpenAI function-calling to produce a clean `reply` string.
    """
    prompt_doc = await get_latest_personality_system_prompt(user=current_user, personality_id=personality_id)
    if not prompt_doc or not prompt_doc.get("system_prompt"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No system prompt found for this user. Generate one first.",
        )

    # Hard rule: never include emojis in chat replies.
    system_prompt = (prompt_doc["system_prompt"] or "").rstrip() + "\n\nIMPORTANT: Do not use emojis."

    try:
        result = generate_chat_reply(
            system_prompt=system_prompt,
            user_message=payload.message,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat failed: {e}",
        )

    return {"reply": result.get("reply", "")}

