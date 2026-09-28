import json
from datetime import datetime

from app.utils.openai_client import get_openai_client, get_openai_model


TOOL_SPEC = {
    "type": "function",
    "function": {
        "name": "identify_famous_person",
        "description": "Identify likely famous person(s) from a quote, writing style snippet, or description.",
        "parameters": {
            "type": "object",
            "properties": {
                "best_guess_name": {
                    "type": "string",
                    "description": "Most likely famous person name (or empty string if unknown).",
                },
                "candidates": {
                    "type": "array",
                    "description": "Top candidates, best first (max 5).",
                    "maxItems": 5,
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "confidence": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1,
                                "description": "Model confidence 0..1 (heuristic).",
                            },
                            "reason": {"type": "string", "description": "Short reason for the guess (1-2 sentences)."},
                            "notes": {
                                "type": "string",
                                "description": "Optional extra info (e.g., era, domain) that could help disambiguate.",
                            },
                        },
                        "required": ["name", "confidence", "reason"],
                        "additionalProperties": False,
                    },
                },
                "needs_more_info": {
                    "type": "boolean",
                    "description": "True if the evidence is weak and you need more text or context.",
                },
                "followup_question": {
                    "type": "string",
                    "description": "If needs_more_info=true, ask one helpful question to narrow it down.",
                },
            },
            "required": ["best_guess_name", "candidates", "needs_more_info"],
            "additionalProperties": False,
        },
    },
}


def identify_famous_person_from_text(*, text: str, language: str = "English") -> dict:
    """
    Uses OpenAI tool/function calling to identify likely famous persons from a quote/description.
    Returns structured data suitable for UI selection.
    """
    client = get_openai_client()
    model = get_openai_model()

    snippet = (text or "").strip()
    if not snippet:
        raise ValueError("Empty text")

    resp = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert at identifying famous persons from a quote or style snippet.\n"
                    "Rules:\n"
                    "- Only guess if reasonably confident.\n"
                    "- Provide up to 5 candidates with short reasons.\n"
                    "- Do not fabricate citations or URLs.\n"
                    "- If evidence is weak, set needs_more_info=true and ask ONE follow-up question.\n"
                    "- Output MUST be a tool call.\n"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Language: {language}\n"
                    "Identify the famous person from this quote/description:\n\n"
                    f"{snippet}"
                ),
            },
        ],
        tools=[TOOL_SPEC],
        tool_choice={"type": "function", "function": {"name": "identify_famous_person"}},
        temperature=0.2,
    )

    msg = resp.choices[0].message
    tool_calls = getattr(msg, "tool_calls", None) or []
    if not tool_calls:
        raise RuntimeError("OpenAI returned no tool call")

    data = json.loads(tool_calls[0].function.arguments)

    # Basic normalization
    candidates = data.get("candidates") or []
    candidates = [c for c in candidates if (c.get("name") or "").strip()]
    for c in candidates:
        c["name"] = (c.get("name") or "").strip()
        c["reason"] = (c.get("reason") or "").strip()
        c["notes"] = (c.get("notes") or "").strip() if c.get("notes") else ""
        try:
            c["confidence"] = float(c.get("confidence", 0))
        except Exception:
            c["confidence"] = 0.0

    best_guess_name = (data.get("best_guess_name") or "").strip()
    needs_more_info = bool(data.get("needs_more_info"))
    followup = (data.get("followup_question") or "").strip()

    return {
        "best_guess_name": best_guess_name,
        "candidates": candidates[:5],
        "needs_more_info": needs_more_info,
        "followup_question": followup,
        "model": model,
        "generated_at": datetime.utcnow().isoformat(),
    }


