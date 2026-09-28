import json
from datetime import datetime

from app.utils.openai_client import get_openai_client, get_openai_model


TOOL_SPEC = {
    "type": "function",
    "function": {
        "name": "build_famous_person_system_prompt",
        "description": (
            "Create a safe, high-quality system prompt that makes a chatbot imitate a famous person's public persona "
            "(communication style, tone, typical phrasing, values), without claiming to be the real person."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "system_prompt": {"type": "string"},
                "style_rules": {"type": "array", "items": {"type": "string"}},
                "personality_summary": {"type": "string"},
                "safety_notes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Any key safety constraints applied (e.g., avoid defamation, don't impersonate identity).",
                },
            },
            "required": ["system_prompt"],
            "additionalProperties": False,
        },
    },
}


def _format_builder_chat(*, famous_name: str, messages: list[dict]) -> str:
    lines: list[str] = []
    lines.append(f"Target famous person: {famous_name}")
    lines.append("")
    lines.append("Builder chat transcript:")
    lines.append("")
    for m in messages:
        role = (m.get("role") or "").strip() or "unknown"
        content = (m.get("content") or "").strip()
        if not content:
            continue
        lines.append(f"{role.upper()}: {content}")
    return "\n".join(lines).strip()


def generate_system_prompt_from_famous_builder_chat(*, famous_name: str, messages: list[dict]) -> dict:
    """
    Calls OpenAI with function-calling to generate a structured system prompt from the builder chat transcript.
    Returns dict with at least 'system_prompt'.
    """
    client = get_openai_client()
    model = get_openai_model()

    input_text = _format_builder_chat(famous_name=famous_name, messages=messages)

    system_instructions = (
        "You are an expert prompt engineer.\n"
        "Goal: produce a system prompt for a chatbot that imitates the PUBLIC persona of the target famous person.\n\n"
        "Constraints:\n"
        "- Do NOT claim to be the real person; do not say 'I am <name>'.\n"
        "- Do NOT generate private facts; use only public persona traits.\n"
        "- Avoid defamation; keep it safe and non-harmful.\n"
        "- Provide actionable style rules (tone, brevity, punctuation, slang, typical structure).\n"
        "- The system prompt must be directly usable as the single system message for a chat model.\n"
    )

    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_instructions},
            {"role": "user", "content": input_text},
        ],
        tools=[TOOL_SPEC],
        tool_choice={"type": "function", "function": {"name": "build_famous_person_system_prompt"}},
        temperature=0.6,
    )

    msg = resp.choices[0].message
    tool_calls = getattr(msg, "tool_calls", None) or []
    if not tool_calls:
        content = (msg.content or "").strip()
        if not content:
            raise RuntimeError("OpenAI returned no tool call and no content")
        return {"system_prompt": content, "model": model, "generated_at": datetime.utcnow().isoformat()}

    data = json.loads(tool_calls[0].function.arguments)
    data["model"] = model
    data["generated_at"] = datetime.utcnow().isoformat()
    return data


