import json
from datetime import datetime

from app.utils.openai_client import get_openai_client, get_openai_model


TOOL_SPEC = {
    "type": "function",
    "function": {
        "name": "build_personalized_system_prompt",
        "description": "Create a high-quality system prompt that makes the chatbot mimic the user's personality, attitude, and communication style.",
        "parameters": {
            "type": "object",
            "properties": {
                "system_prompt": {
                    "type": "string",
                    "description": "The final system prompt to use for the personalized chatbot.",
                },
                "style_rules": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Concrete rules for tone, wording, emojis/slang, sentence length, and how to react under stress.",
                },
                "personality_summary": {
                    "type": "string",
                    "description": "Short summary of inferred traits based on the questionnaire.",
                },
            },
            "required": ["system_prompt"],
            "additionalProperties": False,
        },
    },
}


def _format_answers_for_llm(submission: dict) -> str:
    """
    Convert the stored submission into a clear prompt input.
    Expects submission['answers'] items with: part, question, answer, question_id
    """
    lines: list[str] = []
    lines.append("Questionnaire Answers (grouped by section):")
    lines.append("")

    answers = submission.get("answers") or []
    # Keep stable order by part then question_id if present.
    def sort_key(a: dict):
        return (a.get("part") or "", a.get("question_id") or "")

    for a in sorted(answers, key=sort_key):
        part = a.get("part") or "Unknown"
        qid = a.get("question_id") or "unknown_id"
        q = a.get("question") or ""
        ans = a.get("answer") or ""
        lines.append(f"[{part}] ({qid}) Q: {q}")
        lines.append(f"A: {ans}")
        lines.append("")

    return "\n".join(lines).strip()


def generate_system_prompt_from_submission(*, submission: dict) -> dict:
    """
    Calls OpenAI with function-calling to generate a structured system prompt.
    Returns dict with at least 'system_prompt'.
    """
    client = get_openai_client()
    model = get_openai_model()

    input_text = _format_answers_for_llm(submission)

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert prompt engineer.\n"
                "Given a user's questionnaire answers, produce a system prompt that makes a chatbot mimic the user's:\n"
                "- attitude & worldview\n"
                "- communication style (slang/emojis/sentence structure)\n"
                "- Big Five personality tendencies\n\n"
                "Constraints:\n"
                "- Do NOT mention that you used a questionnaire.\n"
                "- Do NOT reveal private analysis.\n"
                "- The system prompt must be directly usable as the single system message for a chat model.\n"
                "- Include actionable style rules (how long responses should be, how to apologize, how to disagree, etc.).\n"
                "- Keep it safe and non-harmful.\n"
            ),
        },
        {"role": "user", "content": input_text},
    ]

    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        tools=[TOOL_SPEC],
        tool_choice={"type": "function", "function": {"name": "build_personalized_system_prompt"}},
        temperature=0.7,
    )

    msg = resp.choices[0].message
    tool_calls = getattr(msg, "tool_calls", None) or []
    if not tool_calls:
        # Fallback: accept raw content.
        content = (msg.content or "").strip()
        if not content:
            raise RuntimeError("OpenAI returned no tool call and no content")
        return {
            "system_prompt": content,
            "model": model,
            "generated_at": datetime.utcnow().isoformat(),
        }

    args_text = tool_calls[0].function.arguments
    data = json.loads(args_text)
    data["model"] = model
    data["generated_at"] = datetime.utcnow().isoformat()
    return data


