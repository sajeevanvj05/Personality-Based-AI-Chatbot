import json

from app.utils.openai_client import get_openai_client, get_openai_model


CHAT_TOOL_SPEC = {
    "type": "function",
    "function": {
        "name": "respond_to_user",
        "description": "Return the assistant's final reply to the user.",
        "parameters": {
            "type": "object",
            "properties": {
                "reply": {"type": "string", "description": "Assistant reply text"},
            },
            "required": ["reply"],
            "additionalProperties": False,
        },
    },
}


def generate_chat_reply(*, system_prompt: str, user_message: str) -> dict:
    """
    Calls OpenAI using function/tool calling so we always get a clean 'reply' string.
    """
    client = get_openai_client()
    model = get_openai_model()

    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        tools=[CHAT_TOOL_SPEC],
        tool_choice={"type": "function", "function": {"name": "respond_to_user"}},
        temperature=0.7,
    )

    msg = resp.choices[0].message
    tool_calls = getattr(msg, "tool_calls", None) or []
    if tool_calls:
        data = json.loads(tool_calls[0].function.arguments)
        return {"reply": data["reply"], "model": model}

    # Fallback: accept raw content if tool calling isn't returned for any reason.
    content = (msg.content or "").strip()
    return {"reply": content, "model": model}


